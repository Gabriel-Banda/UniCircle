// UniCircle — communities.js

import { supabase, friendlyError } from "./api.js";
import { requireAuth } from "./auth.js";
import { mountAppShell } from "./components/nav.js";
import { showToast } from "./components/toast.js";

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let profile;
let allCommunities = [];
let memberCounts = {};
let myCommunityIds = new Set();
let activeLevel = "";
let query = "";

const LEVELS = ["institution", "faculty", "program", "academic_year", "course"];

function linkFor(c) {
  return c.level === "course" ? `course.html?id=${c.course_id}` : `community.html?id=${c.id}`;
}

async function loadData() {
  const [{ data: communities }, { data: members }] = await Promise.all([
    supabase.from("communities").select("id, name, description, level, course_id").order("name"),
    supabase.from("community_members").select("community_id, user_id"),
  ]);

  allCommunities = communities || [];
  memberCounts = {};
  (members || []).forEach(m => { memberCounts[m.community_id] = (memberCounts[m.community_id] || 0) + 1; });
  myCommunityIds = new Set((members || []).filter(m => m.user_id === profile.id).map(m => m.community_id));
}

function renderFilters() {
  const el = document.getElementById("level-filter");
  el.innerHTML = `
    <button type="button" class="category-chip ${!activeLevel ? "active" : ""}" data-level="">All</button>
    ${LEVELS.map(l => `<button type="button" class="category-chip ${activeLevel === l ? "active" : ""}" data-level="${l}">${l.replace(/_/g, " ")}</button>`).join("")}
  `;
  el.querySelectorAll(".category-chip").forEach(btn => btn.addEventListener("click", () => {
    activeLevel = btn.dataset.level;
    renderFilters();
    renderList();
  }));
}

function renderList() {
  const list = document.getElementById("community-list");
  let filtered = allCommunities;
  if (activeLevel) filtered = filtered.filter(c => c.level === activeLevel);
  if (query.trim()) filtered = filtered.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><h3>No communities found.</h3><p>Try a different search or level, or finish onboarding to create your own.</p></div>`;
    return;
  }

  list.innerHTML = `<div class="grid grid-2">${filtered.map(c => `
    <div class="card enter">
      <span class="chip chip-muted">${c.level.replace(/_/g, " ")}</span>
      <h4 style="margin: var(--space-2) 0 4px;"><a href="${linkFor(c)}">${escapeHtml(c.name)}</a></h4>
      <p class="meta" style="margin-bottom: var(--space-3);">${memberCounts[c.id] || 0} member${memberCounts[c.id] === 1 ? "" : "s"}</p>
      <button class="btn ${myCommunityIds.has(c.id) ? "btn-secondary" : "btn-primary"} join-toggle" data-id="${c.id}">
        ${myCommunityIds.has(c.id) ? "Joined ✓" : "Join"}
      </button>
    </div>`).join("")}</div>`;

  list.querySelectorAll(".join-toggle").forEach(btn => btn.addEventListener("click", () => toggleMembership(btn.dataset.id)));
}

async function toggleMembership(communityId) {
  if (myCommunityIds.has(communityId)) {
    const { error } = await supabase.from("community_members").delete().eq("community_id", communityId).eq("user_id", profile.id);
    if (error) return showToast(friendlyError(error), { type: "error" });
    myCommunityIds.delete(communityId);
    memberCounts[communityId] = Math.max(0, (memberCounts[communityId] || 1) - 1);
  } else {
    const { error } = await supabase.from("community_members").insert({ community_id: communityId, user_id: profile.id });
    if (error) return showToast(friendlyError(error), { type: "error" });
    myCommunityIds.add(communityId);
    memberCounts[communityId] = (memberCounts[communityId] || 0) + 1;
  }
  renderList();
}

(async function init() {
  profile = await requireAuth();
  if (!profile) return;
  mountAppShell("communities", profile);

  document.getElementById("community-search").addEventListener("input", (e) => {
    query = e.target.value;
    renderList();
  });

  renderFilters();
  await loadData();
  renderList();
})();
