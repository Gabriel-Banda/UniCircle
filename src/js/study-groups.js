// UniCircle — study-groups.js

import { supabase, friendlyError } from "./api.js";
import { requireAuth } from "./auth.js";
import { mountAppShell } from "./components/nav.js";
import { showToast } from "./components/toast.js";

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let profile, groups = [], memberCounts = {}, myGroupIds = new Set();
let scope = "all"; // all | mine

async function loadData() {
  const [{ data: g }, { data: members }] = await Promise.all([
    supabase.from("study_groups").select("id, name, description, course_id, courses(name), creator_id").order("created_at", { ascending: false }),
    supabase.from("study_group_members").select("group_id, user_id"),
  ]);
  groups = g || [];
  memberCounts = {};
  (members || []).forEach(m => { memberCounts[m.group_id] = (memberCounts[m.group_id] || 0) + 1; });
  myGroupIds = new Set((members || []).filter(m => m.user_id === profile.id).map(m => m.group_id));
}

function render() {
  const list = document.getElementById("group-list");
  const shown = scope === "mine" ? groups.filter(g => myGroupIds.has(g.id)) : groups;

  if (!shown.length) {
    list.innerHTML = `<div class="empty-state">
      <h3>Find your study crew.</h3>
      <p>Create or join a study group with students from your community.</p>
      <button class="btn btn-primary" id="empty-cta">Create Group</button>
    </div>`;
    document.getElementById("empty-cta")?.addEventListener("click", openCreate);
    return;
  }

  list.innerHTML = `<div class="grid grid-2">${shown.map(g => `
    <div class="card enter">
      ${g.courses?.name ? `<span class="chip chip-muted">${escapeHtml(g.courses.name)}</span>` : ""}
      <h4 style="margin: var(--space-2) 0 4px;"><a href="group.html?id=${g.id}">${escapeHtml(g.name)}</a></h4>
      ${g.description ? `<p style="margin-bottom: var(--space-2);">${escapeHtml(g.description)}</p>` : ""}
      <p class="meta" style="margin-bottom: var(--space-3);">${memberCounts[g.id] || 0} member${memberCounts[g.id] === 1 ? "" : "s"}</p>
      <button class="btn ${myGroupIds.has(g.id) ? "btn-secondary" : "btn-primary"} group-toggle" data-id="${g.id}">
        ${myGroupIds.has(g.id) ? "Joined ✓" : "Join Group"}
      </button>
    </div>`).join("")}</div>`;

  list.querySelectorAll(".group-toggle").forEach(btn => btn.addEventListener("click", () => toggleMembership(btn.dataset.id)));
}

async function toggleMembership(groupId) {
  if (myGroupIds.has(groupId)) {
    await supabase.from("study_group_members").delete().eq("group_id", groupId).eq("user_id", profile.id);
    myGroupIds.delete(groupId);
    memberCounts[groupId] = Math.max(0, (memberCounts[groupId] || 1) - 1);
  } else {
    await supabase.from("study_group_members").insert({ group_id: groupId, user_id: profile.id });
    myGroupIds.add(groupId);
    memberCounts[groupId] = (memberCounts[groupId] || 0) + 1;
  }
  render();
}

async function openCreate() {
  const { data: myCourses } = await supabase.from("user_courses").select("courses(id, name)").eq("user_id", profile.id);
  const courseOptions = (myCourses || []).map(c => c.courses).filter(Boolean);

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel">
      <div class="modal-panel-head"><h3 style="margin:0;">Create Study Group</h3><button class="btn btn-ghost" id="g-close">✕</button></div>
      <form id="g-form">
        <div class="field"><label for="g-name">Group name</label><input id="g-name" required maxlength="120"></div>
        <div class="field"><label for="g-desc">Description</label><textarea id="g-desc" rows="3"></textarea></div>
        <div class="field">
          <label for="g-course">Course <span class="meta">(optional)</span></label>
          <select id="g-course">
            <option value="">— No specific course —</option>
            ${courseOptions.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="g-submit">Create Group</button>
      </form>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("#g-close").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#g-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = backdrop.querySelector("#g-submit");
    btn.classList.add("btn-loading"); btn.disabled = true;
    const { data, error } = await supabase.from("study_groups").insert({
      creator_id: profile.id,
      name: backdrop.querySelector("#g-name").value.trim(),
      description: backdrop.querySelector("#g-desc").value.trim() || null,
      course_id: backdrop.querySelector("#g-course").value || null,
      institution_id: profile.institution_id,
      program_id: profile.program_id,
      academic_year_id: profile.academic_year_id,
    }).select().single();
    if (error) { showToast(friendlyError(error), { type: "error" }); btn.classList.remove("btn-loading"); btn.disabled = false; return; }
    await supabase.from("study_group_members").insert({ group_id: data.id, user_id: profile.id });
    window.location.href = `group.html?id=${data.id}`;
  });
}

(async function init() {
  profile = await requireAuth();
  if (!profile) return;
  mountAppShell("study-groups", profile);

  document.getElementById("new-group-btn").addEventListener("click", openCreate);
  document.querySelectorAll("#scope-filter button").forEach(b => b.addEventListener("click", () => {
    scope = b.dataset.scope;
    document.querySelectorAll("#scope-filter button").forEach(x => x.classList.toggle("active", x === b));
    render();
  }));

  await loadData();
  render();
})();
