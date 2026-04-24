/* ═══════════════════════════════════════════════
   PEAK SOCIETY — forgot-password.js
   Forgot / Reset Password flow (Supabase JS v2)
   Depends on: Auth (auth.js), openModal/closeModal (app.js)
═══════════════════════════════════════════════ */

'use strict';

/* ── Open / close helpers ────────────────────── */
const openForgotPasswordModal = () => {
  document.getElementById('fpEmail').value = '';
  document.getElementById('fpError').setAttribute('hidden', '');
  document.getElementById('fpSuccess').setAttribute('hidden', '');
  document.getElementById('fpSubmit').disabled = false;
  document.getElementById('fpSubmit').textContent = 'Send Reset Link';
  closeModal('authModal');
  openModal('forgotPasswordModal');
};

const closeForgotPasswordModal = () => closeModal('forgotPasswordModal');

/* ── Send reset email ────────────────────────── */
document.getElementById('fpSubmit').addEventListener('click', async () => {
  const errEl = document.getElementById('fpError');
  const successEl = document.getElementById('fpSuccess');
  const btn = document.getElementById('fpSubmit');
  const email = document.getElementById('fpEmail').value.trim();

  errEl.setAttribute('hidden', '');
  successEl.setAttribute('hidden', '');

  if (!email || !email.includes('@')) {
    errEl.textContent = 'Please enter a valid email address.';
    errEl.removeAttribute('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';

  const { error } = await Auth.forgotPassword(email);

  btn.disabled = false;
  btn.textContent = 'Send Reset Link';

  if (error) {
    errEl.textContent = error.message;
    errEl.removeAttribute('hidden');
    return;
  }

  successEl.removeAttribute('hidden');
});

/* ── Allow Enter key in forgot password form ─── */
document.getElementById('fpEmail').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('fpSubmit').click();
});

/* ── Close button ────────────────────────────── */
document.getElementById('fpClose').addEventListener('click', closeForgotPasswordModal);

/* ─────────────────────────────────────────────
   RESET PASSWORD MODAL
   Shown when user returns via the email link
   (Supabase fires PASSWORD_RECOVERY event)
───────────────────────────────────────────── */
const openResetPasswordModal = () => {
  document.getElementById('rpNewPassword').value = '';
  document.getElementById('rpConfirmPassword').value = '';
  document.getElementById('rpError').setAttribute('hidden', '');
  document.getElementById('rpSuccess').setAttribute('hidden', '');
  document.getElementById('rpSubmit').disabled = false;
  document.getElementById('rpSubmit').textContent = 'Set New Password';
  openModal('resetPasswordModal');
};

document.getElementById('rpSubmit').addEventListener('click', async () => {
  const errEl = document.getElementById('rpError');
  const successEl = document.getElementById('rpSuccess');
  const btn = document.getElementById('rpSubmit');
  const newPass = document.getElementById('rpNewPassword').value;
  const confirm = document.getElementById('rpConfirmPassword').value;

  errEl.setAttribute('hidden', '');
  successEl.setAttribute('hidden', '');

  if (!newPass || newPass.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    errEl.removeAttribute('hidden');
    return;
  }
  if (newPass !== confirm) {
    errEl.textContent = 'Passwords do not match.';
    errEl.removeAttribute('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Updating...';

  const { error } = await Auth.updatePassword(newPass);

  btn.disabled = false;
  btn.textContent = 'Set New Password';

  if (error) {
    errEl.textContent = error.message;
    errEl.removeAttribute('hidden');
    return;
  }

  successEl.removeAttribute('hidden');
  btn.disabled = true;

  setTimeout(() => closeModal('resetPasswordModal'), 2500);
});

/* ── Allow Enter key in reset password form ──── */
['rpNewPassword', 'rpConfirmPassword'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('rpSubmit').click();
  });
});

document.getElementById('rpClose').addEventListener('click', () => closeModal('resetPasswordModal'));

/* ── PASSWORD_RECOVERY is handled in auth.js's single onAuthStateChange ── */
// openResetPasswordModal() is called from there to avoid registering a
// second listener (which causes the Supabase storage lock contention error).

/* ─────────────────────────────────────────────
   HASH PARSING ON PAGE LOAD
   Handles both:
   - Error from email link (expired / invalid OTP)
   - Successful recovery token (Supabase sets session
     from hash; onAuthStateChange fires PASSWORD_RECOVERY)
───────────────────────────────────────────── */
(() => {
  const hash = window.location.hash.slice(1); // strip leading #
  if (!hash) return;

  const params = Object.fromEntries(new URLSearchParams(hash));

  // Clear the hash from the URL so it doesn't linger
  history.replaceState(null, '', window.location.pathname + window.location.search);

  if (params.error) {
    // Show forgot password modal with a contextual error message
    const isExpired = params.error_code === 'otp_expired';
    const msg = isExpired
      ? 'That reset link has expired. Enter your email to request a new one.'
      : (params.error_description?.replace(/\+/g, ' ') || 'Invalid reset link. Please request a new one.');

    // Wait for DOM / app.js to finish setting up before opening modal
    requestAnimationFrame(() => {
      document.getElementById('fpEmail').value = '';
      document.getElementById('fpSuccess').setAttribute('hidden', '');
      const errEl = document.getElementById('fpError');
      errEl.textContent = msg;
      errEl.removeAttribute('hidden');
      openModal('forgotPasswordModal');
    });
  } else if (params.type === 'recovery') {
    // Force open the reset password modal manually.
    // The Supabase SDK logs the user in, but its PASSWORD_RECOVERY event might be swallowed 
    // if we clear the hash from the URL before the onAuthStateChange listener is registered.
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (typeof openResetPasswordModal === 'function') {
          openResetPasswordModal();
        }
      }, 100);
    });
  }
  // Supabase SDK will automatically exchange the token and log the user in.
})();
