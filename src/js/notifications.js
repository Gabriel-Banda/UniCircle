// UniCircle — notifications.js

import { supabase, friendlyError } from "./api.js";
import { requireAuth } from "./auth.js";
import { mountAppShell } from "./components/nav.js";
import { showToast } from "./components/toast.js";

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const COPY = {
  reply_to_discussion: (name) => `${name} replied to your discussion`,
  reply_to_comment: (name) => `${name} replied to your comment`,
  reaction: (name) => `${name} reacted to your post`,
  group_invite: (name) => `${name} invited you to a study group`,
  group_join: (name) => `${name} joined your study group`,
  community_activity: () => `New activity in your community`,
};

function targetHref(n) {
  if (n.discussion_id) return `discussion.html?id=${n.discussion_id}`;
  if (n.group_id) return `group.html?id=${n.group_id}`;
  return "#";
}

let profile;

async function loadNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*, profiles!notifications_actor_id_fkey(name)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });
  if (error) { showToast(friendlyError(error), { type: "error" }); return []; }
  return data || [];
}

function render(notifications) {
  const list = document.getElementById("notification-list");

  if (!notifications.length) {
    list.innerHTML = `<div class="empty-state"><h3>You're all caught up.</h3><p>New replies, reactions, and group activity will show up here.</p></div>`;
    return;
  }

  list.innerHTML = notifications.map(n => `
    <a class="card notification-row ${n.is_read ? "" : "unread"}" href="${targetHref(n)}" data-id="${n.id}">
      <span class="notif-dot" aria-hidden="true"></span>
      <div>
        <p style="margin:0;">${escapeHtml((COPY[n.type] || (() => "New activity"))(n.profiles?.name || "Someone"))}</p>
        <p class="meta" style="margin:0;">${timeAgo(n.created_at)}</p>
      </div>
    </a>`).join("");

  list.querySelectorAll(".notification-row").forEach(el => el.addEventListener("click", () => markRead(el.dataset.id)));
}

async function markRead(id) {
  await supabase.from("notifications").update({ is_read: true }).eq("id", id);
}

(async function init() {
  profile = await requireAuth();
  if (!profile) return;
  mountAppShell("notifications", profile);

  const notifications = await loadNotifications();
  render(notifications);

  document.getElementById("mark-all-read").addEventListener("click", async () => {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", profile.id).eq("is_read", false);
    if (error) return showToast(friendlyError(error), { type: "error" });
    render(await loadNotifications());
    showToast("All caught up.", { type: "success" });
  });
})();
