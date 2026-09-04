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

  // ---- Login gate (full-screen login shown before the dashboard) ----
  function ensureGateMarkup() {
    if (document.getElementById('authGateOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'authGateOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:linear-gradient(160deg,#0f172a,#1e293b);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,sans-serif;padding:16px;box-sizing:border-box;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;padding:32px;max-width:360px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.45);box-sizing:border-box;">' +
        '<h2 style="margin:0 0 4px;font-size:1.4rem;color:#0f172a;text-align:center;letter-spacing:.5px;">\u041d\u042d\u0412\u0422\u0420\u042d\u0425</h2>' +
        '<p style="margin:0 0 18px;font-size:.8rem;color:#64748b;text-align:center;">\u0417\u0430\u043c\u044b\u043d 1-\u0440 \u0445\u044d\u0441\u044d\u0433 \u2014 \u0423\u0434\u0438\u0440\u0434\u043b\u0430\u0433\u044b\u043d \u0441\u0438\u0441\u0442\u0435\u043c</p>' +
        '<div id="authGateError" style="display:none;color:#dc2626;font-size:.85rem;margin-bottom:12px;"></div>' +
        '<div id="authGateResume" style="display:none;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-size:.8rem;border-radius:8px;padding:10px;margin-bottom:14px;">' +
          '\u04e8\u043c\u043d\u04e9\u0445 session \u0438\u0434\u044d\u0432\u0445\u0442\u044d\u0439 \u0431\u0430\u0439\u043d\u0430.' +
          '<div style="display:flex;gap:8px;margin-top:8px;">' +
            '<button id="authGateResumeBtn" type="button" style="flex:1;padding:8px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;font-size:.82rem;">\u04e8\u043c\u043d\u04e9\u0445 session \u0430\u0448\u0438\u0433\u043b\u0430\u0445</button>' +
            '<button id="authGateReloginBtn" type="button" style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;font-weight:600;cursor:pointer;font-size:.82rem;">\u0414\u0430\u0445\u0438\u043d \u043d\u044d\u0432\u0442\u0440\u044d\u0445</button>' +
          '</div>' +
        '</div>' +
        '<label style="display:block;font-size:.78rem;font-weight:600;color:#334155;margin-bottom:4px;">Email / \u041d\u044d\u0432\u0442\u0440\u044d\u0445 \u043d\u044d\u0440</label>' +
        '<input id="authGateEmail" type="email" placeholder="user001@example.com" autocomplete="username" style="width:100%;padding:10px;margin-bottom:12px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-size:0.95rem;">' +
        '<label style="display:block;font-size:.78rem;font-weight:600;color:#334155;margin-bottom:4px;">Password / \u041d\u0443\u0443\u0446 \u04af\u0433</label>' +
        '<input id="authGatePassword" type="password" placeholder="\u041d\u0443\u0443\u0446 \u04af\u0433" autocomplete="current-password" style="width:100%;padding:10px;margin-bottom:16px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-size:0.95rem;">' +
        '<button id="authGateSubmit" type="button" style="width:100%;padding:11px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;font-size:0.95rem;letter-spacing:.5px;">\u041d\u042d\u0412\u0422\u0420\u042d\u0425</button>' +
        '<button id="authGateReset" type="button" style="width:100%;padding:10px;margin-top:8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;font-weight:600;cursor:pointer;font-size:0.85rem;">\u041d\u0423\u0423\u0426 \u04ae\u0413 \u0421\u042d\u0420\u0413\u042d\u042d\u0425</button>' +
        '<button id="authGateSignout" type="button" style="width:100%;padding:9px;margin-top:8px;border:none;border-radius:6px;background:transparent;color:#94a3b8;font-weight:600;cursor:pointer;font-size:0.8rem;">\u0413\u0410\u0420\u0410\u0425</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('authGateSubmit').addEventListener('click', handleGateSubmit);
    document.getElementById('authGatePassword').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleGateSubmit();
    });
    document.getElementById('authGateResumeBtn').addEventListener('click', handleGateResume);
    document.getElementById('authGateReloginBtn').addEventListener('click', handleGateRelogin);
    document.getElementById('authGateSignout').addEventListener('click', function () { logout(); });
    document.getElementById('authGateReset').addEventListener('click', handleGateReset);
  }

  async function handleGateReset() {
    const errorEl = document.getElementById('authGateError');
    const email = document.getElementById('authGateEmail').value.trim();
    errorEl.style.display = 'none';
    if (!email) {
      errorEl.textContent = '\u0418-\u043c\u044d\u0439\u043b \u0445\u0443\u0434\u0430\u0441\u0433\u0430\u0430 \u0431\u0438\u0447\u0438\u0436, \u0434\u0430\u0445\u0438\u043d \u0434\u0430\u0440\u043d\u0430 \u0443\u0443.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      await client.auth.resetPasswordForEmail(email);
      errorEl.style.color = '#15803d';
      errorEl.textContent = '\u041d\u0443\u0443\u0446 \u04af\u0433 \u0441\u044d\u0440\u0433\u044d\u044d\u0445 \u0445\u043e\u043b\u0431\u043e\u043e\u0441 \u0438-\u043c\u044d\u0439\u043b \u0440\u04af\u04af \u0438\u043b\u0433\u044d\u044d\u0433\u0434\u043b\u0430\u0430.';
      errorEl.style.display = 'block';
    } catch (e) {
      errorEl.style.color = '#dc2626';
      errorEl.textContent = '\u0410\u043b\u0434\u0430\u0430 \u0433\u0430\u0440\u043b\u0430\u0430. \u0414\u0430\u0445\u0438\u043d \u043e\u0440\u043e\u043b\u0434\u043e\u043d\u0430 \u0443\u0443.';
      errorEl.style.display = 'block';
    }
  }

  function showGate(message, hasSession) {
    ensureGateMarkup();
    document.getElementById('authGateOverlay').style.display = 'flex';
    const errorEl = document.getElementById('authGateError');
    if (message) {
      errorEl.style.color = '#dc2626';
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      errorEl.style.display = 'none';
    }
    // Show the "Өмнөх session ашиглах / Дахин нэвтрэх" option only when a
    // persisted Supabase session was detected on a fresh dashboard open.
    const resumeEl = document.getElementById('authGateResume');
    if (resumeEl) resumeEl.style.display = hasSession ? 'block' : 'none';
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
      errorEl.style.color = '#dc2626';
      const message = (err && err.message === 'inactive')
        ? '\u0422\u0430\u043d\u044b \u0445\u044d\u0440\u044d\u0433\u043b\u044d\u0433\u0447\u0438\u0439\u043d \u044d\u0440\u0445 \u0438\u0434\u044d\u0432\u0445\u0433\u04af\u0439 \u0431\u0430\u0439\u043d\u0430.'
        : '\u041d\u044d\u0432\u0442\u0440\u044d\u0445 \u043d\u044d\u0440 \u044d\u0441\u0432\u044d\u043b \u043d\u0443\u0443\u0446 \u04af\u0433 \u0431\u0443\u0440\u0443\u0443 \u0431\u0430\u0439\u043d\u0430.';
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      console.error('AuthClient sign-in failed:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = '\u041d\u042d\u0412\u0422\u0420\u042d\u0425';
    }
  }

  // Use the already-restored persisted session (explicit user choice).
  async function handleGateResume() {
    const profile = await getCurrentProfile(true);
    if (profile && profile.is_active === true && profile.role === 'user') {
      hideGate();
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(profile);
      }
    } else {
      showGate('\u0422\u0430\u043d\u044b \u0445\u044d\u0440\u044d\u0433\u043b\u044d\u0433\u0447\u0438\u0439\u043d \u044d\u0440\u0445 \u0438\u0434\u044d\u0432\u0445\u0433\u04af\u0439 \u0431\u0430\u0439\u043d\u0430.', false);
    }
  }

  // Discard the persisted session and force a fresh email/password login.
  async function handleGateRelogin() {
    await signOut();
    const resumeEl = document.getElementById('authGateResume');
    if (resumeEl) resumeEl.style.display = 'none';
    const emailEl = document.getElementById('authGateEmail');
    if (emailEl) emailEl.value = '';
    const pwd = document.getElementById('authGatePassword');
    if (pwd) pwd.focus();
  }

  // Per-page defense-in-depth gate (sub-pages/iframes). Silently accepts an
  // already-valid session so the dashboard's iframe does not spawn a second
  // login form; only shows the gate when there is no usable session.
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

  // Dashboard entry gate (index.html). ALWAYS shows the login screen on a
  // fresh open, even when Supabase restored a persisted session. The user must
  // explicitly sign in, or explicitly choose to use the previous session.
  async function requireLogin() {
    const existingProfile = await getCurrentProfile();
    const hasValidSession = !!(existingProfile && existingProfile.is_active === true && existingProfile.role === 'user');
    if (existingProfile && !hasValidSession) {
      await signOut();
    }
    showGate(null, hasValidSession);
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
    requireLogin: requireLogin,
    logout: logout,
    signIn: signIn,
    signOut: signOut,
    onAuthStateChange: onAuthStateChange
  };
})();
