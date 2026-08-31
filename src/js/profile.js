// UniCircle — profile.js

import { supabase, friendlyError } from "./api.js";
import { requireAuth } from "./auth.js";
import { mountAppShell } from "./components/nav.js";
import { showToast } from "./components/toast.js";

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");
}

const viewId = new URLSearchParams(window.location.search).get("id");
let profile, viewedProfile, isSelf;

async function loadAcademicPath(p) {
  const [inst, fac, prog, year] = await Promise.all([
    p.institution_id ? supabase.from("institutions").select("name").eq("id", p.institution_id).single() : null,
    p.faculty_id ? supabase.from("faculties").select("name").eq("id", p.faculty_id).single() : null,
    p.program_id ? supabase.from("programs").select("name").eq("id", p.program_id).single() : null,
    p.academic_year_id ? supabase.from("academic_years").select("label").eq("id", p.academic_year_id).single() : null,
  ]);
  return [inst?.data?.name, fac?.data?.name, prog?.data?.name, year?.data?.label].filter(Boolean);
}

function renderHeader() {
  document.getElementById("profile-header").innerHTML = `
    <div style="display:flex; gap: var(--space-4); align-items:center; margin-bottom: var(--space-4);">
      <span class="avatar-chip avatar-chip-lg">${initials(viewedProfile.name)}</span>
      <div>
        <h1 style="margin:0;">${escapeHtml(viewedProfile.name)}</h1>
        <p class="meta" style="margin:0;">@${escapeHtml(viewedProfile.username)}</p>
      </div>
      ${isSelf ? `<div style="margin-left:auto; display:flex; gap:var(--space-2);">
        <button class="btn btn-secondary" id="edit-btn">Edit Profile</button>
        <a class="btn btn-ghost" href="settings.html">Settings</a>
      </div>` : ""}
    </div>
    ${viewedProfile.bio ? `<p id="bio-text">${escapeHtml(viewedProfile.bio)}</p>` : (isSelf ? `<p class="meta" id="bio-text">No bio yet.</p>` : "")}
    <div id="path-mount"></div>
  `;
  if (isSelf) document.getElementById("edit-btn").addEventListener("click", enterEdit);
}

function enterEdit() {
  const header = document.getElementById("profile-header");
  header.innerHTML = `
    <form id="edit-form">
      <div class="field"><label for="e-name">Name</label><input id="e-name" value="${viewedProfile.name.replace(/"/g,"&quot;")}" required></div>
      <div class="field"><label for="e-username">Username</label><input id="e-username" value="${viewedProfile.username.replace(/"/g,"&quot;")}" required></div>
      <div class="field"><label for="e-bio">Bio</label><textarea id="e-bio" rows="3">${viewedProfile.bio || ""}</textarea></div>
      <div style="display:flex; gap:var(--space-2);">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn btn-ghost" id="cancel-edit">Cancel</button>
      </div>
    </form>`;
  document.getElementById("cancel-edit").addEventListener("click", () => { renderHeader(); renderPath(); });
  document.getElementById("edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("e-name").value.trim();
    const username = document.getElementById("e-username").value.trim();
    const bio = document.getElementById("e-bio").value.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return showToast("Username should be 3–20 letters, numbers, or underscores.", { type: "error" });

    const { error } = await supabase.from("profiles").update({ name, username, bio: bio || null }).eq("id", profile.id);
    if (error) return showToast(friendlyError(error), { type: "error" });

    viewedProfile.name = name; viewedProfile.username = username; viewedProfile.bio = bio;
    showToast("Profile updated.", { type: "success" });
    renderHeader(); renderPath();
  });
}

async function renderPath() {
  const parts = await loadAcademicPath(viewedProfile);
  const mount = document.getElementById("path-mount");
  if (!mount) return;
  mount.innerHTML = parts.length ? `<div class="path-stub" style="margin-top: var(--space-3);">
    ${parts.map((p, i) => `${i > 0 ? '<span class="sep">/</span>' : ""}<span class="${i === parts.length - 1 ? "current" : ""}">${escapeHtml(p)}</span>`).join("")}
  </div>` : "";
}

async function renderCourses() {
  const { data } = await supabase.from("user_courses").select("courses(name, code)").eq("user_id", viewedProfile.id);
  const courses = (data || []).map(r => r.courses).filter(Boolean);
  document.getElementById("profile-courses").innerHTML = courses.length
    ? `<div class="ob-chip-row">${courses.map(c => `<span class="chip chip-muted">${escapeHtml(c.name)}</span>`).join("")}</div>`
    : `<p class="meta">No courses listed.</p>`;
}

async function renderDiscussions() {
  const { data } = await supabase.from("discussions").select("id, title, category, created_at").eq("author_id", viewedProfile.id).eq("is_anonymous", false).order("created_at", { ascending: false }).limit(10);
  document.getElementById("profile-discussions").innerHTML = (data && data.length)
    ? data.map(d => `<a class="card discussion-row" href="discussion.html?id=${d.id}" style="margin-bottom: var(--space-2);"><div><span class="category-chip" style="cursor:default;">${d.category.replace(/_/g," ")}</span><h4 style="margin: var(--space-2) 0 0;">${escapeHtml(d.title)}</h4></div></a>`).join("")
    : `<p class="meta">No discussions yet.</p>`;
}

async function renderGroups() {
  const { data } = await supabase.from("study_group_members").select("study_groups(id, name)").eq("user_id", viewedProfile.id);
  const groups = (data || []).map(r => r.study_groups).filter(Boolean);
  document.getElementById("profile-groups").innerHTML = groups.length
    ? `<div class="ob-chip-row">${groups.map(g => `<a class="chip" href="group.html?id=${g.id}">${escapeHtml(g.name)}</a>`).join("")}</div>`
    : `<p class="meta">Not in any study groups yet.</p>`;
}

(async function init() {
  profile = await requireAuth();
  if (!profile) return;
  mountAppShell("profile", profile);

  const targetId = viewId || profile.id;
  isSelf = targetId === profile.id;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", targetId).single();
  if (error || !data) {
    document.getElementById("profile-header").innerHTML = `<div class="empty-state"><h3>Profile not available.</h3><p>It may be private, or the link may be incorrect.</p></div>`;
    return;
  }
  viewedProfile = data;

  renderHeader();
  await renderPath();
  await renderCourses();
  await renderDiscussions();
  await renderGroups();
})();
