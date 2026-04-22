/* ═══════════════════════════════════════════════
   PEAK SOCIETY — auth.js
   Supabase Auth helpers  (Supabase JS v2)
   Depends on: sbClient (set in app.js before this runs)
═══════════════════════════════════════════════ */

'use strict';

const Auth = (() => {
  /* ── Internal state ─────────────────────────── */
  let _user    = undefined; // undefined = not yet resolved, null = signed out
  let _profile = null;      // public.users row
  let _listeners = [];

  const _notify = () => _listeners.forEach(fn => fn({ user: _user, profile: _profile }));

  /* ── Fetch public.users row by auth uid ─────── */
  const _fetchProfile = async (uid) => {
    const { data, error } = await sbClient
      .from('users')
      .select('id, username, role, displayName, profilePicture, bio, youtube, discord, joined, email, lastUsernameChange')
      .eq('id', uid)
      .single();
    if (error) { console.error('Profile fetch error:', error.message); return; }
    _profile = data;
  };

  /* ── Bootstrap: call once after sbClient ready ─ */
  const init = async () => {
    if (!sbClient) return;

    // Restore any existing session from storage
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) {
      _user = session.user;
      await _fetchProfile(_user.id);
    } else {
      _user = null;
    }

    // Keep in sync with app.js Store.session mirror
    _syncStore();
    _notify();

    // React to sign-in, sign-out, token refresh, etc.
    sbClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (typeof openResetPasswordModal === 'function') openResetPasswordModal();
        return;
      }
      if (session) {
        _user = session.user;
        await _fetchProfile(_user.id);
      } else {
        _user = null;
        _profile = null;
      }
      _syncStore();
      _notify();
      if (typeof updateNavForSession === 'function') updateNavForSession();
      if (typeof renderForum === 'function') renderForum();
    });
  };

  /* ── Mirror session into localStorage so Store.get('session') still works ── */
  const _syncStore = () => {
    try {
      const val = _profile
        ? { userId: _user.id, username: _profile.username, role: _profile.role }
        : null;
      localStorage.setItem('ps_session', JSON.stringify(val));
    } catch { /* storage unavailable */ }
  };

  /* ── signUp(username, email, password) ──────── */
  const signUp = async (username, email, password) => {
    if (!sbClient) return { error: { message: 'Supabase not connected.' } };

    // Block only if username is taken by an already-linked account (has id).
    // If the row exists but id IS NULL, it's a pre-migration account — allow sign-up
    // so the trigger can link the new auth.users.id to the existing row.
    const { data: existing } = await sbClient
      .from('users')
      .select('username, id')
      .ilike('username', username)
      .maybeSingle();

    if (existing?.id) return { error: { message: 'That username is already taken.' } };

    // Create the Supabase Auth user — the DB trigger inserts the public.users row
    const { data, error } = await sbClient.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });

    return { data, error };
  };

  /* ── signIn(usernameOrEmail, password) ──────── */
  // Supabase Auth identifies by email. Resolve username → email first.
  const signIn = async (usernameInput, password) => {
    if (!sbClient) return { error: { message: 'Supabase not connected.' } };

    const isEmail = usernameInput.includes('@');
    let email = usernameInput;

    if (!isEmail) {
      const { data: emailRes, error } = await sbClient
        .rpc('get_email_by_username', { p_username: usernameInput });

      if (error || !emailRes) {
        return { error: { message: 'Username not yet linked. Please sign in with your email address instead.' } };
      }
      email = emailRes;
    }

    const result = await sbClient.auth.signInWithPassword({ email, password });
    if (result.error) return result;

    // Eagerly fetch profile so Auth.getProfile() is available immediately
    // after signIn() returns — don't wait for onAuthStateChange
    _user = result.data.user;
    await _fetchProfile(_user.id);
    _syncStore();

    return result;
  };

  /* ── forgotPassword(email) ───────────────────── */
  const forgotPassword = async (email) => {
    if (!sbClient) return { error: { message: 'Supabase not connected.' } };
    const redirectTo = window.location.origin + window.location.pathname;
    const { data, error } = await sbClient.auth.resetPasswordForEmail(email, { redirectTo });
    return { data, error };
  };

  /* ── updatePassword(newPassword) ─────────────── */
  const updatePassword = async (newPassword) => {
    if (!sbClient) return { error: { message: 'Supabase not connected.' } };
    const { data, error } = await sbClient.auth.updateUser({ password: newPassword });
    return { data, error };
  };

  /* ── signOut ─────────────────────────────────── */
  const signOut = async () => {
    if (sbClient) await sbClient.auth.signOut();
  };

  /* ── Getters ─────────────────────────────────── */
  const getUser    = () => _user;
  const getProfile = () => _profile;
  const getRole    = () => _profile?.role ?? null;

  /* ── onChange(fn) → returns unsubscribe fn ───── */
  const onChange = (fn) => {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  };

  /* ── requireRole(allowedRoles, redirectHash) ─── */
  // Returns true if allowed, false + redirects if not.
  const requireRole = (allowedRoles, redirectHash = '#home') => {
    const role = getRole();
    if (!role || !allowedRoles.includes(role)) {
      window.location.hash = redirectHash;
      return false;
    }
    return true;
  };

  return { init, signUp, signIn, signOut, forgotPassword, updatePassword, getUser, getProfile, getRole, onChange, requireRole };
})();
