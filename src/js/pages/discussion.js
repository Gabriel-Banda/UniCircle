// Single Discussion Thread & Comment Controller
import { initTheme, formatTimeAgo, CATEGORY_ICONS, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { modal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

const params = new URLSearchParams(window.location.search);
const discussionId = params.get('id');

let currentDiscussion = null;

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('discussions');

  if (!discussionId) {
    window.location.href = '/pages/discussions.html';
    return;
  }

  await loadDiscussion();
  await loadComments();
  setupCommentForm();
}

async function loadDiscussion() {
  const container = document.getElementById('single-discussion-container');
  if (!container) return;

  try {
    const res = await api.get(`/discussions/${discussionId}`);
    currentDiscussion = res.discussion;
    renderDiscussionMain(currentDiscussion);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem;">
        <h3 style="color: var(--accent-rose);">Discussion Not Found</h3>
        <p style="margin: 0.5rem 0 1.5rem 0;">This discussion may have been removed or deleted.</p>
        <a href="/pages/discussions.html" class="btn btn-secondary">Back to Discussions</a>
      </div>
    `;
  }
}

function renderDiscussionMain(d) {
  const container = document.getElementById('single-discussion-container');
  const icon = CATEGORY_ICONS[d.category] || '📌';
  const authorInitials = getInitials(d.author ? d.author.name : 'Student');
  const authorAvatarColor = d.author ? d.author.avatar_color : '#4F46E5';

  container.innerHTML = `
    <div class="card animate-fade-in" style="padding: 1.75rem;">
      <div class="discussion-meta" style="margin-bottom: 1.25rem;">
        <div class="author-chip">
          <div class="avatar avatar-md" style="background-color: ${authorAvatarColor};">
            ${authorInitials}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary);">
              ${d.is_anonymous ? `<span class="badge badge-anonymous">🎭 ${escapeHTML(d.author.name)}</span>` : escapeHTML(d.author.name)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary);">
              Posted ${formatTimeAgo(d.created_at)} • 👁️ ${d.view_count || 0} views
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          <span class="badge badge-brand">${icon} ${escapeHTML(d.category)}</span>
          ${d.course_code ? `
            <a href="/pages/course.html?id=${d.course_id}" class="badge badge-course" style="cursor: pointer;">
              📖 ${escapeHTML(d.course_code)}: ${escapeHTML(d.course_name)}
            </a>
          ` : ''}
        </div>
      </div>

      <h1 style="font-size: 1.65rem; margin-bottom: 1rem; line-height: 1.35;">
        ${escapeHTML(d.title)}
      </h1>

      <div style="font-size: 1rem; color: var(--text-primary); line-height: 1.7; white-space: pre-wrap; margin-bottom: 1.5rem; word-break: break-word;">
        ${escapeHTML(d.body)}
      </div>

      ${d.attachment_url ? `
        <div style="margin-bottom: 1.5rem; padding: 0.875rem 1.25rem; background: var(--bg-surface-elevated); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem;">
            <span>📎</span>
            <span style="font-weight: 600;">${escapeHTML(d.attachment_name || 'Attached Resource')}</span>
          </div>
          <a href="${d.attachment_url}" target="_blank" download class="btn btn-secondary btn-sm">Download / View</a>
        </div>
      ` : ''}

      ${d.tags && d.tags.length > 0 ? `
        <div style="display: flex; gap: 0.375rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
          ${d.tags.map(t => `<span class="badge">#${escapeHTML(t)}</span>`).join('')}
        </div>
      ` : ''}

      <div class="discussion-footer" style="padding-top: 1rem;">
        <div class="interaction-group">
          <button id="thread-upvote-btn" class="action-btn ${d.is_upvoted ? 'active-upvote' : ''}">
            <span>▲</span>
            <span id="thread-upvote-count">${d.upvotes_count || 0}</span>
            <span>Upvote</span>
          </button>

          <button id="thread-save-btn" class="action-btn ${d.is_saved ? 'active-saved' : ''}">
            <span>${d.is_saved ? '🔖 Saved' : '🏷️ Save'}</span>
          </button>

          <button id="thread-share-btn" class="action-btn">
            <span>🔗 Share</span>
          </button>
        </div>

        <div class="interaction-group">
          ${d.is_author || auth.getUser().role === 'admin' || auth.getUser().role === 'moderator' ? `
            <button id="thread-delete-btn" class="btn btn-danger btn-sm">Delete</button>
          ` : `
            <button id="thread-report-btn" class="btn btn-ghost btn-sm" style="color: var(--text-tertiary);">Report</button>
          `}
        </div>
      </div>
    </div>
  `;

  // Upvote Event
  const upvoteBtn = container.querySelector('#thread-upvote-btn');
  if (upvoteBtn) {
    upvoteBtn.onclick = async () => {
      try {
        const res = await api.post(`/discussions/${d.id}/upvote`);
        container.querySelector('#thread-upvote-count').textContent = res.upvotes_count;
        if (res.is_upvoted) upvoteBtn.classList.add('active-upvote', 'upvote-active');
        else upvoteBtn.classList.remove('active-upvote', 'upvote-active');
      } catch (err) {
        toast.error(err.message);
      }
    };
  }

  // Save Event
  const saveBtn = container.querySelector('#thread-save-btn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      try {
        const res = await api.post(`/discussions/${d.id}/save`);
        if (res.is_saved) {
          saveBtn.classList.add('active-saved');
          saveBtn.innerHTML = '<span>🔖 Saved</span>';
          toast.success('Saved to bookmarks.');
        } else {
          saveBtn.classList.remove('active-saved');
          saveBtn.innerHTML = '<span>🏷️ Save</span>';
          toast.info('Removed from bookmarks.');
        }
      } catch (err) {
        toast.error(err.message);
      }
    };
  }

  // Share Event
  const shareBtn = container.querySelector('#thread-share-btn');
  if (shareBtn) {
    shareBtn.onclick = () => {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Discussion link copied to clipboard! 📋');
    };
  }

  // Report Event
  const reportBtn = container.querySelector('#thread-report-btn');
  if (reportBtn) {
    reportBtn.onclick = () => {
      modal.showReportModal({
        targetType: 'discussion',
        targetId: d.id,
        targetName: 'discussion'
      });
    };
  }

  // Delete Event
  const deleteBtn = container.querySelector('#thread-delete-btn');
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      modal.showConfirmModal({
        title: 'Delete Discussion?',
        message: 'Are you sure you want to permanently delete this discussion and all its replies?',
        confirmText: 'Delete',
        isDanger: true,
        onConfirm: async () => {
          try {
            await api.delete(`/discussions/${d.id}`);
            toast.success('Discussion deleted.');
            window.location.href = '/pages/discussions.html';
          } catch (err) {
            toast.error(err.message || 'Failed to delete.');
          }
        }
      });
    };
  }
}

async function loadComments() {
  const container = document.getElementById('comments-tree-container');
  const titleEl = document.getElementById('comments-header-title');
  if (!container) return;

  try {
    const res = await api.get(`/discussions/${discussionId}/comments`);
    const comments = res.comments || [];
    if (titleEl) titleEl.textContent = `Replies (${res.total || 0})`;

    if (comments.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '💡',
        title: 'No replies yet',
        description: 'Be the first student to share your answer or thoughts on this discussion.'
      });
      return;
    }

    container.innerHTML = comments.map(c => renderCommentItem(c)).join('');
    attachCommentEvents(container);
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load comments.</p>`;
  }
}

function renderCommentItem(c, isReply = false) {
  const authorInitials = getInitials(c.author ? c.author.name : 'Student');
  const authorAvatarColor = c.author ? c.author.avatar_color : '#4F46E5';

  return `
    <div class="comment-block ${isReply ? 'comment-reply' : ''}" id="${c.id}" style="${isReply ? 'margin-left: 2rem; border-left: 2px solid var(--border-color); padding-left: 1rem; margin-top: 0.75rem;' : 'padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);'}">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
        <div class="author-chip">
          <div class="avatar avatar-sm" style="background-color: ${authorAvatarColor};">
            ${authorInitials}
          </div>
          <div>
            <span style="font-weight: 700; font-size: 0.875rem; color: var(--text-primary);">
              ${c.is_anonymous ? `<span class="badge badge-anonymous">🎭 ${escapeHTML(c.author.name)}</span>` : escapeHTML(c.author.name)}
            </span>
            <span class="post-time" style="margin-left: 0.375rem;">${formatTimeAgo(c.created_at)}</span>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          ${c.is_author || auth.getUser().role === 'admin' || auth.getUser().role === 'moderator' ? `
            <button class="btn-ghost btn-sm delete-comment-btn" data-id="${c.id}" style="color: var(--accent-rose); font-size: 0.75rem;">Delete</button>
          ` : `
            <button class="btn-ghost btn-sm report-comment-btn" data-id="${c.id}" style="color: var(--text-tertiary); font-size: 0.75rem;">Report</button>
          `}
        </div>
      </div>

      <div style="font-size: 0.9375rem; color: var(--text-primary); line-height: 1.6; margin-bottom: 0.75rem; white-space: pre-wrap;">
        ${escapeHTML(c.body)}
      </div>

      <div style="display: flex; align-items: center; gap: 1rem;">
        <button class="action-btn upvote-comment-btn ${c.is_upvoted ? 'active-upvote' : ''}" data-id="${c.id}">
          <span>▲</span>
          <span class="cmt-upvote-count">${c.upvotes_count || 0}</span>
        </button>

        <button class="action-btn reply-toggle-btn" data-id="${c.id}">
          <span>💬 Reply</span>
        </button>
      </div>

      <!-- Nested Reply Input Box (Hidden by default) -->
      <div id="reply-box-${c.id}" style="display: none; margin-top: 0.75rem; padding: 0.75rem; background: var(--bg-surface-elevated); border-radius: var(--radius-md);">
        <textarea class="textarea-field reply-textarea" placeholder="Write a reply..." style="min-height: 60px; margin-bottom: 0.5rem; font-size: 0.875rem;"></textarea>
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <label style="display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: var(--text-secondary);">
            <input type="checkbox" class="reply-anon-cb" style="accent-color: var(--brand-primary);" />
            <span>Anonymous</span>
          </label>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-secondary btn-sm cancel-reply-btn" data-id="${c.id}">Cancel</button>
            <button class="btn btn-primary btn-sm submit-reply-btn" data-id="${c.id}">Send Reply</button>
          </div>
        </div>
      </div>

      <!-- Nested Replies List -->
      ${c.replies && c.replies.length > 0 ? `
        <div class="nested-replies-list" style="margin-top: 0.75rem;">
          ${c.replies.map(r => renderCommentItem(r, true)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function attachCommentEvents(container) {
  // Upvote comment
  container.querySelectorAll('.upvote-comment-btn').forEach(btn => {
    btn.onclick = async () => {
      const cId = btn.dataset.id;
      try {
        const res = await api.post(`/comments/${cId}/upvote`);
        btn.querySelector('.cmt-upvote-count').textContent = res.upvotes_count;
        if (res.is_upvoted) btn.classList.add('active-upvote', 'upvote-active');
        else btn.classList.remove('active-upvote', 'upvote-active');
      } catch (err) {
        toast.error(err.message);
      }
    };
  });

  // Toggle reply box
  container.querySelectorAll('.reply-toggle-btn').forEach(btn => {
    btn.onclick = () => {
      const cId = btn.dataset.id;
      const box = container.querySelector(`#reply-box-${cId}`);
      if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      }
    };
  });

  container.querySelectorAll('.cancel-reply-btn').forEach(btn => {
    btn.onclick = () => {
      const cId = btn.dataset.id;
      const box = container.querySelector(`#reply-box-${cId}`);
      if (box) box.style.display = 'none';
    };
  });

  // Submit nested reply
  container.querySelectorAll('.submit-reply-btn').forEach(btn => {
    btn.onclick = async () => {
      const parentId = btn.dataset.id;
      const box = container.querySelector(`#reply-box-${parentId}`);
      const textarea = box.querySelector('.reply-textarea');
      const anonCb = box.querySelector('.reply-anon-cb');
      const body = textarea.value.trim();

      if (!body) {
        toast.error('Reply cannot be empty.');
        return;
      }

      btn.disabled = true;
      try {
        await api.post(`/discussions/${discussionId}/comments`, {
          body,
          parent_id: parentId,
          is_anonymous: anonCb.checked
        });
        toast.success('Reply posted!');
        loadComments();
      } catch (err) {
        toast.error(err.message || 'Failed to post reply.');
        btn.disabled = false;
      }
    };
  });

  // Delete comment
  container.querySelectorAll('.delete-comment-btn').forEach(btn => {
    btn.onclick = () => {
      const cId = btn.dataset.id;
      modal.showConfirmModal({
        title: 'Delete Comment?',
        message: 'Are you sure you want to delete this reply?',
        confirmText: 'Delete',
        isDanger: true,
        onConfirm: async () => {
          try {
            await api.delete(`/comments/${cId}`);
            toast.success('Comment deleted.');
            loadComments();
          } catch (err) {
            toast.error(err.message || 'Failed to delete comment.');
          }
        }
      });
    };
  });

  // Report comment
  container.querySelectorAll('.report-comment-btn').forEach(btn => {
    btn.onclick = () => {
      const cId = btn.dataset.id;
      modal.showReportModal({
        targetType: 'comment',
        targetId: cId,
        targetName: 'comment'
      });
    };
  });
}

function setupCommentForm() {
  const form = document.getElementById('new-comment-form');
  const submitBtn = document.getElementById('submit-comment-btn');
  const bodyInput = document.getElementById('comment-body-input');
  const anonCb = document.getElementById('comment-anonymous-cb');

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = bodyInput.value.trim();
      if (!body) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting...';

      try {
        await api.post(`/discussions/${discussionId}/comments`, {
          body,
          is_anonymous: anonCb.checked
        });
        bodyInput.value = '';
        toast.success('Reply added successfully!');
        loadComments();
      } catch (err) {
        toast.error(err.message || 'Failed to post reply.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post Reply';
      }
    };
  }
}

init();
