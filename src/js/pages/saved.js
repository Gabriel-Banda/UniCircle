// Saved Bookmarks Controller
import { initTheme, formatTimeAgo, CATEGORY_ICONS, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('saved');
  loadSaved();
}

async function loadSaved() {
  const container = document.getElementById('saved-discussions-container');
  if (!container) return;

  container.innerHTML = `
    <div class="card skeleton" style="height: 140px; margin-bottom: 0.75rem;"></div>
    <div class="card skeleton" style="height: 140px;"></div>
  `;

  try {
    const res = await api.get('/discussions', { saved_only: 'true' });
    const list = res.discussions || [];

    if (list.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '🔖',
        title: 'Nothing saved yet',
        description: 'Save discussions you want to come back to later by clicking the bookmark icon on any post.',
        actionText: 'Browse Discussions',
        actionHref: '/pages/discussions.html'
      });
      return;
    }

    container.innerHTML = list.map(d => `
      <div class="discussion-card" data-id="${d.id}">
        <div class="discussion-meta">
          <div class="author-chip">
            <div class="avatar avatar-sm" style="background-color: ${d.author ? d.author.avatar_color : '#4f46e5'};">
              ${getInitials(d.author ? d.author.name : 'Student')}
            </div>
            <div>
              <div class="author-name">${d.is_anonymous ? '<span class="badge badge-anonymous">🎭 Anonymous</span>' : escapeHTML(d.author.name)}</div>
              <span class="post-time">${formatTimeAgo(d.created_at)}</span>
            </div>
          </div>
          <span class="badge badge-brand">${CATEGORY_ICONS[d.category] || '📌'} ${escapeHTML(d.category)}</span>
        </div>

        <a href="/pages/discussion.html?id=${d.id}" class="discussion-title">${escapeHTML(d.title)}</a>
        <p class="discussion-snippet">${escapeHTML(d.body)}</p>

        <div class="discussion-footer">
          <span style="font-size: 0.8125rem; color: var(--text-secondary);">▲ ${d.upvotes_count || 0} • 💬 ${d.comments_count || 0} replies</span>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-danger btn-sm unsave-btn" data-id="${d.id}">Remove Bookmark</button>
            <a href="/pages/discussion.html?id=${d.id}" class="btn btn-secondary btn-sm">View Thread →</a>
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.unsave-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        try {
          await api.post(`/discussions/${id}/save`);
          toast.info('Bookmark removed.');
          loadSaved();
        } catch (err) {
          toast.error(err.message);
        }
      };
    });
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load saved discussions.</p>`;
  }
}

init();
