// UniCircle — discussions.js
// Lists real discussions from the student's communities, with category
// filtering and a real "New Discussion" composer.

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

let profile;
let myCommunities = [];
let activeCategory = null;

async function loadMyCommunities() {
  const { data } = await supabase
    .from("community_members")
    .select("communities(id, name, level)")
    .eq("user_id", profile.id);
  return (data || []).map(r => r.communities).filter(Boolean);
}

async function loadDiscussions() {
  const communityIds = myCommunities.map(c => c.id);
  const list = document.getElementById("discussion-list");
  if (!communityIds.length) {
    list.innerHTML = emptyState();
    return;
  }

  let q = supabase
    .from("discussions")
    .select("id, title, body, category, is_anonymous, created_at, author_id, community_id, profiles(name, username)")
    .in("community_id", communityIds)
    .order("created_at", { ascending: false });

  if (activeCategory) q = q.eq("category", activeCategory);

  const { data: discussions, error } = await q;
  if (error) { showToast(friendlyError(error), { type: "error" }); return; }

  if (!discussions.length) { list.innerHTML = emptyState(); return; }

  const ids = discussions.map(d => d.id);
  const [{ data: reactions }, { data: comments }, { data: saves }] = await Promise.all([
    supabase.from("reactions").select("discussion_id").in("discussion_id", ids),
    supabase.from("comments").select("discussion_id").in("discussion_id", ids),
    supabase.from("saved_discussions").select("discussion_id").eq("user_id", profile.id).in("discussion_id", ids),
  ]);

  const reactionCounts = {}, commentCounts = {};
  (reactions || []).forEach(r => reactionCounts[r.discussion_id] = (reactionCounts[r.discussion_id] || 0) + 1);
  (comments || []).forEach(c => commentCounts[c.discussion_id] = (commentCounts[c.discussion_id] || 0) + 1);
  const savedIds = new Set((saves || []).map(s => s.discussion_id));

  list.innerHTML = discussions.map((d, i) => `
    <a class="card discussion-row enter-stagger" style="--delay:${i * 30}ms" href="discussion.html?id=${d.id}">
      <div style="flex:1; min-width:0;">
        <span class="category-chip" style="cursor:default;">${d.category.replace(/_/g, " ")}</span>
        <h4 style="margin: var(--space-2) 0 4px;">${escapeHtml(d.title)}</h4>
        <p class="meta" style="margin:0 0 var(--space-2);">${d.is_anonymous ? "Anonymous Student" : escapeHtml(d.profiles?.name || "Unknown")} · ${timeAgo(d.created_at)}</p>
        <p class="meta" style="margin:0;">▲ ${reactionCounts[d.id] || 0} &nbsp; 💬 ${commentCounts[d.id] || 0} ${savedIds.has(d.id) ? "&nbsp; ★ saved" : ""}</p>
      </div>
    </a>`).join("");
}

function emptyState() {
  return `<div class="empty-state">
    <h3>No discussions yet.</h3>
    <p>Your community doesn't have any discussions yet. Start the conversation.</p>
    <button class="btn btn-primary" id="empty-cta">Start a Discussion</button>
  </div>`;
}

function renderCategoryChips() {
  const el = document.getElementById("category-filter");
  el.innerHTML = `
    <button type="button" class="category-chip ${!activeCategory ? "active" : ""}" data-cat="">All</button>
    ${CATEGORIES.map(c => `<button type="button" class="category-chip ${activeCategory === c ? "active" : ""}" data-cat="${c}">${c.replace(/_/g, " ")}</button>`).join("")}
  `;
  el.querySelectorAll(".category-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat || null;
      renderCategoryChips();
      loadDiscussions();
    });
  });
}

function openComposer() {
  if (!myCommunities.length) {
    showToast("Join a community first — finish onboarding to set up your academic identity.", { type: "error" });
    return;
  }
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel">
      <div class="modal-panel-head">
        <h3 style="margin:0;">New Discussion</h3>
        <button class="btn btn-ghost" id="composer-close" aria-label="Close">✕</button>
      </div>
      <form id="composer-form">
        <div class="field">
          <label for="c-community">Post to</label>
          <select id="c-community">
            ${myCommunities.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.level.replace(/_/g, " ")})</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="c-category">Category</label>
          <select id="c-category">
            ${CATEGORIES.map(c => `<option value="${c}">${c.replace(/_/g, " ")}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="c-title">Title</label>
          <input id="c-title" required maxlength="200">
        </div>
        <div class="field">
          <label for="c-body">What's on your mind?</label>
          <textarea id="c-body" rows="5" required></textarea>
        </div>
        <div class="field">
          <label for="c-tags">Tags <span class="meta">(comma separated, optional)</span></label>
          <input id="c-tags" placeholder="midterm, chapter-4">
        </div>
        <div class="field" style="display:flex; align-items:center; gap: var(--space-2);">
          <input type="checkbox" id="c-anon" style="width:auto;">
          <label for="c-anon" style="margin:0;">Post anonymously — your name won't be shown to other students.</label>
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

    const tags = backdrop.querySelector("#c-tags").value.split(",").map(t => t.trim()).filter(Boolean);

    const { data, error } = await supabase.from("discussions").insert({
      author_id: profile.id,
      community_id: backdrop.querySelector("#c-community").value,
      category: backdrop.querySelector("#c-category").value,
      title: backdrop.querySelector("#c-title").value.trim(),
      body: backdrop.querySelector("#c-body").value.trim(),
      tags,
      is_anonymous: backdrop.querySelector("#c-anon").checked,
    }).select().single();

    if (error) {
      showToast(friendlyError(error), { type: "error" });
      submitBtn.classList.remove("btn-loading"); submitBtn.disabled = false;
      return;
    }

    backdrop.remove();
    showToast("Discussion posted.", { type: "success" });
    window.location.href = `discussion.html?id=${data.id}`;
  });
}

(async function init() {
  profile = await requireAuth();
  if (!profile) return;

  mountAppShell("create", profile);
  renderCategoryChips();

  myCommunities = await loadMyCommunities();
  await loadDiscussions();

  document.getElementById("new-discussion-btn").addEventListener("click", openComposer);
  document.addEventListener("click", (e) => { if (e.target.id === "empty-cta") openComposer(); });

  if (window.location.hash === "#new") openComposer();
})();
