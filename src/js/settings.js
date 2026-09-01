// UniCircle — settings.js

import { supabase, friendlyError } from "./api.js";
import { requireAuth, updatePassword, logOut } from "./auth.js";
import { mountAppShell } from "./components/nav.js";
import { showToast } from "./components/toast.js";

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let profile, settings;

function applyTheme(mode) {
  localStorage.setItem("unicircle_theme", mode);
  const resolved = mode === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : mode;
  document.documentElement.setAttribute("data-theme", resolved);
}

async function loadSettings() {
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", profile.id).maybeSingle();
  return data || { appearance: "system", allow_anonymous_posting: true, notify_replies: true, notify_reactions: true, notify_group_activity: true };
}

function renderAccount() {
  document.getElementById("account-section").innerHTML = `
    <div class="field"><label for="s-name">Name</label><input id="s-name" value="${escapeHtml(profile.name)}"></div>
    <div class="field"><label for="s-username">Username</label><input id="s-username" value="${escapeHtml(profile.username)}"></div>
    <button class="btn btn-secondary" id="save-account">Save Account Info</button>
  `;
  document.getElementById("save-account").addEventListener("click", async () => {
    const name = document.getElementById("s-name").value.trim();
    const username = document.getElementById("s-username").value.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return showToast("Username should be 3–20 letters, numbers, or underscores.", { type: "error" });
    const { error } = await supabase.from("profiles").update({ name, username }).eq("id", profile.id);
    if (error) return showToast(friendlyError(error), { type: "error" });
    showToast("Account info updated.", { type: "success" });
  });
}

function renderPrivacy() {
  document.getElementById("privacy-section").innerHTML = `
    <div class="field">
      <label for="s-visibility">Profile visibility</label>
      <select id="s-visibility">
        <option value="public" ${profile.profile_visibility === "public" ? "selected" : ""}>Public — anyone signed in can view</option>
        <option value="community" ${profile.profile_visibility === "community" ? "selected" : ""}>Community — visible in shared communities only</option>
        <option value="private" ${profile.profile_visibility === "private" ? "selected" : ""}>Private — only you</option>
      </select>
    </div>
    <label style="display:flex; align-items:center; gap:var(--space-2);">
      <input type="checkbox" id="s-anon" style="width:auto;" ${settings.allow_anonymous_posting ? "checked" : ""}>
      Allow me to post anonymously
    </label>
    <button class="btn btn-secondary" id="save-privacy" style="margin-top: var(--space-3);">Save Privacy Settings</button>
  `;
  document.getElementById("save-privacy").addEventListener("click", async () => {
    const visibility = document.getElementById("s-visibility").value;
    const allowAnon = document.getElementById("s-anon").checked;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("profiles").update({ profile_visibility: visibility }).eq("id", profile.id),
      supabase.from("user_settings").upsert({ user_id: profile.id, ...settings, allow_anonymous_posting: allowAnon }),
    ]);
    if (e1 || e2) return showToast(friendlyError(e1 || e2), { type: "error" });
    settings.allow_anonymous_posting = allowAnon;
    showToast("Privacy settings updated.", { type: "success" });
  });
}

function renderNotifications() {
  document.getElementById("notifications-section").innerHTML = `
    <label style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-2);">
      <input type="checkbox" id="n-replies" style="width:auto;" ${settings.notify_replies ? "checked" : ""}> Notify me about replies
    </label>
    <label style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-2);">
      <input type="checkbox" id="n-reactions" style="width:auto;" ${settings.notify_reactions ? "checked" : ""}> Notify me about reactions
    </label>
    <label style="display:flex; align-items:center; gap:var(--space-2);">
      <input type="checkbox" id="n-groups" style="width:auto;" ${settings.notify_group_activity ? "checked" : ""}> Notify me about study group activity
    </label>
    <button class="btn btn-secondary" id="save-notifications" style="margin-top: var(--space-3);">Save Notification Settings</button>
  `;
  document.getElementById("save-notifications").addEventListener("click", async () => {
    const patch = {
      notify_replies: document.getElementById("n-replies").checked,
      notify_reactions: document.getElementById("n-reactions").checked,
      notify_group_activity: document.getElementById("n-groups").checked,
    };
    const { error } = await supabase.from("user_settings").upsert({ user_id: profile.id, ...settings, ...patch });
    if (error) return showToast(friendlyError(error), { type: "error" });
    Object.assign(settings, patch);
    showToast("Notification settings updated.", { type: "success" });
  });
}

function renderAppearance() {
  document.getElementById("appearance-section").innerHTML = `
    <div class="field">
      <label for="s-appearance">Theme</label>
      <select id="s-appearance">
        <option value="light" ${settings.appearance === "light" ? "selected" : ""}>Light</option>
        <option value="dark" ${settings.appearance === "dark" ? "selected" : ""}>Dark</option>
        <option value="system" ${settings.appearance === "system" ? "selected" : ""}>Match system</option>
      </select>
    </div>
  `;
  document.getElementById("s-appearance").addEventListener("change", async (e) => {
    const mode = e.target.value;
    applyTheme(mode);
    const { error } = await supabase.from("user_settings").upsert({ user_id: profile.id, ...settings, appearance: mode });
    if (error) return showToast(friendlyError(error), { type: "error" });
    settings.appearance = mode;
    showToast("Appearance updated.", { type: "success" });
  });
}

function renderSecurity() {
  document.getElementById("security-section").innerHTML = `
    <div class="field"><label for="s-newpass">New password</label><input id="s-newpass" type="password" autocomplete="new-password"></div>
    <button class="btn btn-secondary" id="save-password">Update Password</button>
  `;
  document.getElementById("save-password").addEventListener("click", async () => {
    const pw = document.getElementById("s-newpass").value;
    if (pw.length < 6) return showToast("Use at least 6 characters.", { type: "error" });
    const result = await updatePassword(pw);
    if (result.error) return showToast(result.error, { type: "error" });
    document.getElementById("s-newpass").value = "";
    showToast("Password updated.", { type: "success" });
  });
}

function renderDanger() {
  document.getElementById("danger-section").innerHTML = `
    <p>Deleting your account permanently removes your profile, discussions, comments, and memberships. This can't be undone.</p>
    <button class="btn btn-danger" id="delete-account">Delete My Account</button>
  `;
  document.getElementById("delete-account").addEventListener("click", async () => {
    const confirmation = prompt(`Type "${profile.username}" to confirm permanent account deletion.`);
    if (confirmation !== profile.username) {
      if (confirmation !== null) showToast("That didn't match — account not deleted.", { type: "error" });
      return;
    }
    const { error } = await supabase.rpc("delete_own_account");
    if (error) return showToast(friendlyError(error), { type: "error" });
    showToast("Account deleted.", { type: "success" });
    setTimeout(() => { window.location.href = "../index.html"; }, 800);
  });
}

(async function init() {
  profile = await requireAuth();
  if (!profile) return;
  mountAppShell("profile", profile);

  settings = await loadSettings();
  applyTheme(settings.appearance);

  renderAccount();
  renderPrivacy();
  renderNotifications();
  renderAppearance();
  renderSecurity();
  renderDanger();
})();
