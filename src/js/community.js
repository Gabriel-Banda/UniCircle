// UniCircle — community.js

import { supabase, friendlyError } from "./api.js";
import { requireAuth } from "./auth.js";
import { mountAppShell } from "./components/nav.js";
import { showToast } from "./components/toast.js";

const CATEGORIES = ["question","course_discussion","assignment","exam","study_help","resource","study_group","campus_life","announcement","project","career","general"];

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

const params = new URLSearchParams(window.location.search);
const communityId = params.get("id");
let profile, community, isMember = false;
let activeTab = "discussions";

async function loadCommunity() {
  const { data, error } = await supabase.from("communities").select("*").eq("id", communityId).single();
  if (error || !data) return null;
  return data;
}

async function loadMembership() {
  const { data } = await supabase.from("community_members").select("*").eq("community_id", communityId).eq("user_id", profile.id).maybeSingle();
  return !!data;
}

async function toggleMembership() {
  const btn = document.getElementById("join-btn");
  if (isMember) {
    await supabase.from("community_members").delete().eq("community_id", communityId).eq("user_id", profile.id);
  } else {
    await supabase.from("community_members").insert({ community_id: communityId, user_id: profile.id });
  }
  isMember = !isMember;
  btn.textContent = isMember ? "Joined ✓" : "Join";
  btn.className = `btn ${isMember ? "btn-secondary" : "btn-primary"}`;
  loadMemberCount();
}

async function loadMemberCount() {
  const { count } = await supabase.from("community_members").select("*", { count: "exact", head: true }).eq("community_id", communityId);
  document.getElementById("member-count").textContent = `${count || 0} member${count === 1 ? "" : "s"}`;
}

function renderHeader() {
  document.getElementById("community-header").innerHTML = `
    <span class="chip chip-muted">${community.level.replace(/_/g, " ")}</span>
    <h1 style="margin: var(--space-3) 0 var(--space-2);">${escapeHtml(community.name)}</h1>
    ${community.description ? `<p>${escapeHtml(community.description)}</p>` : ""}
    <p class="meta" id="member-count" style="margin-bottom: var(--space-4);"></p>
    <button class="btn ${isMember ? "btn-secondary" : "btn-primary"}" id="join-btn">${isMember ? "Joined ✓" : "Join"}</button>
    <button class="btn btn-primary" id="new-discussion-btn">New Discussion</button>
  `;
  document.getElementById("join-btn").addEventListener("click", toggleMembership);
  document.getElementById("new-discussion-btn").addEventListener("click", openComposer);
  loadMemberCount();
}

function renderTabs() {
  document.getElementById("tabs").innerHTML = `
    <button class="category-chip ${activeTab === "discussions" ? "active" : ""}" data-tab="discussions">Discussions</button>
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
  if (activeTab === "discussions") {
    root.innerHTML = `<div class="skeleton" style="height:80px;"></div>`;
    const { data: discussions } = await supabase
      .from("discussions")
      .select("id, title, category, is_anonymous, created_at, profiles(name)")
      .eq("community_id", communityId)
      .order("created_at", { ascending: false });

    root.innerHTML = (discussions && discussions.length)
      ? `<div class="discussion-list">${discussions.map((d, i) => `
          <a class="card discussion-row enter-stagger" style="--delay:${i * 40}ms" href="discussion.html?id=${d.id}">
            <div>
              <span class="category-chip" data-category="${d.category}" style="cursor:default;">${d.category.replace(/_/g, " ")}</span>
              <h4 style="margin: var(--space-2) 0 4px;">${escapeHtml(d.title)}</h4>
              <p class="meta" style="margin:0;">${d.is_anonymous ? "Anonymous Student" : escapeHtml(d.profiles?.name || "Unknown")} · ${timeAgo(d.created_at)}</p>
            </div>
          </a>`).join("")}</div>`
      : `<div class="empty-state"><h3>No discussions yet.</h3><p>Start the first discussion in ${escapeHtml(community.name)}.</p><button class="btn btn-primary" id="empty-cta">Start a Discussion</button></div>`;

    document.getElementById("empty-cta")?.addEventListener("click", openComposer);
  } else {
    root.innerHTML = `<div class="skeleton" style="height:80px;"></div>`;
    const { data: members } = await supabase.from("community_members").select("profiles(id, name, username)").eq("community_id", communityId);
    root.innerHTML = (members && members.length)
      ? `<div class="grid grid-2">${members.map(m => m.profiles ? `
          <a class="card" href="profile.html?id=${m.profiles.id}" style="display:flex; align-items:center; gap:var(--space-3);">
            <span class="avatar-chip">${(m.profiles.name || "?").trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()).join("")}</span>
            <div><strong>${escapeHtml(m.profiles.name)}</strong><br><span class="meta">@${escapeHtml(m.profiles.username)}</span></div>
          </a>` : "").join("")}</div>`
      : `<p class="meta">No members yet.</p>`;
  }
}

function openComposer() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel">
      <div class="modal-panel-head">
        <h3 style="margin:0;">New Discussion in ${escapeHtml(community.name)}</h3>
        <button class="btn btn-ghost" id="composer-close" aria-label="Close">✕</button>
      </div>
      <form id="composer-form">
        <div class="field">
          <label for="c-category">Category</label>
          <select id="c-category">${CATEGORIES.map(c => `<option value="${c}">${c.replace(/_/g, " ")}</option>`).join("")}</select>
        </div>
        <div class="field"><label for="c-title">Title</label><input id="c-title" required maxlength="200"></div>
        <div class="field"><label for="c-body">What's on your mind?</label><textarea id="c-body" rows="5" required></textarea></div>
        <div class="field" style="display:flex; align-items:center; gap: var(--space-2);">
          <input type="checkbox" id="c-anon" style="width:auto;">
          <label for="c-anon" style="margin:0;">Post anonymously</label>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="composer-submit">Post Discussion</button>
      </form>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("#composer-close").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#composer-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = backdrop.querySelector("#composer-submit");
    submitBtn.classList.add("btn-loading"); submitBtn.disabled = true;
    const { data, error } = await supabase.from("discussions").insert({
      author_id: profile.id,
      community_id: communityId,
      category: backdrop.querySelector("#c-category").value,
      title: backdrop.querySelector("#c-title").value.trim(),
      body: backdrop.querySelector("#c-body").value.trim(),
      is_anonymous: backdrop.querySelector("#c-anon").checked,
    }).select().single();
    if (error) { showToast(friendlyError(error), { type: "error" }); submitBtn.classList.remove("btn-loading"); submitBtn.disabled = false; return; }
    window.location.href = `discussion.html?id=${data.id}`;
  });
}

(async function init() {
  if (!communityId) { window.location.href = "communities.html"; return; }
  profile = await requireAuth();
  if (!profile) return;
  mountAppShell("communities", profile);

  community = await loadCommunity();
  if (!community) {
    document.getElementById("community-header").innerHTML = `<div class="empty-state"><h3>Community not found.</h3><a class="btn btn-secondary" href="communities.html">Back to Communities</a></div>`;
    return;
  }
  isMember = await loadMembership();
  renderHeader();
  renderTabs();
  renderTabContent();
})();
