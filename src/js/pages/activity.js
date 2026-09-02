// User Activity Timeline Controller
import { initTheme, formatTimeAgo, escapeHTML } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('activity');
  loadActivity(user.id);
}

async function loadActivity(userId) {
  const container = document.getElementById('activity-timeline-container');
  if (!container) return;

  container.innerHTML = `
    <div class="card skeleton" style="height: 80px; margin-bottom: 0.5rem;"></div>
    <div class="card skeleton" style="height: 80px;"></div>
  `;

  try {
    const res = await api.get(`/users/${userId}/activity`);
    const activities = res.activity || [];

    if (activities.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '⚡',
        title: 'No activity recorded yet',
        description: 'Your actions (discussions created, comments made, upvotes, study groups) will appear chronologically here.',
        actionText: 'Start a Discussion',
        actionHref: '/pages/discussions.html'
      });
      return;
    }

    container.innerHTML = `
      <div class="card" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
        ${activities.map(a => {
          let icon = '⚡';
          if (a.action_type === 'create_discussion') icon = '✍️';
          else if (a.action_type === 'comment') icon = '💬';
          else if (a.action_type === 'upvote') icon = '▲';
          else if (a.action_type === 'join_group' || a.action_type === 'create_group') icon = '👥';
          else if (a.action_type === 'save_discussion') icon = '🔖';
          else if (a.action_type === 'joined_course') icon = '📖';

          return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="font-size: 1.35rem; width: 2rem; text-align: center;">${icon}</div>
                <div>
                  <div style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary);">
                    ${a.link ? `<a href="${a.link}" style="color: var(--text-primary); text-decoration: underline;">${escapeHTML(a.title)}</a>` : escapeHTML(a.title)}
                  </div>
                  ${a.description ? `<div style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.15rem;">${escapeHTML(a.description)}</div>` : ''}
                </div>
              </div>
              <span class="post-time">${formatTimeAgo(a.created_at)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load activity.</p>`;
  }
}

init();
