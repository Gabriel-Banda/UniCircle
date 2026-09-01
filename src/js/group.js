// UniCircle — group.js

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

const groupId = new URLSearchParams(window.location.search).get("id");
let profile, group, isMember = false, activeTab = "posts";

async function loadGroup() {
  const { data, error } = await supabase.from("study_groups").select("*, courses(name)").eq("id", groupId).single();
  if (error || !data) return null;
  return data;
}

async function loadMemberCount() {
  const { count } = await supabase.from("study_group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId);
  document.getElementById("member-count").textContent = `${count || 0} member${count === 1 ? "" : "s"}`;
}

function renderHeader() {
  document.getElementById("group-header").innerHTML = `
    ${group.courses?.name ? `<span class="chip chip-muted">${escapeHtml(group.courses.name)}</span>` : ""}
    <h1 style="margin: var(--space-2) 0 4px;">${escapeHtml(group.name)}</h1>
    ${group.description ? `<p>${escapeHtml(group.description)}</p>` : ""}
    <p class="meta" id="member-count" style="margin-bottom: var(--space-4);"></p>
    <button class="btn ${isMember ? "btn-secondary" : "btn-primary"}" id="join-btn">${isMember ? "Leave Group" : "Join Group"}</button>
    ${isMember ? `<button class="btn btn-primary" id="new-post-btn">New Post</button>` : ""}
  `;
  document.getElementById("join-btn").addEventListener("click", toggleMembership);
  document.getElementById("new-post-btn")?.addEventListener("click", openComposer);
  loadMemberCount();
}

async function toggleMembership() {
  if (isMember) {
    await supabase.from("study_group_members").delete().eq("group_id", groupId).eq("user_id", profile.id);
  } else {
    await supabase.from("study_group_members").insert({ group_id: groupId, user_id: profile.id });
  }
  isMember = !isMember;
  renderHeader();
}

function renderTabs() {
  document.getElementById("tabs").innerHTML = `
    <button class="category-chip ${activeTab === "posts" ? "active" : ""}" data-tab="posts">Posts</button>
    <button class="category-chip ${activeTab === "members" ? "active" : ""}" data-tab="members">Members</button>
  `;
  document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
    activeTab = b.dataset.tab;
    renderTabs();
    renderTabContent();
  }));
}

async function renderTabContent() {
  const root = document.getElementById("tab-content");
  root.innerHTML = `<div class="skeleton" style="height:80px;"></div>`;

  if (activeTab === "members") {
    const { data: members } = await supabase.from("study_group_members").select("profiles(id, name, username)").eq("group_id", groupId);
    root.innerHTML = (members && members.length)
      ? `<div class="grid grid-2">${members.map(m => m.profiles ? `
          <a class="card" href="profile.html?id=${m.profiles.id}" style="display:flex; align-items:center; gap:var(--space-3);">
            <span class="avatar-chip">${(m.profiles.name || "?").trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()).join("")}</span>
            <div><strong>${escapeHtml(m.profiles.name)}</strong><br><span class="meta">@${escapeHtml(m.profiles.username)}</span></div>
          </a>` : "").join("")}</div>`
      : `<p class="meta">No members yet.</p>`;
    return;
  }

  const { data: posts } = await supabase.from("discussions").select("id, title, category, is_anonymous, created_at, profiles(name)").eq("group_id", groupId).order("created_at", { ascending: false });
  root.innerHTML = (posts && posts.length)
    ? `<div class="discussion-list">${posts.map((d, i) => `
        <a class="card discussion-row enter-stagger" style="--delay:${i * 40}ms" href="discussion.html?id=${d.id}">
          <div>
            <span class="category-chip" data-category="${d.category}" style="cursor:default;">${d.category.replace(/_/g, " ")}</span>
            <h4 style="margin: var(--space-2) 0 4px;">${escapeHtml(d.title)}</h4>
            <p class="meta" style="margin:0;">${d.is_anonymous ? "Anonymous Student" : escapeHtml(d.profiles?.name || "Unknown")} · ${timeAgo(d.created_at)}</p>
          </div>
        </a>`).join("")}</div>`
    : `<div class="empty-state"><h3>No posts yet.</h3><p>${isMember ? "Start the first post for this group." : "Join the group to post."}</p>${isMember ? `<button class="btn btn-primary" id="empty-cta">New Post</button>` : ""}</div>`;
  document.getElementById("empty-cta")?.addEventListener("click", openComposer);
}

function openComposer() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel">
      <div class="modal-panel-head"><h3 style="margin:0;">New Post in ${escapeHtml(group.name)}</h3><button class="btn btn-ghost" id="composer-close">✕</button></div>
      <form id="composer-form">
        <div class="field"><label for="c-title">Title</label><input id="c-title" required maxlength="200"></div>
        <div class="field"><label for="c-body">What's on your mind?</label><textarea id="c-body" rows="5" required></textarea></div>
        <button type="submit" class="btn btn-primary btn-block" id="composer-submit">Post</button>
      </form>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("#composer-close").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#composer-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = backdrop.querySelector("#composer-submit");
    btn.classList.add("btn-loading"); btn.disabled = true;
    const { data, error } = await supabase.from("discussions").insert({
      author_id: profile.id,
      group_id: groupId,
      category: "study_group",
      title: backdrop.querySelector("#c-title").value.trim(),
      body: backdrop.querySelector("#c-body").value.trim(),
    }).select().single();
    if (error) { showToast(friendlyError(error), { type: "error" }); btn.classList.remove("btn-loading"); btn.disabled = false; return; }
    window.location.href = `discussion.html?id=${data.id}`;
  });
}

(async function init() {
  if (!groupId) { window.location.href = "study-groups.html"; return; }
  profile = await requireAuth();
  if (!profile) return;
  mountAppShell("study-groups", profile);

  group = await loadGroup();
  if (!group) {
    document.getElementById("group-header").innerHTML = `<div class="empty-state"><h3>Group not found.</h3><a class="btn btn-secondary" href="study-groups.html">Back to Study Groups</a></div>`;
    return;
  }
  const { data: membership } = await supabase.from("study_group_members").select("*").eq("group_id", groupId).eq("user_id", profile.id).maybeSingle();
  isMember = !!membership;
  renderHeader();
  renderTabs();
  renderTabContent();
})();
