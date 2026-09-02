// Single Community Hub JS Controller
import { initTheme, formatTimeAgo, CATEGORY_ICONS, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { modal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

const params = new URLSearchParams(window.location.search);
const communityId = params.get('id');

let currentCommunity = null;

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('communities');

  if (!communityId) {
    window.location.href = '/pages/communities.html';
    return;
  }

  await loadCommunityHeader();
  await loadCommunityDiscussions();
}

async function loadCommunityHeader() {
  const card = document.getElementById('community-header-card');
  if (!card) return;

  try {
    const res = await api.get(`/communities/${communityId}`);
    currentCommunity = res.community;
    const c = currentCommunity;

    card.innerHTML = `
      <div class="card animate-fade-in" style="border-top: 5px solid ${c.cover_color || 'var(--brand-primary)'}; padding: 1.75rem;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="font-size: 3rem;">${c.icon || '🎓'}</div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <h1 style="font-size: 1.5rem;">${escapeHTML(c.name)}</h1>
                <span class="badge" style="text-transform: capitalize;">${c.level}</span>
              </div>
              <p style="font-size: 0.9375rem; color: var(--text-secondary); max-width: 600px;">
                ${escapeHTML(c.description || 'Academic community space on UniCircle.')}
              </p>
            </div>
          </div>

          <button id="comm-join-toggle-btn" class="btn ${c.is_member ? 'btn-secondary' : 'btn-primary'} btn-interactive">
            ${c.is_member ? 'Joined Community ✓' : 'Join Community'}
          </button>
        </div>

        <div style="display: flex; align-items: center; gap: 1.5rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color); font-size: 0.875rem; color: var(--text-tertiary);">
          <span>👥 <strong style="color: var(--text-primary);">${c.members_count || 0}</strong> Members</span>
          <span>💬 <strong style="color: var(--text-primary);">${c.discussions_count || 0}</strong> Discussions</span>
        </div>

        ${c.members && c.members.length > 0 ? `
          <div style="margin-top: 1rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 0.5rem;">Recent Members</div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              ${c.members.map(m => `
                <div class="avatar avatar-sm" style="background-color: ${m.avatar_color || '#4f46e5'};" title="${m.name} (@${m.username})">
                  ${getInitials(m.name)}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const joinBtn = card.querySelector('#comm-join-toggle-btn');
    if (joinBtn) {
      joinBtn.onclick = async () => {
        try {
          if (c.is_member) {
            await api.delete(`/communities/${communityId}/join`);
            c.is_member = false;
            joinBtn.className = 'btn btn-primary btn-interactive';
            joinBtn.textContent = 'Join Community';
            toast.info('Left community.');
          } else {
            await api.post(`/communities/${communityId}/join`);
            c.is_member = true;
            joinBtn.className = 'btn btn-secondary btn-interactive';
            joinBtn.textContent = 'Joined Community ✓';
            toast.success('Joined community!');
          }
        } catch (err) {
          toast.error(err.message);
        }
      };
    }

    const newDiscBtn = document.getElementById('comm-new-disc-btn');
    if (newDiscBtn) {
      newDiscBtn.onclick = () => {
        modal.showCreateDiscussionModal({
          onCreated: () => loadCommunityDiscussions()
        });
      };
    }
  } catch (err) {
    card.innerHTML = `<p style="color: var(--accent-rose);">Failed to load community.</p>`;
  }
}

async function loadCommunityDiscussions() {
  const container = document.getElementById('community-discussions-container');
  if (!container) return;

  try {
    const res = await api.get('/discussions', { community_id: communityId });
    const discussions = res.discussions || [];

    if (discussions.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '💬',
        title: 'No discussions in this space yet',
        description: 'Be the first to post a question, announcement, or study topic here.',
        actionText: 'Start First Discussion',
        actionId: 'empty-comm-post-btn'
      });

      const emptyBtn = document.getElementById('empty-comm-post-btn');
      if (emptyBtn) {
        emptyBtn.onclick = () => modal.showCreateDiscussionModal({
          onCreated: () => loadCommunityDiscussions()
        });
      }
      return;
    }

    container.innerHTML = discussions.map(d => `
      <div class="discussion-card" data-id="${d.id}">
        <div class="discussion-meta">
          <div class="author-chip">
            <div class="avatar avatar-sm" style="background-color: ${d.author ? d.author.avatar_color : '#4f46e5'};">
              ${getInitials(d.author ? d.author.name : 'Student')}
            </div>
            <div>
              <div class="author-name">
                ${d.is_anonymous ? `<span class="badge badge-anonymous">🎭 ${escapeHTML(d.author.name)}</span>` : escapeHTML(d.author.name)}
              </div>
              <span class="post-time">${formatTimeAgo(d.created_at)}</span>
            </div>
          </div>
          <span class="badge badge-brand">${CATEGORY_ICONS[d.category] || '📌'} ${escapeHTML(d.category)}</span>
        </div>

        <a href="/pages/discussion.html?id=${d.id}" class="discussion-title">
          ${escapeHTML(d.title)}
        </a>
        <p class="discussion-snippet">${escapeHTML(d.body)}</p>

        <div class="discussion-footer">
          <span style="font-size: 0.8125rem; color: var(--text-secondary);">▲ ${d.upvotes_count || 0} upvotes • 💬 ${d.comments_count || 0} replies</span>
          <a href="/pages/discussion.html?id=${d.id}" class="btn btn-secondary btn-sm">View Thread →</a>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load discussions.</p>`;
  }
}

init();
