// Generic Supabase-backed replacement for localStorage, shared by all pages
// (except ajiltan.html, which has its own dedicated ajiltanSupabase.js).
// API intentionally mirrors localStorage (getItem/setItem/removeItem) but is
// ASYNC (returns Promises) because it talks to the network. Every page must
// `await` these calls instead of calling localStorage synchronously.
//
// Ownership: every row is scoped to the currently authenticated Supabase Auth
// user (owner_id = auth.uid()), resolved automatically from the session -
// never from the URL, localStorage, sessionStorage, or any frontend variable.
// Callers do not pass owner_id; it is always the current signed-in user.
//
// Requires: supabaseConfig.js and the supabase-js CDN script loaded first,
// authClient.js loaded before this file (client reuse, avoids duplicate auth
// sessions), and the public.app_data table (owner_id/project_id/storage_key/
// data) already created in Supabase.
(function () {
  'use strict';

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) {
    console.error('AppData: Supabase is not configured. Check supabaseConfig.js and the supabase-js <script> include.');
    return;
  }

  // Reuse AuthClient's client if available so both modules see the same
  // auth session instance; fall back to creating one if loaded standalone.
  const client = (window.AuthClient && window.AuthClient.client)
    ? window.AuthClient.client
    : window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  const DEFAULT_PROJECT_ID = 'MAIN';

  // Thrown when an AppData operation is attempted with no authenticated
  // session. Callers can check `err.code === 'APPDATA_NO_AUTH'`.
  function noAuthError() {
    const err = new Error('AppData: no authenticated Supabase user; refusing to read/write app_data.');
    err.code = 'APPDATA_NO_AUTH';
    return err;
  }

  async function getOwnerId() {
    if (window.AuthClient && window.AuthClient.getCurrentUserId) {
      return window.AuthClient.getCurrentUserId();
    }
    const { data, error } = await client.auth.getUser();
    if (error) {
      console.error('AppData: failed to resolve authenticated user:', error);
      return null;
    }
    return data.user ? data.user.id : null;
  }

  async function getItem(key) {
    const ownerId = await getOwnerId();
    if (!ownerId) {
      console.error('AppData.getItem: no authenticated user; key "' + key + '" not read.');
      return null;
    }
    const { data, error } = await client
      .from('app_data')
      .select('data')
      .eq('owner_id', ownerId)
      .eq('project_id', DEFAULT_PROJECT_ID)
      .eq('storage_key', key)
      .maybeSingle();
    if (error) {
      console.error('AppData.getItem error for key "' + key + '":', error);
      return null;
    }
    return data ? data.data : null;
  }

  // Bulk-fetches every stored key starting with `prefix` (e.g. 'work-plan-')
  // in one request, scoped to the current user. Returns a plain object
  // { storage_key: data }. Useful for pages that used to synchronously read
  // many localStorage keys at once.
  async function getItemsByPrefix(prefix) {
    const ownerId = await getOwnerId();
    if (!ownerId) {
      console.error('AppData.getItemsByPrefix: no authenticated user; prefix "' + prefix + '" not read.');
      return {};
    }
    const { data, error } = await client
      .from('app_data')
      .select('storage_key, data')
      .eq('owner_id', ownerId)
      .eq('project_id', DEFAULT_PROJECT_ID)
      .like('storage_key', prefix + '%');
    if (error) {
      console.error('AppData.getItemsByPrefix error for prefix "' + prefix + '":', error);
      return {};
    }
    const result = {};
    (data || []).forEach(row => { result[row.storage_key] = row.data; });
    return result;
  }

  async function setItem(key, value) {
    const ownerId = await getOwnerId();
    if (!ownerId) {
      const err = noAuthError();
      console.error('AppData.setItem: no authenticated user; key "' + key + '" not written.');
      throw err;
    }
    const { error } = await client
      .from('app_data')
      .upsert(
        { owner_id: ownerId, project_id: DEFAULT_PROJECT_ID, storage_key: key, data: String(value) },
        { onConflict: 'owner_id,storage_key' }
      );
    if (error) {
      console.error('AppData.setItem error for key "' + key + '":', error);
      throw error;
    }
  }

  async function removeItem(key) {
    const ownerId = await getOwnerId();
    if (!ownerId) {
      const err = noAuthError();
      console.error('AppData.removeItem: no authenticated user; key "' + key + '" not removed.');
      throw err;
    }
    const { error } = await client
      .from('app_data')
      .delete()
      .eq('owner_id', ownerId)
      .eq('project_id', DEFAULT_PROJECT_ID)
      .eq('storage_key', key);
    if (error) {
      console.error('AppData.removeItem error for key "' + key + '":', error);
      throw error;
    }
  }

  // Live-syncs multiple tabs/devices for the current user: any change to
  // this user's app_data rows calls onChange so pages can refresh themselves.
  async function subscribeToChanges(onChange) {
    const ownerId = await getOwnerId();
    if (!ownerId) {
      console.error('AppData.subscribeToChanges: no authenticated user; not subscribing.');
      return null;
    }
    const channel = client
      .channel('app-data-' + ownerId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_data', filter: 'owner_id=eq.' + ownerId },
        onChange
      )
      .subscribe();
    return channel;
  }

  function unsubscribe(channel) {
    if (channel) client.removeChannel(channel);
  }

  window.AppData = {
    client,
    getOwnerId,
    getItem,
    getItemsByPrefix,
    setItem,
    removeItem,
    subscribeToChanges,
    unsubscribe
  };
})();

