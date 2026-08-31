// UniCircle — auth.js
// signup/login/logout/password-reset against Supabase Auth,
// plus session guards used by every protected page.

import { supabase, friendlyError, getCurrentProfile } from "./api.js";

/**
 * Create an account. Does NOT create the profile row here — that happens
 * at the end of onboarding (Phase 2), once we know username/name.
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: friendlyError(error) };
  return { user: data.user };
}

export async function logIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyError(error) };
  return { user: data.user };
}

export async function logOut() {
  const { error } = await supabase.auth.signOut();
  if (error) return { error: friendlyError(error) };
  window.location.href = "../index.html";
}

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password.html",
  });
  if (error) return { error: friendlyError(error) };
  return { ok: true };
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: friendlyError(error) };
  return { ok: true };
}

/**
 * Route guard for protected pages: call at the top of every authenticated
 * page's script. Redirects to login if there's no session, and to
 * onboarding if the signed-in user hasn't finished setting up their
 * academic identity yet.
 */
export async function requireAuth({ requireOnboarded = true } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  const profile = await getCurrentProfile();
  if (requireOnboarded && (!profile || !profile.onboarding_complete)) {
    window.location.href = "onboarding.html";
    return null;
  }
  return profile;
}

/** For login/signup pages: bounce a user who's already signed in. */
export async function redirectIfAuthenticated() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const profile = await getCurrentProfile();
    window.location.href = profile && profile.onboarding_complete ? "home.html" : "onboarding.html";
  }
}
