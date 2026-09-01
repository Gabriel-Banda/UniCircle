// UniCircle — api.js
// Single Supabase client instance, shared across every page/module.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Translate a raw Supabase/Postgrest error into a message safe to show a user.
 * Never surface raw backend errors (spec section 23).
 */
export function friendlyError(error) {
  if (!error) return "Something went wrong. Please try again.";
  console.error("UniCircle error:", error);
  const msg = (error.message || "").toLowerCase();

  if (msg.includes("invalid login credentials")) return "That email or password isn't right.";
  if (msg.includes("user already registered")) return "An account with that email already exists.";
  if (msg.includes("email not confirmed")) return "Please confirm your email before logging in.";
  if (msg.includes("password should be at least")) return "Your password needs to be at least 6 characters.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Can't reach the server — check your connection and try again.";
  if (msg.includes("jwt") || msg.includes("session")) return "Your session has expired. Please log in again.";
  if (msg.includes("duplicate key") && msg.includes("username")) return "That username is already taken.";
  if (msg.includes("row-level security") || msg.includes("permission denied")) return "You don't have permission to do that yet — this usually means a database policy needs updating.";

  return "Something went wrong. Please try again.";
}

/** Small helper: fetch the current signed-in user's full profile row, or null. */
export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) return null;
  return data;
}
