/** The sign-in screens. Everyone proves an email address or Google account before seeing a trip. */
import { A, actions, submits, render } from './state.js';
import { LIMITS } from '../config/app.js';
import { esc, toast, val } from './dom.js';

const friendly = code => ({
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/invalid-credential': "That email and password don't match.",
  'auth/wrong-password': "That email and password don't match.",
  'auth/user-not-found': "That email and password don't match.",
  'auth/invalid-email': "That doesn't look like an email address.",
  'auth/weak-password': 'Use a password of at least 6 characters.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'Signing in needs a connection. Check yours and try again.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Use email below, or open this page in your browser instead of the home-screen app.',
  'auth/popup-closed-by-user': 'The Google window closed before you finished.',
  'auth/operation-not-supported-in-this-environment': "Google sign-in doesn't work here. Use email below.",
}[code] || "That didn't work. Check your connection and try again.");

export function signInView() {
  const mode = A.authMode || 'in', joining = /#join-/.test(location.hash);
  const title = joining ? 'Sign in to join this trip' : 'Sign in to The Trip Tab';
  return `<div class="scene" aria-hidden="true"></div><header class="brand tall"><span class="mark" aria-hidden="true"></span><div class="stack tight"><h1>${title}</h1><p class="muted">Every person verifies an email or Google account, so names on a trip can be trusted. Your trips follow your account to any phone or browser.</p></div></header>
  ${A.repo.auth.simulated ? '<div class="notice">Preview: this sign-in is simulated, and nothing is emailed. Use any email and a password of 6 or more characters.</div>' : ''}
  <section class="panel pad stack">
    <button class="btn primary" data-action="auth-google">Continue with Google</button>
    <div class="or small muted">or use email</div>
    <div class="seg" role="group" aria-label="Sign in or create an account"><button type="button" data-action="auth-mode" data-id="in" aria-pressed="${mode === 'in'}">Sign in</button><button type="button" data-action="auth-mode" data-id="up" aria-pressed="${mode === 'up'}">Create account</button></div>
    <form class="stack" data-form="${mode === 'up' ? 'auth-up' : 'auth-in'}">
      ${mode === 'up' ? `<label class="f"><span>Your name</span><input id="authName" required maxlength="${LIMITS.personName}" autocomplete="name"></label>` : ''}
      <label class="f"><span>Email</span><input id="authEmail" type="email" required autocomplete="email" value="${esc(A.authEmail || '')}"></label>
      <label class="f"><span>Password</span><input id="authPassword" type="password" required minlength="6" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}"></label>
      <button class="btn">${mode === 'up' ? 'Create account' : 'Sign in'}</button>
    </form>
    ${mode === 'in' ? '<button class="link small" data-action="auth-reset">Forgot your password?</button>' : ''}
  </section>`;
}

export function verifyView(user) {
  return `<div class="scene" aria-hidden="true"></div><header class="brand tall"><span class="mark" aria-hidden="true"></span><div class="stack tight"><h1>Check your email</h1><p class="muted">We sent a link to <strong class="wrap-any">${esc(user.email)}</strong>. Tap it to verify your account, then come back here. It may be in your spam folder.</p></div></header>
  <section class="panel pad stack">
    <button class="btn primary" data-action="auth-check">I tapped the link</button>
    ${A.repo.auth.simulated ? '<button class="btn" data-action="auth-simulate">Preview: pretend I tapped the link</button>' : ''}
    <button class="btn" data-action="auth-resend">Send the email again</button>
    <button class="link small" data-action="auth-signout">Use a different account</button>
  </section>`;
}

/** Runs a sign-in step and turns failure into a plain message. */
async function attempt(step) {
  const app = document.getElementById('app');
  app.classList.add('busy');
  try { await step(); } catch (e) { toast(friendly(e?.code)); }
  app.classList.remove('busy');
}
actions['auth-mode'] = el => { A.authEmail = val('authEmail'); A.authMode = el.dataset.id; render(); };
actions['auth-google'] = () => attempt(async () => A.onUser(await A.repo.auth.google()));
submits['auth-in'] = () => attempt(async () => A.onUser(await A.repo.auth.signIn(val('authEmail'), val('authPassword'))));
submits['auth-up'] = () => attempt(async () => A.onUser(await A.repo.auth.signUp(val('authName').trim().slice(0, LIMITS.personName), val('authEmail'), val('authPassword'))));
actions['auth-check'] = () => attempt(async () => {
  const user = await A.repo.auth.refresh();
  A.onUser(user);
  if (!user?.verified) toast("It isn't verified yet. Tap the link in the email, then try again.");
  else toast("You're verified. Welcome!");
});
actions['auth-simulate'] = () => attempt(async () => { await A.repo.auth.simulateVerify(); A.onUser(await A.repo.auth.refresh()); });
actions['auth-resend'] = () => attempt(async () => { await A.repo.auth.sendVerification(); toast('Sent. Check your email.'); });
actions['auth-reset'] = () => {
  const email = val('authEmail').trim();
  if (!email) { toast('Enter your email first.'); return; }
  attempt(async () => { await A.repo.auth.resetPassword(email); toast('If that email has an account, a reset link is on its way.'); });
};
actions['auth-signout'] = () => attempt(async () => {
  A.device.forgetAccount();
  await A.repo.auth.signOut();
  location.reload();
});
