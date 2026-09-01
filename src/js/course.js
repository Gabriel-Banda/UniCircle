// UniCircle — course.js
// A course's discussion space. Course communities are normally created
// during onboarding (once a student selects that course), but this page
// finds-or-creates one lazily too, so a course row can never be a dead end.

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

const params = new URLSearchParams(window.location.search);
const courseId = params.get("id");
let profile, course, community, isMember = false;
let activeTab = "discussions"; // discussions | question | resource | members

async function loadCourseChain() {
  const { data: c, error } = await supabase.from("courses").select("*, academic_years(id, label, programs(id, name, faculties(id, name, institutions(id, name))))").eq("id", courseId).single();
  if (error || !c) return null;
  return c;
}

async function ensureCommunity() {
  const { data: existing } = await supabase.from("communities").select("*").eq("level", "course").eq("course_id", courseId).maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabase.from("communities").insert({ level: "course", course_id: courseId, academic_year_id: course.academic_year_id, name: course.name }).select().single();
  if (error) { showToast(friendlyError(error), { type: "error" }); return null; }
  return created;
}

function renderBreadcrumb() {
  const y = course.academic_years, p = y?.programs, f = p?.faculties, i = f?.institutions;
  const parts = [i?.name, f?.name, p?.name, y?.label, course.name].filter(Boolean);
  document.getElementById("course-breadcrumb").innerHTML = `<div class="path-stub">
    ${parts.map((part, idx) => `${idx > 0 ? '<span class="sep">/</span>' : ""}<span class="${idx === parts.length - 1 ? "current" : ""}">${escapeHtml(part)}</span>`).join("")}
  </div>`;
}

async function loadMemberCount() {
  if (!community) { document.getElementById("member-count").textContent = ""; return; }
  const { count } = await supabase.from("community_members").select("*", { count: "exact", head: true }).eq("community_id", community.id);
  document.getElementById("member-count").textContent = `${count || 0} member${count === 1 ? "" : "s"}`;
}

function renderHeader() {
  document.getElementById("course-header").innerHTML = `
    <h1 style="margin: var(--space-2) 0 4px;">${escapeHtml(course.name)}</h1>
    ${course.code ? `<p class="meta" style="margin-bottom:4px;">${escapeHtml(course.code)}</p>` : ""}
    <p class="meta" id="member-count" style="margin-bottom: var(--space-4);"></p>
    <button class="btn ${isMember ? "btn-secondary" : "btn-primary"}" id="join-btn">${isMember ? "Joined ✓" : "Join course"}</button>
    <button class="btn btn-primary" id="new-discussion-btn">New Discussion</button>
  `;
  document.getElementById("join-btn").addEventListener("click", toggleMembership);
  document.getElementById("new-discussion-btn").addEventListener("click", () => openComposer());
  loadMemberCount();
}

async function toggleMembership() {
  if (!community) community = await ensureCommunity();
  if (!community) return;
  const btn = document.getElementById("join-btn");
  if (isMember) {
    await supabase.from("community_members").delete().eq("community_id", community.id).eq("user_id", profile.id);
  } else {
    await supabase.from("community_members").insert({ community_id: community.id, user_id: profile.id });
  }
  isMember = !isMember;
  btn.textContent = isMember ? "Joined ✓" : "Join course";
  btn.className = `btn ${isMember ? "btn-secondary" : "btn-primary"}`;
  loadMemberCount();
}

function renderTabs() {
  const tabs = [
    { id: "discussions", label: "Discussions" },
    { id: "question", label: "Questions" },
    { id: "resource", label: "Resources" },
    { id: "members", label: "Members" },
  ];
  document.getElementById("tabs").innerHTML = tabs.map(t =>
    `<button class="category-chip ${activeTab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("");
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
    if (!community) { root.innerHTML = `<p class="meta">No members yet — be the first to join.</p>`; return; }
    const { data: members } = await supabase.from("community_members").select("profiles(id, name, username)").eq("community_id", community.id);
    root.innerHTML = (members && members.length)
      ? `<div class="grid grid-2">${members.map(m => m.profiles ? `
          <a class="card" href="profile.html?id=${m.profiles.id}" style="display:flex; align-items:center; gap:var(--space-3);">
            <span class="avatar-chip">${(m.profiles.name || "?").trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()).join("")}</span>
            <div><strong>${escapeHtml(m.profiles.name)}</strong><br><span class="meta">@${escapeHtml(m.profiles.username)}</span></div>
          </a>` : "").join("")}</div>`
      : `<p class="meta">No members yet.</p>`;
    return;
  }

  if (!community) {
    root.innerHTML = `<div class="empty-state"><h3>No discussions yet.</h3><p>Be the first to post in ${escapeHtml(course.name)}.</p><button class="btn btn-primary" id="empty-cta">Start a Discussion</button></div>`;
    document.getElementById("empty-cta")?.addEventListener("click", () => openComposer());
    return;
  }

  let q = supabase.from("discussions").select("id, title, category, is_anonymous, created_at, profiles(name)").eq("community_id", community.id).order("created_at", { ascending: false });
  if (activeTab !== "discussions") q = q.eq("category", activeTab);
  const { data: discussions } = await q;

  root.innerHTML = (discussions && discussions.length)
    ? `<div class="discussion-list">${discussions.map((d, i) => `
        <a class="card discussion-row enter-stagger" style="--delay:${i * 40}ms" href="discussion.html?id=${d.id}">
          <div>
            <span class="category-chip" data-category="${d.category}" style="cursor:default;">${d.category.replace(/_/g, " ")}</span>
            <h4 style="margin: var(--space-2) 0 4px;">${escapeHtml(d.title)}</h4>
            <p class="meta" style="margin:0;">${d.is_anonymous ? "Anonymous Student" : escapeHtml(d.profiles?.name || "Unknown")} · ${timeAgo(d.created_at)}</p>
          </div>
        </a>`).join("")}</div>`
    : `<div class="empty-state"><h3>Nothing here yet.</h3><p>Start the conversation in ${escapeHtml(course.name)}.</p><button class="btn btn-primary" id="empty-cta">Start a Discussion</button></div>`;
  document.getElementById("empty-cta")?.addEventListener("click", () => openComposer());
}

function openComposer() {
  const presetCategory = ["question", "resource"].includes(activeTab) ? activeTab : "course_discussion";
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel">
      <div class="modal-panel-head">
        <h3 style="margin:0;">New Discussion in ${escapeHtml(course.name)}</h3>
        <button class="btn btn-ghost" id="composer-close" aria-label="Close">✕</button>
      </div>
      <form id="composer-form">
        <div class="field">
          <label for="c-category">Category</label>
          <select id="c-category">
            ${["question","course_discussion","assignment","exam","study_help","resource","announcement","project","general"].map(c => `<option value="${c}" ${c === presetCategory ? "selected" : ""}>${c.replace(/_/g, " ")}</option>`).join("")}
          </select>
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

    if (!community) community = await ensureCommunity();
    if (!community) { submitBtn.classList.remove("btn-loading"); submitBtn.disabled = false; return; }

    const { data, error } = await supabase.from("discussions").insert({
      author_id: profile.id,
      community_id: community.id,
      course_id: courseId,
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
  if (!courseId) { window.location.href = "communities.html"; return; }
  profile = await requireAuth();
  if (!profile) return;
  mountAppShell("communities", profile);

  course = await loadCourseChain();
  if (!course) {
    document.getElementById("course-header").innerHTML = `<div class="empty-state"><h3>Course not found.</h3><a class="btn btn-secondary" href="communities.html">Back to Communities</a></div>`;
    return;
  }
  renderBreadcrumb();

  const { data: existingCommunity } = await supabase.from("communities").select("*").eq("level", "course").eq("course_id", courseId).maybeSingle();
  community = existingCommunity || null;
  if (community) {
    const { data: membership } = await supabase.from("community_members").select("*").eq("community_id", community.id).eq("user_id", profile.id).maybeSingle();
    isMember = !!membership;
  }

  renderHeader();
  renderTabs();
  renderTabContent();
})();
