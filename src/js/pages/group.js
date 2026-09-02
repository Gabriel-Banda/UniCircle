// Single Study Group Room Controller
import { initTheme, formatTimeAgo, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

const params = new URLSearchParams(window.location.search);
const groupId = params.get('id');

let currentGroup = null;

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('groups');

  if (!groupId) {
    window.location.href = '/pages/groups.html';
    return;
  }

  await loadGroup();
  setupMessageForm();
}

async function loadGroup() {
  const headerCard = document.getElementById('group-header-card');
  const membersList = document.getElementById('group-members-list');
  const membersTitle = document.getElementById('members-list-title');

  try {
    const res = await api.get(`/groups/${groupId}`);
    currentGroup = res.group;
    const g = currentGroup;

    headerCard.innerHTML = `
      <div class="card animate-fade-in" style="border-left: 5px solid var(--brand-primary); padding: 1.75rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              ${g.course_code ? `<span class="badge badge-course">${escapeHTML(g.course_code)}: ${escapeHTML(g.course_name || '')}</span>` : '<span class="badge">Study Group</span>'}
              <span style="font-size: 0.75rem; color: var(--text-tertiary);">Created by @${escapeHTML(g.creator_username)}</span>
            </div>
            <h1 style="font-size: 1.65rem; margin-bottom: 0.5rem;">${escapeHTML(g.name)}</h1>
            <p style="font-size: 0.9375rem; color: var(--text-secondary); max-width: 650px;">${escapeHTML(g.description || '')}</p>
          </div>

          <button id="group-join-toggle-btn" class="btn ${g.is_member ? 'btn-secondary' : 'btn-primary'} btn-interactive">
            ${g.is_member ? 'Leave Group' : 'Join Study Group'}
          </button>
        </div>
      </div>
    `;

    const joinBtn = headerCard.querySelector('#group-join-toggle-btn');
    if (joinBtn) {
      joinBtn.onclick = async () => {
        try {
          if (g.is_member) {
            await api.delete(`/groups/${groupId}/join`);
            toast.info('Left study group.');
          } else {
            await api.post(`/groups/${groupId}/join`);
            toast.success('Joined study group!');
          }
          await loadGroup();
        } catch (err) {
          toast.error(err.message);
        }
      };
    }

    // Render Members
    const members = g.members || [];
    if (membersTitle) membersTitle.textContent = `Group Members (${members.length}/${g.max_members})`;
    if (membersList) {
      membersList.innerHTML = members.map(m => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0;">
          <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
            <div class="avatar avatar-sm" style="background-color: ${m.avatar_color || '#4f46e5'}; width: 1.5rem; height: 1.5rem; font-size: 0.65rem;">
              ${getInitials(m.name)}
            </div>
            <a href="/pages/profile.html?u=${encodeURIComponent(m.username)}" style="font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHTML(m.name)}
            </a>
          </div>
          ${m.role === 'admin' ? '<span class="badge badge-brand" style="font-size: 0.65rem;">Admin</span>' : ''}
        </div>
      `).join('');
    }

    if (g.is_member || auth.getUser().role === 'admin') {
      await loadMessages();
    } else {
      const msgContainer = document.getElementById('group-messages-container');
      if (msgContainer) {
        msgContainer.innerHTML = renderEmptyState({
          icon: '🔒',
          title: 'Members Only',
          description: 'Join this study group above to view and participate in group study discussions.',
          actionText: 'Join Group',
          actionId: 'msg-join-btn'
        });
        const msgJoinBtn = document.getElementById('msg-join-btn');
        if (msgJoinBtn) {
          msgJoinBtn.onclick = () => joinBtn.click();
        }
      }
    }
  } catch (err) {
    headerCard.innerHTML = `<p style="color: var(--accent-rose);">Failed to load study group.</p>`;
  }
}

async function loadMessages() {
  const container = document.getElementById('group-messages-container');
  if (!container) return;

  try {
    const res = await api.get(`/groups/${groupId}/messages`);
    const messages = res.messages || [];

    if (messages.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '💬',
        title: 'No group messages yet',
        description: 'Post the first study resource, question, or note to your group members below.'
      });
      return;
    }

    const currentUserId = auth.getUser().id;

    container.innerHTML = messages.map(m => {
      const isMe = m.sender_id === currentUserId;
      return `
        <div style="display: flex; gap: 0.625rem; align-items: flex-start; ${isMe ? 'flex-direction: row-reverse;' : ''}">
          <div class="avatar avatar-sm" style="background-color: ${m.sender_avatar_color || '#4f46e5'}; width: 1.75rem; height: 1.75rem; font-size: 0.7rem;">
            ${getInitials(m.sender_name)}
          </div>
          <div style="max-width: 75%; background: ${isMe ? 'var(--brand-primary-light)' : 'var(--bg-surface-elevated)'}; border: 1px solid ${isMe ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-color)'}; padding: 0.6rem 0.85rem; border-radius: var(--radius-lg);">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.2rem;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-primary);">${isMe ? 'You' : escapeHTML(m.sender_name)}</span>
              <span style="font-size: 0.6875rem; color: var(--text-tertiary);">${formatTimeAgo(m.created_at)}</span>
            </div>
            <div style="font-size: 0.875rem; color: var(--text-primary); line-height: 1.4; word-break: break-word;">${escapeHTML(m.message)}</div>
          </div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load messages.</p>`;
  }
}

function setupMessageForm() {
  const form = document.getElementById('group-msg-form');
  const input = document.getElementById('msg-input');
  if (form && input) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message) return;

      try {
        await api.post(`/groups/${groupId}/messages`, { message });
        input.value = '';
        await loadMessages();
      } catch (err) {
        toast.error(err.message || 'Failed to send message.');
      }
    };
  }
}

init();
