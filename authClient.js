// Shared Supabase Auth module for the User application.
// Supabase Auth is the ONLY authentication mechanism - no hardcoded codes,
// no localStorage/sessionStorage login flags, no URL-based identity.
//
// Requires: supabaseConfig.js and the supabase-js CDN script loaded first.
// Load this BEFORE appDataStore.js so appDataStore.js can reuse this client.
(function () {
  'use strict';

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) {
    console.error('AuthClient: Supabase is not configured. Check supabaseConfig.js and the supabase-js <script> include.');
    return;
  }

  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  let cachedProfile = null;

  async function getCurrentUser() {
    const { data, error } = await client.auth.getUser();
    if (error) {
      console.error('AuthClient.getCurrentUser error:', error);
      return null;
    }
    return data.user || null;
  }

  async function getCurrentUserId() {
    const user = await getCurrentUser();
    return user ? user.id : null;
  }

  // Loads (and caches) the profiles row for the current session. Returns null
  // if not authenticated or the profile cannot be found.
  async function getCurrentProfile(forceReload) {
    const userId = await getCurrentUserId();
    if (!userId) {
      cachedProfile = null;
      return null;
    }
    if (!forceReload && cachedProfile && cachedProfile.id === userId) {
      return cachedProfile;
    }
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('AuthClient.getCurrentProfile error:', error);
      return null;
    }
    cachedProfile = data || null;
    return cachedProfile;
  }

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email: email, password: password });
    if (error) throw error;
    cachedProfile = null;
    return data;
  }

  async function signOut() {
    cachedProfile = null;
    await client.auth.signOut();
  }

  // Real logout: end the Supabase Auth session (clears the persisted token)
  // and reload so the login gate is shown again. No credentials are stored.
  async function logout() {
    try {
      await signOut();
    } catch (err) {
      console.error('AuthClient.logout error:', err);
    }
    window.location.reload();
  }

  function onAuthStateChange(callback) {
    return client.auth.onAuthStateChange(function (event, session) {
      cachedProfile = null;
      callback(event, session);
    });
  }

  // ---- Minimal login overlay (no layout/navigation changes to the page) ----
  function ensureGateMarkup() {
    if (document.getElementById('authGateOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'authGateOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.92);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,sans-serif;padding:16px;box-sizing:border-box;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:12px;padding:28px;max-width:360px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.35);box-sizing:border-box;">' +
        '<h2 style="margin:0 0 16px;font-size:1.25rem;color:#0f172a;">\u041d\u044d\u0432\u0442\u0440\u044d\u0445</h2>' +
        '<div id="authGateError" style="display:none;color:#dc2626;font-size:.85rem;margin-bottom:12px;"></div>' +
        '<input id="authGateEmail" type="email" placeholder="\u0418-\u043c\u044d\u0439\u043b" autocomplete="username" style="width:100%;padding:10px;margin-bottom:10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-size:0.95rem;">' +
        '<input id="authGatePassword" type="password" placeholder="\u041d\u0443\u0443\u0446 \u04af\u0433" autocomplete="current-password" style="width:100%;padding:10px;margin-bottom:14px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-size:0.95rem;">' +
        '<button id="authGateSubmit" type="button" style="width:100%;padding:10px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;font-size:0.95rem;">\u041d\u044d\u0432\u0442\u0440\u044d\u0445</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('authGateSubmit').addEventListener('click', handleGateSubmit);
    document.getElementById('authGatePassword').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleGateSubmit();
    });
  }

  function showGate(message) {
    ensureGateMarkup();
    document.getElementById('authGateOverlay').style.display = 'flex';
    const errorEl = document.getElementById('authGateError');
    if (message) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      errorEl.style.display = 'none';
    }
  }

  function hideGate() {
    const overlay = document.getElementById('authGateOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  let pendingResolve = null;

  async function handleGateSubmit() {
    const emailEl = document.getElementById('authGateEmail');
    const passwordEl = document.getElementById('authGatePassword');
    const errorEl = document.getElementById('authGateError');
    const btn = document.getElementById('authGateSubmit');
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = '\u041d\u044d\u0432\u0442\u044d\u0440\u0447 \u0431\u0430\u0439\u043d\u0430...';
    try {
      await signIn(email, password);
      const profile = await getCurrentProfile(true);
      if (!profile || profile.is_active !== true || profile.role !== 'user') {
        await signOut();
        throw new Error('inactive');
      }
      passwordEl.value = '';
      hideGate();
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(profile);
      }
    } catch (err) {
      const message = (err && err.message === 'inactive')
        ? '\u0422\u0430\u043d\u044b \u044d\u0440\u0445 \u0438\u0434\u044d\u0432\u0445\u0433\u04af\u0439 \u0431\u0430\u0439\u043d\u0430. \u0410\u0434\u043c\u0438\u043d\u0442\u0430\u0439 \u0445\u043e\u043b\u0431\u043e\u0433\u0434\u043e\u043d\u043e \u0443\u0443.'
        : '\u041d\u044d\u0432\u0442\u0440\u044d\u0445\u044d\u0434 \u0430\u043b\u0434\u0430\u0430 \u0433\u0430\u0440\u043b\u0430\u0430: \u0431\u0443\u0440\u0443\u0443 \u0438-\u043c\u044d\u0439\u043b \u044d\u0441\u0432\u044d\u043b \u043d\u0443\u0443\u0446 \u04af\u0433.';
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      console.error('AuthClient sign-in failed:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = '\u041d\u044d\u0432\u0442\u0440\u044d\u0445';
    }
  }

  // Ensures a logged-in, active-profile session exists before the caller's
  // business-data code runs. Blocks with the login overlay until the user
  // authenticates successfully. Resolves with the profile row, or null only
  // if called again after a prior in-flight resolution (should not normally
  // happen at page load).
  async function requireAuth() {
    const existingProfile = await getCurrentProfile();
    if (existingProfile && existingProfile.is_active === true && existingProfile.role === 'user') {
      hideGate();
      return existingProfile;
    }
    if (existingProfile && (existingProfile.is_active !== true || existingProfile.role !== 'user')) {
      await signOut();
    }
    showGate();
    return new Promise(function (resolve) {
      pendingResolve = resolve;
    });
  }

  window.AuthClient = {
    client: client,
    getCurrentUser: getCurrentUser,
    getCurrentUserId: getCurrentUserId,
    getCurrentProfile: getCurrentProfile,
    requireAuth: requireAuth,
    logout: logout,
    signIn: signIn,
    signOut: signOut,
    onAuthStateChange: onAuthStateChange
  };
})();
