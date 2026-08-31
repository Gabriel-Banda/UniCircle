// UniCircle — onboarding.js
// Six-step onboarding: name/username → institution → faculty → program →
// academic year → courses. Each hierarchy step lets the student search
// existing entries or add a new one.

import { supabase, friendlyError, getCurrentProfile } from "./api.js";
import { showToast } from "./components/toast.js";

const state = {
  step: 1,
  name: "",
  username: "",
  institution: null,   // { id, name }
  faculty: null,
  program: null,
  academicYear: null,
  courses: new Map(),  // id -> { id, name, code }
};

const TOTAL_STEPS = 6;

// ---- Generic hierarchy search/create -------------------------------------

async function searchLevel(table, nameCol, query, parentCol, parentId) {
  let q = supabase.from(table).select("*").order(nameCol).limit(8);
  if (parentCol) q = q.eq(parentCol, parentId);
  if (query) q = q.ilike(nameCol, `%${query}%`);
  const { data, error } = await q;
  if (error) { showToast(friendlyError(error), { type: "error" }); return []; }
  return data || [];
}

async function createLevel(table, nameCol, value, parentCol, parentId, extra = {}) {
  const row = { [nameCol]: value, ...extra };
  if (parentCol) row[parentCol] = parentId;
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) { showToast(friendlyError(error), { type: "error" }); return null; }
  return data;
}

// ---- Step config -----------------------------------------------------------

const HIERARCHY_STEPS = {
  2: { table: "institutions", nameCol: "name", parentCol: null, stateKey: "institution", label: "institution" },
  3: { table: "faculties", nameCol: "name", parentCol: "institution_id", stateKey: "faculty", label: "faculty or school" },
  4: { table: "programs", nameCol: "name", parentCol: "faculty_id", stateKey: "program", label: "program" },
  5: { table: "academic_years", nameCol: "label", parentCol: "program_id", stateKey: "academicYear", label: "academic year" },
};

function parentIdFor(step) {
  if (step === 3) return state.institution?.id;
  if (step === 4) return state.faculty?.id;
  if (step === 5) return state.program?.id;
  if (step === 6) return state.academicYear?.id;
  return null;
}

// ---- Rendering --------------------------------------------------------------

const app = document.getElementById("onboarding-app");

function renderProgress() {
  return `<div class="onboard-progress" aria-hidden="true">
    ${Array.from({ length: TOTAL_STEPS }, (_, i) => `<span class="${i < state.step ? "done" : i === state.step - 1 ? "current" : ""}"></span>`).join("")}
  </div>
  <p class="meta">Step ${state.step} of ${TOTAL_STEPS}</p>`;
}

function render() {
  if (state.step === 1) return renderIdentityStep();
  if (state.step >= 2 && state.step <= 5) return renderHierarchyStep(state.step);
  if (state.step === 6) return renderCoursesStep();
  if (state.step === 7) return renderDoneStep();
}

function renderIdentityStep() {
  app.innerHTML = `
    ${renderProgress()}
    <h2>What should we call you?</h2>
    <p>This is how classmates will find and recognize you.</p>
    <div class="field">
      <label for="ob-name">Full name</label>
      <input id="ob-name" value="${state.name}" placeholder="e.g. Amara Chulu">
    </div>
    <div class="field">
      <label for="ob-username">Username</label>
      <input id="ob-username" value="${state.username}" placeholder="e.g. amara_c">
      <div class="field-hint">Letters, numbers, and underscores only.</div>
    </div>
    <div class="onboard-actions">
      <span></span>
      <button class="btn btn-primary" id="ob-next">Continue</button>
    </div>`;

  document.getElementById("ob-next").addEventListener("click", () => {
    const name = document.getElementById("ob-name").value.trim();
    const username = document.getElementById("ob-username").value.trim();
    if (!name) return showToast("Enter your name.", { type: "error" });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return showToast("Username should be 3–20 letters, numbers, or underscores.", { type: "error" });
    state.name = name;
    state.username = username;
    state.step = 2;
    render();
  });
}

function renderHierarchyStep(step) {
  const cfg = HIERARCHY_STEPS[step];
  const selected = state[cfg.stateKey];
  const titles = {
    2: "What's your institution?",
    3: "Which faculty or school?",
    4: "Which program?",
    5: "What academic year are you in?",
  };

  app.innerHTML = `
    ${renderProgress()}
    <h2>${titles[step]}</h2>
    <p>Search for it, or add it if it's not listed yet.</p>
    <div class="field">
      <label for="ob-search" class="visually-hidden">Search</label>
      <input id="ob-search" placeholder="Start typing…" value="${selected ? (selected.name || selected.label) : ""}">
    </div>
    <div id="ob-results" class="ob-results" role="listbox"></div>
    <div class="onboard-actions">
      <button class="btn btn-secondary" id="ob-back">Back</button>
      <button class="btn btn-primary" id="ob-next" ${selected ? "" : "disabled"}>Continue</button>
    </div>`;

  const searchInput = document.getElementById("ob-search");
  const results = document.getElementById("ob-results");
  const nextBtn = document.getElementById("ob-next");

  async function runSearch(query) {
    const parentId = parentIdFor(step);
    const items = await searchLevel(cfg.table, cfg.nameCol, query, cfg.parentCol, parentId);
    const exactMatch = items.some(i => (i[cfg.nameCol] || "").toLowerCase() === query.trim().toLowerCase());

    results.innerHTML = `
      ${items.map(i => `<button type="button" class="ob-result" data-id="${i.id}" data-name="${(i[cfg.nameCol] || "").replace(/"/g, "&quot;")}">${i[cfg.nameCol]}</button>`).join("")}
      ${(query.trim() && !exactMatch) ? `<button type="button" class="ob-result ob-result-add" id="ob-add">+ Add "${query.trim()}" as a new ${cfg.label}</button>` : ""}
    `;

    results.querySelectorAll(".ob-result:not(.ob-result-add)").forEach(btn => {
      btn.addEventListener("click", () => {
        state[cfg.stateKey] = { id: btn.dataset.id, name: btn.dataset.name };
        // clear anything downstream of this level
        clearDownstream(step);
        searchInput.value = btn.dataset.name;
        results.innerHTML = "";
        nextBtn.disabled = false;
      });
    });

    document.getElementById("ob-add")?.addEventListener("click", async () => {
      const parentId2 = parentIdFor(step);
      const created = await createLevel(cfg.table, cfg.nameCol, query.trim(), cfg.parentCol, parentId2);
      if (!created) return;
      state[cfg.stateKey] = { id: created.id, name: created[cfg.nameCol] };
      clearDownstream(step);
      results.innerHTML = "";
      nextBtn.disabled = false;
      showToast(`Added "${created[cfg.nameCol]}".`, { type: "success" });
    });
  }

  let debounce;
  searchInput.addEventListener("input", () => {
    nextBtn.disabled = true;
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(searchInput.value), 220);
  });

  if (selected) runSearch(selected.name || selected.label);
  else runSearch("");

  document.getElementById("ob-back").addEventListener("click", () => { state.step--; render(); });
  nextBtn.addEventListener("click", () => { state.step++; render(); });
}

function clearDownstream(step) {
  if (step <= 2) { state.faculty = null; }
  if (step <= 3) { state.program = null; }
  if (step <= 4) { state.academicYear = null; }
  if (step <= 5) { state.courses.clear(); }
}

function renderCoursesStep() {
  app.innerHTML = `
    ${renderProgress()}
    <h2>Which courses are you taking?</h2>
    <p>Select the ones that apply, or add one that's missing.</p>
    <div class="field">
      <input id="ob-search" placeholder="Search or add a course…">
    </div>
    <div id="ob-results" class="ob-results" role="listbox"></div>
    <div id="ob-selected" class="ob-chip-row"></div>
    <div class="onboard-actions">
      <button class="btn btn-secondary" id="ob-back">Back</button>
      <button class="btn btn-primary" id="ob-next">Continue</button>
    </div>`;

  const searchInput = document.getElementById("ob-search");
  const results = document.getElementById("ob-results");
  const selectedRow = document.getElementById("ob-selected");

  function renderSelected() {
    selectedRow.innerHTML = Array.from(state.courses.values())
      .map(c => `<span class="chip">${c.name}<button type="button" data-id="${c.id}" aria-label="Remove ${c.name}">×</button></span>`).join("");
    selectedRow.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      state.courses.delete(b.dataset.id);
      renderSelected();
    }));
  }
  renderSelected();

  async function runSearch(query) {
    const items = await searchLevel("courses", "name", query, "academic_year_id", state.academicYear.id);
    const exactMatch = items.some(i => i.name.toLowerCase() === query.trim().toLowerCase());
    results.innerHTML = `
      ${items.map(i => `<button type="button" class="ob-result" data-id="${i.id}" data-name="${i.name.replace(/"/g, "&quot;")}">${i.name}${state.courses.has(i.id) ? " ✓" : ""}</button>`).join("")}
      ${(query.trim() && !exactMatch) ? `<button type="button" class="ob-result ob-result-add" id="ob-add">+ Add "${query.trim()}" as a new course</button>` : ""}
    `;
    results.querySelectorAll(".ob-result:not(.ob-result-add)").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (state.courses.has(id)) state.courses.delete(id);
        else state.courses.set(id, { id, name: btn.dataset.name });
        renderSelected();
        runSearch(searchInput.value);
      });
    });
    document.getElementById("ob-add")?.addEventListener("click", async () => {
      const created = await createLevel("courses", "name", query.trim(), "academic_year_id", state.academicYear.id);
      if (!created) return;
      state.courses.set(created.id, { id: created.id, name: created.name });
      renderSelected();
      searchInput.value = "";
      runSearch("");
    });
  }

  let debounce;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(searchInput.value), 220);
  });
  runSearch("");

  document.getElementById("ob-back").addEventListener("click", () => { state.step--; render(); });
  document.getElementById("ob-next").addEventListener("click", finishOnboarding);
}

function renderDoneStep() {
  app.innerHTML = `
    <div class="onboard-done enter">
      <h2>You're all set.</h2>
      <p>Your academic community is ready — it's quiet for now, because it's yours to fill.</p>
      <button class="btn btn-primary" id="ob-finish">Go to your home feed</button>
    </div>`;
  document.getElementById("ob-finish").addEventListener("click", () => { window.location.href = "home.html"; });
}

// ---- Ensure a community exists at a given level, then join it -----------

async function ensureCommunityAndJoin(userId, level, name, idCols) {
  let q = supabase.from("communities").select("id").eq("level", level);
  Object.entries(idCols).forEach(([col, val]) => { q = val ? q.eq(col, val) : q.is(col, null); });
  const { data: existing } = await q.maybeSingle();

  let communityId = existing?.id;
  if (!communityId) {
    const { data: created, error } = await supabase.from("communities")
      .insert({ level, name, ...idCols }).select("id").single();
    if (error) return;
    communityId = created.id;
  }
  await supabase.from("community_members").upsert({ community_id: communityId, user_id: userId });
}

async function finishOnboarding() {
  const nextBtn = document.getElementById("ob-next");
  if (nextBtn) { nextBtn.classList.add("btn-loading"); nextBtn.disabled = true; }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { window.location.href = "login.html"; return; }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    name: state.name,
    username: state.username,
    institution_id: state.institution.id,
    faculty_id: state.faculty.id,
    program_id: state.program.id,
    academic_year_id: state.academicYear.id,
    onboarding_complete: true,
  });

  if (profileError) {
    showToast(friendlyError(profileError), { type: "error" });
    if (nextBtn) { nextBtn.classList.remove("btn-loading"); nextBtn.disabled = false; }
    return;
  }

  await supabase.from("user_settings").upsert({ user_id: user.id });

  if (state.courses.size) {
    await supabase.from("user_courses").insert(
      Array.from(state.courses.keys()).map(courseId => ({ user_id: user.id, course_id: courseId }))
    );
  }

  // Auto-create/join the real communities for each level of this student's identity.
  await ensureCommunityAndJoin(user.id, "institution", state.institution.name, { institution_id: state.institution.id });
  await ensureCommunityAndJoin(user.id, "faculty", state.faculty.name, { institution_id: state.institution.id, faculty_id: state.faculty.id });
  await ensureCommunityAndJoin(user.id, "program", state.program.name, { faculty_id: state.faculty.id, program_id: state.program.id });
  await ensureCommunityAndJoin(user.id, "academic_year", `${state.program.name} — ${state.academicYear.name || state.academicYear.label}`, { program_id: state.program.id, academic_year_id: state.academicYear.id });
  for (const course of state.courses.values()) {
    await ensureCommunityAndJoin(user.id, "course", course.name, { academic_year_id: state.academicYear.id, course_id: course.id });
  }

  state.step = 7;
  render();
}

// ---- Init ---------------------------------------------------------------
// This IS the onboarding page, so the only guard needed is "signed in at
// all" — a fresh signup has no profile row yet, which is expected here.

(async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }

  const existing = await getCurrentProfile();
  if (existing?.onboarding_complete) { window.location.href = "home.html"; return; }

  render();
})();
