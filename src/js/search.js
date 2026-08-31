// UniCircle — search.js
// search across discussions, users, communities (which cover
// institutions/faculties/programs/years), and courses. Results only ever
// come from the database — nothing here is fabricated.

import { supabase } from "./api.js";
import { requireAuth } from "./auth.js";
import { mountAppShell } from "./components/nav.js";

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const RECENT_KEY = "unicircle_recent_searches";
let activeType = "all"; // all | discussions | users | communities | courses

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function pushRecent(q) {
  if (!q.trim()) return;
  const list = [q, ...getRecent().filter(r => r !== q)].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function renderRecent() {
  const recent = getRecent();
  const el = document.getElementById("recent-searches");
  if (!recent.length) { el.innerHTML = ""; return; }
  el.innerHTML = `<p class="meta" style="margin-bottom: var(--space-2);">Recent searches</p>
    <div class="category-chips">${recent.map(r => `<button type="button" class="category-chip" data-q="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join("")}</div>`;
  el.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    document.getElementById("search-input").value = b.dataset.q;
    runSearch(b.dataset.q);
  }));
}

function renderTypeTabs() {
  const types = [["all","All"],["discussions","Discussions"],["users","Users"],["communities","Communities"],["courses","Courses"]];
  const el = document.getElementById("type-tabs");
  el.innerHTML = types.map(([id, label]) => `<button type="button" class="category-chip ${activeType === id ? "active" : ""}" data-type="${id}">${label}</button>`).join("");
  el.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    activeType = b.dataset.type;
    renderTypeTabs();
    runSearch(document.getElementById("search-input").value);
  }));
}

async function searchDiscussions(q) {
  const { data } = await supabase.from("discussions").select("id, title, category, is_anonymous, profiles(name)").ilike("title", `%${q}%`).limit(10);
  return (data || []).map(d => ({
    type: "discussion", href: `discussion.html?id=${d.id}`,
    title: d.title, sub: `Discussion · ${d.category.replace(/_/g, " ")}`,
  }));
}

async function searchUsers(q) {
  const { data } = await supabase.from("profiles").select("id, name, username").eq("profile_visibility", "public").or(`name.ilike.%${q}%,username.ilike.%${q}%`).limit(10);
  return (data || []).map(u => ({
    type: "user", href: `profile.html?id=${u.id}`,
    title: u.name, sub: `@${u.username}`,
  }));
}

async function searchCommunities(q) {
  const { data } = await supabase.from("communities").select("id, name, level, course_id").ilike("name", `%${q}%`).limit(10);
  return (data || []).map(c => ({
    type: "community",
    href: c.level === "course" ? `course.html?id=${c.course_id}` : `community.html?id=${c.id}`,
    title: c.name, sub: `Community · ${c.level.replace(/_/g, " ")}`,
  }));
}

async function searchCourses(q) {
  const { data } = await supabase.from("courses").select("id, name, code").ilike("name", `%${q}%`).limit(10);
  return (data || []).map(c => ({
    type: "course", href: `course.html?id=${c.id}`,
    title: c.name, sub: c.code ? `Course · ${c.code}` : "Course",
  }));
}

async function runSearch(q) {
  const resultsEl = document.getElementById("search-results");
  document.getElementById("recent-searches").style.display = q.trim() ? "none" : "block";

  if (!q.trim()) { resultsEl.innerHTML = ""; return; }
  resultsEl.innerHTML = `<div class="skeleton" style="height:60px; margin-bottom:var(--space-2);"></div>`;

  const tasks = [];
  if (activeType === "all" || activeType === "discussions") tasks.push(searchDiscussions(q));
  if (activeType === "all" || activeType === "users") tasks.push(searchUsers(q));
  if (activeType === "all" || activeType === "communities") tasks.push(searchCommunities(q));
  if (activeType === "all" || activeType === "courses") tasks.push(searchCourses(q));

  const results = (await Promise.all(tasks)).flat();

  if (!results.length) {
    resultsEl.innerHTML = `<div class="empty-state"><h3>No results for "${escapeHtml(q)}"</h3><p>Try a different search term, or check the spelling.</p></div>`;
    return;
  }

  resultsEl.innerHTML = results.map(r => `
    <a class="card" href="${r.href}" style="display:block; margin-bottom: var(--space-2);">
      <strong>${escapeHtml(r.title)}</strong><br><span class="meta">${escapeHtml(r.sub)}</span>
    </a>`).join("");
}

(async function init() {
  const profile = await requireAuth();
  if (!profile) return;
  mountAppShell("search", profile);

  renderTypeTabs();
  renderRecent();

  const input = document.getElementById("search-input");
  let debounce;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(input.value), 250);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) pushRecent(input.value.trim());
  });
})();
