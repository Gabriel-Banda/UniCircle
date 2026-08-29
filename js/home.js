// UniCircle — home.js

import { supabase } from "./api.js";
import { requireAuth } from "./auth.js";
import { mountAppShell } from "./components/nav.js";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadAcademicPath(profile) {
  const [inst, fac, prog, year] = await Promise.all([
    profile.institution_id ? supabase.from("institutions").select("name").eq("id", profile.institution_id).single() : null,
    profile.faculty_id ? supabase.from("faculties").select("name").eq("id", profile.faculty_id).single() : null,
    profile.program_id ? supabase.from("programs").select("name").eq("id", profile.program_id).single() : null,
    profile.academic_year_id ? supabase.from("academic_years").select("label").eq("id", profile.academic_year_id).single() : null,
  ]);
  return {
    institution: inst?.data?.name,
    faculty: fac?.data?.name,
    program: prog?.data?.name,
    year: year?.data?.label,
  };
}

function renderPathStub(path) {
  const parts = [path.institution, path.faculty, path.program, path.year].filter(Boolean);
  if (!parts.length) return "";
  return `<div class="path-stub enter">
    ${parts.map((p, i) => `${i > 0 ? '<span class="sep">/</span>' : ""}<span class="${i === parts.length - 1 ? "current" : ""}">${escapeHtml(p)}</span>`).join("")}
  </div>`;
}

async function loadCourses(userId) {
  const { data } = await supabase.from("user_courses").select("courses(id, name, code)").eq("user_id", userId);
  return (data || []).map(r => r.courses).filter(Boolean);
}

async function loadRecentDiscussions(userId) {
  // Discussions from communities this student belongs to.
  const { data: memberships } = await supabase.from("community_members").select("community_id").eq("user_id", userId);
  const communityIds = (memberships || []).map(m => m.community_id);
  if (!communityIds.length) return [];
  const { data } = await supabase
    .from("discussions")
    .select("id, title, category, is_anonymous, created_at, author_id, profiles(name, username)")
    .in("community_id", communityIds)
    .order("created_at", { ascending: false })
    .limit(6);
  return data || [];
}

async function loadRecommendedCommunities(userId) {
  const { data: memberships } = await supabase.from("community_members").select("community_id").eq("user_id", userId);
  const joinedIds = new Set((memberships || []).map(m => m.community_id));
  const { data } = await supabase.from("communities").select("id, name, level").order("created_at", { ascending: false }).limit(20);
  return (data || []).filter(c => !joinedIds.has(c.id)).slice(0, 4);
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

(async function init() {
  const profile = await requireAuth();
  if (!profile) return;

  mountAppShell("home", profile);

  document.getElementById("welcome-heading").textContent = `${greeting()}, ${profile.name.split(" ")[0]} 👋`;

  const path = await loadAcademicPath(profile);
  document.getElementById("my-community").innerHTML = renderPathStub(path) || `<p class="meta">Academic details not set.</p>`;

  const courses = await loadCourses(profile.id);
  const coursesEl = document.getElementById("my-courses");
  coursesEl.innerHTML = courses.length
    ? `<div class="ob-chip-row">${courses.map(c => `<span class="chip chip-muted">${escapeHtml(c.name)}${c.code ? ` <span class="meta">${escapeHtml(c.code)}</span>` : ""}</span>`).join("")}</div>`
    : `<p>No courses added yet. <a href="settings.html">Add courses in settings.</a></p>`;

  const discussions = await loadRecentDiscussions(profile.id);
  const discussionsEl = document.getElementById("recent-discussions");
  discussionsEl.innerHTML = discussions.length
    ? discussions.map(d => `
        <a class="card discussion-row" href="discussion.html?id=${d.id}">
          <div>
            <span class="chip">${d.category.replace(/_/g, " ")}</span>
            <h4 style="margin: var(--space-2) 0 0;">${escapeHtml(d.title)}</h4>
            <p class="meta" style="margin:0;">${d.is_anonymous ? "Anonymous Student" : escapeHtml(d.profiles?.name || "Unknown")} · ${timeAgo(d.created_at)}</p>
          </div>
        </a>`).join("")
    : `<div class="empty-state">
        <h3>Your community is quiet... for now.</h3>
        <p>Start the first discussion and bring your classmates into the conversation.</p>
        <button class="btn btn-primary" disabled title="Discussions launch in the next build phase">Create Discussion</button>
      </div>`;

  const recommended = await loadRecommendedCommunities(profile.id);
  const recEl = document.getElementById("recommended-communities");
  recEl.innerHTML = recommended.length
    ? `<div class="grid grid-2">${recommended.map(c => `
        <a class="card" href="community.html?id=${c.id}">
          <span class="chip chip-muted">${c.level.replace(/_/g, " ")}</span>
          <h4 style="margin-top: var(--space-2);">${escapeHtml(c.name)}</h4>
        </a>`).join("")}</div>`
    : `<p class="meta">No other communities yet — you're one of the first here.</p>`;
})();
