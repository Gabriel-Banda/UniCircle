// UniCircle — discussion.js

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
const discussionId = params.get("id");

let profile;
let discussion;
let discussionAuthor = null;
let discussionCommunity = null;
let replyingTo = null; // comment id, or null for a top-level comment

async function notify(userId, type, extra = {}) {
  if (!userId || userId === profile.id) return; // never notify yourself
  await supabase.from("notifications").insert({ user_id: userId, type, actor_id: profile.id, discussion_id: discussionId, ...extra });
}

// ---------- Discussion header ----------

async function loadDiscussion() {
  // Plain, non-embedded query — the discussion row on its own. Author and
  // community are fetched separately below rather than via nested embeds,
  // since a multi-relationship embed here previously broke after schema
  // changes (PostgREST's relationship cache needs to catch up on DDL, and
  // a 2-way embed is exactly what's fragile to that).
  const { data, error } = await supabase
    .from("discussions")
    .select("*")
    .eq("id", discussionId)
    .maybeSingle();

  if (error) console.error("UniCircle: failed to load discussion", error);

  if (error || !data) {
    document.getElementById("discussion-root").innerHTML = `
      <div class="empty-state">
        <h3>This discussion isn't available.</h3>
        <p>It may have been deleted, or the link is incorrect.</p>
        <a class="btn btn-secondary" href="discussions.html">Back to Discussions</a>
      </div>`;
    return null;
  }
  return data;
}

async function loadAuthorAndCommunity(d) {
  const [authorRes, communityRes] = await Promise.all([
    d.author_id ? supabase.from("profiles").select("id, name, username").eq("id", d.author_id).maybeSingle() : Promise.resolve({ data: null }),
    d.community_id ? supabase.from("communities").select("id, name, level").eq("id", d.community_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  discussionAuthor = authorRes.data;
  discussionCommunity = communityRes.data;
}

async function renderHeader() {
  const isAuthor = discussion.author_id === profile.id;
  const { data: reactions } = await supabase.from("reactions").select("user_id").eq("discussion_id", discussionId);
  const { data: saved } = await supabase.from("saved_discussions").select("user_id").eq("discussion_id", discussionId).eq("user_id", profile.id).maybeSingle();

  const iReacted = (reactions || []).some(r => r.user_id === profile.id);

  document.getElementById("discussion-root").innerHTML = `
    <div class="path-stub" style="margin-bottom: var(--space-4);">
      <a href="communities.html">Communities</a><span class="sep">/</span>
      <span class="current">${escapeHtml(discussionCommunity?.name || "")}</span>
    </div>

    <span class="category-chip" data-category="${discussion.category}" style="cursor:default;">${discussion.category.replace(/_/g, " ")}</span>
    <h1 style="margin: var(--space-3) 0 var(--space-2);" id="d-title">${escapeHtml(discussion.title)}</h1>
    <p class="meta" style="margin-bottom: var(--space-4);">
      ${discussion.is_anonymous ? "Anonymous Student" : `<a href="profile.html?id=${discussionAuthor?.id || ""}">${escapeHtml(discussionAuthor?.name || "Unknown")}</a>`}
      · ${timeAgo(discussion.created_at)}
      ${discussion.updated_at !== discussion.created_at ? " · edited" : ""}
    </p>

    <div class="card" id="d-body-card">
      <p id="d-body" style="white-space:pre-wrap; margin-bottom:0;">${escapeHtml(discussion.body)}</p>
    </div>

    ${discussion.tags?.length ? `<div class="ob-chip-row" style="margin-top: var(--space-3);">${discussion.tags.map(t => `<span class="chip chip-muted">#${escapeHtml(t)}</span>`).join("")}</div>` : ""}

    <div style="display:flex; gap: var(--space-2); margin: var(--space-4) 0; flex-wrap:wrap;">
      <button class="reaction-btn upvote-pop ${iReacted ? "active" : ""}" id="react-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
        <span id="react-count">${(reactions || []).length}</span>
      </button>
      <button class="save-btn save-pop ${saved ? "active" : ""}" id="save-btn">${saved ? "★ Saved" : "☆ Save"}</button>
      <button class="btn btn-ghost" id="share-btn">Share</button>
      ${isAuthor ? `
        <button class="btn btn-ghost" id="edit-btn">Edit</button>
        <button class="btn btn-ghost" id="delete-btn" style="color:var(--brick);">Delete</button>
      ` : `<button class="btn btn-ghost" id="report-btn">Report</button>`}
    </div>
  `;

  document.getElementById("react-btn").addEventListener("click", toggleReaction);
  document.getElementById("save-btn").addEventListener("click", toggleSave);
  document.getElementById("share-btn").addEventListener("click", () => {
    navigator.clipboard?.writeText(window.location.href);
    showToast("Link copied.", { type: "success" });
  });

  if (isAuthor) {
    document.getElementById("edit-btn").addEventListener("click", enterEditMode);
    document.getElementById("delete-btn").addEventListener("click", deleteDiscussion);
  } else {
    document.getElementById("report-btn").addEventListener("click", () => reportContent({ discussion_id: discussionId }));
  }
}

async function toggleReaction() {
  const btn = document.getElementById("react-btn");
  const countEl = document.getElementById("react-count");
  const { data: existing } = await supabase.from("reactions").select("id").eq("discussion_id", discussionId).eq("user_id", profile.id).maybeSingle();

  if (existing) {
    await supabase.from("reactions").delete().eq("id", existing.id);
    btn.classList.remove("active");
    countEl.textContent = Number(countEl.textContent) - 1;
  } else {
    await supabase.from("reactions").insert({ discussion_id: discussionId, user_id: profile.id, type: "upvote" });
    btn.classList.add("active");
    btn.classList.remove("active"); void btn.offsetWidth; btn.classList.add("active"); // restart pop
    countEl.textContent = Number(countEl.textContent) + 1;
    await notify(discussion.author_id, "reaction");
  }
}

async function toggleSave() {
  const btn = document.getElementById("save-btn");
  const { data: existing } = await supabase.from("saved_discussions").select("*").eq("discussion_id", discussionId).eq("user_id", profile.id).maybeSingle();
  if (existing) {
    await supabase.from("saved_discussions").delete().eq("discussion_id", discussionId).eq("user_id", profile.id);
    btn.classList.remove("active");
    btn.textContent = "☆ Save";
  } else {
    await supabase.from("saved_discussions").insert({ discussion_id: discussionId, user_id: profile.id });
    btn.classList.add("active");
    btn.textContent = "★ Saved";
  }
}

function enterEditMode() {
  const bodyCard = document.getElementById("d-body-card");
  const titleEl = document.getElementById("d-title");
  const currentTitle = discussion.title;
  const currentBody = discussion.body;

  titleEl.outerHTML = `<input id="d-title-input" value="${currentTitle.replace(/"/g, "&quot;")}" style="width:100%; font-family:var(--font-display); font-size: var(--text-2xl); font-weight:600; margin:var(--space-3) 0 var(--space-2); padding:8px; border:1px solid var(--line); border-radius:var(--radius-md);">`;
  bodyCard.innerHTML = `
    <textarea id="d-body-input" rows="6" style="width:100%; border:1px solid var(--line); border-radius:var(--radius-md); padding:var(--space-3);">${currentBody}</textarea>
    <div style="display:flex; gap:var(--space-2); margin-top:var(--space-3);">
      <button class="btn btn-primary" id="save-edit-btn">Save changes</button>
      <button class="btn btn-secondary" id="cancel-edit-btn">Cancel</button>
    </div>`;

  document.getElementById("cancel-edit-btn").addEventListener("click", () => renderHeader());
  document.getElementById("save-edit-btn").addEventListener("click", async () => {
    const newTitle = document.getElementById("d-title-input").value.trim();
    const newBody = document.getElementById("d-body-input").value.trim();
    if (!newTitle || !newBody) return showToast("Title and body can't be empty.", { type: "error" });

    const { error } = await supabase.from("discussions").update({ title: newTitle, body: newBody, updated_at: new Date().toISOString() }).eq("id", discussionId);
    if (error) return showToast(friendlyError(error), { type: "error" });

    discussion.title = newTitle; discussion.body = newBody; discussion.updated_at = new Date().toISOString();
    showToast("Discussion updated.", { type: "success" });
    renderHeader();
  });
}

async function deleteDiscussion() {
  if (!confirm("Delete this discussion? This can't be undone.")) return;
  const { error } = await supabase.from("discussions").delete().eq("id", discussionId);
  if (error) return showToast(friendlyError(error), { type: "error" });
  showToast("Discussion deleted.", { type: "success" });
  window.location.href = "discussions.html";
}

function reportContent({ discussion_id = null, comment_id = null }) {
  const reason = prompt("Why are you reporting this? A short reason helps moderators review it.");
  if (!reason || !reason.trim()) return;
  supabase.from("reports").insert({ reporter_id: profile.id, discussion_id, comment_id, reason: reason.trim() })
    .then(({ error }) => showToast(error ? friendlyError(error) : "Report submitted. Thanks for flagging this.", { type: error ? "error" : "success" }));
}

// ---------- Comments ----------

async function loadComments() {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("discussion_id", discussionId)
    .order("created_at", { ascending: true });
  if (error) { console.error("UniCircle: failed to load comments", error); showToast(friendlyError(error), { type: "error" }); return []; }

  const comments = data || [];
  const authorIds = [...new Set(comments.map(c => c.author_id))];
  const authorsById = {};
  if (authorIds.length) {
    const { data: authors } = await supabase.from("profiles").select("id, name, username").in("id", authorIds);
    (authors || []).forEach(a => { authorsById[a.id] = a; });
  }
  comments.forEach(c => { c.author = authorsById[c.author_id] || null; });
  return comments;
}

async function renderComments() {
  const comments = await loadComments();
  const list = document.getElementById("comment-list");
  document.getElementById("comment-count").textContent = comments.length;

  if (!comments.length) {
    list.innerHTML = `<p class="meta" style="padding: var(--space-4) 0;">No comments yet. Be the first to respond.</p>`;
    return;
  }

  const ids = comments.map(c => c.id);
  const { data: reactions } = await supabase.from("reactions").select("comment_id, user_id").in("comment_id", ids);
  const reactionsByComment = {};
  (reactions || []).forEach(r => {
    if (!reactionsByComment[r.comment_id]) reactionsByComment[r.comment_id] = [];
    reactionsByComment[r.comment_id].push(r.user_id);
  });

  list.innerHTML = comments.map(c => {
    const isOwn = c.author_id === profile.id;
    const isReply = !!c.parent_comment_id;
    const myReaction = (reactionsByComment[c.id] || []).includes(profile.id);
    return `
    <div class="comment ${isReply ? "is-reply" : ""}" data-id="${c.id}">
      <span class="avatar-chip">${c.is_anonymous ? "?" : (c.author?.name || "?").trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()).join("")}</span>
      <div class="comment-body">
        <p class="meta" style="margin:0 0 2px;">${c.is_anonymous ? "Anonymous Student" : escapeHtml(c.author?.name || "Unknown")} · ${timeAgo(c.created_at)}</p>
        <p style="white-space:pre-wrap; margin:0;" class="c-text">${escapeHtml(c.body)}</p>
        <div class="comment-actions">
          <button class="c-upvote" data-id="${c.id}">▲ ${(reactionsByComment[c.id] || []).length}${myReaction ? " (you)" : ""}</button>
          <button class="c-reply" data-id="${c.id}">Reply</button>
          ${isOwn ? `<button class="c-edit" data-id="${c.id}">Edit</button><button class="c-delete" data-id="${c.id}">Delete</button>` : `<button class="c-report" data-id="${c.id}">Report</button>`}
        </div>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll(".c-upvote").forEach(btn => btn.addEventListener("click", () => toggleCommentReaction(btn.dataset.id)));
  list.querySelectorAll(".c-reply").forEach(btn => btn.addEventListener("click", () => {
    replyingTo = btn.dataset.id;
    updateReplyBanner();
    document.getElementById("comment-input").focus();
  }));
  list.querySelectorAll(".c-delete").forEach(btn => btn.addEventListener("click", () => deleteComment(btn.dataset.id)));
  list.querySelectorAll(".c-edit").forEach(btn => btn.addEventListener("click", () => editCommentInline(btn.dataset.id)));
  list.querySelectorAll(".c-report").forEach(btn => btn.addEventListener("click", () => reportContent({ comment_id: btn.dataset.id })));
}

async function toggleCommentReaction(commentId) {
  const { data: existing } = await supabase.from("reactions").select("id").eq("comment_id", commentId).eq("user_id", profile.id).maybeSingle();
  if (existing) {
    await supabase.from("reactions").delete().eq("id", existing.id);
  } else {
    await supabase.from("reactions").insert({ comment_id: commentId, user_id: profile.id, type: "upvote" });
    const { data: c } = await supabase.from("comments").select("author_id").eq("id", commentId).single();
    if (c) await notify(c.author_id, "reaction", { comment_id: commentId });
  }
  renderComments();
}

function updateReplyBanner() {
  const banner = document.getElementById("reply-banner");
  if (replyingTo) {
    banner.hidden = false;
    banner.querySelector("span").textContent = "Replying to a comment";
  } else {
    banner.hidden = true;
  }
}

async function editCommentInline(commentId) {
  const row = document.querySelector(`.comment[data-id="${commentId}"] .comment-body`);
  const textEl = row.querySelector(".c-text");
  const current = textEl.textContent;
  row.querySelector(".comment-actions").hidden = true;
  textEl.outerHTML = `
    <textarea class="c-edit-input" rows="3" style="width:100%; border:1px solid var(--line); border-radius:var(--radius-md); padding:var(--space-2);">${current}</textarea>
    <div style="display:flex; gap:var(--space-2); margin-top:var(--space-2);">
      <button class="btn btn-secondary" id="c-save-${commentId}">Save</button>
      <button class="btn btn-ghost" id="c-cancel-${commentId}">Cancel</button>
    </div>`;
  document.getElementById(`c-cancel-${commentId}`).addEventListener("click", () => renderComments());
  document.getElementById(`c-save-${commentId}`).addEventListener("click", async () => {
    const newText = row.querySelector(".c-edit-input").value.trim();
    if (!newText) return showToast("Comment can't be empty.", { type: "error" });
    const { error } = await supabase.from("comments").update({ body: newText, updated_at: new Date().toISOString() }).eq("id", commentId);
    if (error) return showToast(friendlyError(error), { type: "error" });
    renderComments();
  });
}

async function deleteComment(commentId) {
  if (!confirm("Delete this comment?")) return;
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return showToast(friendlyError(error), { type: "error" });
  renderComments();
}

async function submitComment() {
  const input = document.getElementById("comment-input");
  const anon = document.getElementById("comment-anon");
  const body = input.value.trim();
  if (!body) return;

  const { data, error } = await supabase.from("comments").insert({
    discussion_id: discussionId,
    author_id: profile.id,
    parent_comment_id: replyingTo,
    body,
    is_anonymous: anon.checked,
  }).select().single();

  if (error) return showToast(friendlyError(error), { type: "error" });

  if (replyingTo) {
    const { data: parent } = await supabase.from("comments").select("author_id").eq("id", replyingTo).single();
    if (parent) await notify(parent.author_id, "reply_to_comment", { comment_id: data.id });
  } else {
    await notify(discussion.author_id, "reply_to_discussion", { comment_id: data.id });
  }

  input.value = "";
  replyingTo = null;
  updateReplyBanner();
  renderComments();
}

// ---------- Init ----------

(async function init() {
  if (!discussionId) { window.location.href = "discussions.html"; return; }

  profile = await requireAuth();
  if (!profile) return;
  mountAppShell("home", profile);

  discussion = await loadDiscussion();
  if (!discussion) return;
  await loadAuthorAndCommunity(discussion);

  await renderHeader();
  await renderComments();

  document.getElementById("comment-submit").addEventListener("click", submitComment);
  document.getElementById("reply-cancel").addEventListener("click", () => { replyingTo = null; updateReplyBanner(); });
})();
