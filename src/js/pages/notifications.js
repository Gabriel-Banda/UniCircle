// Notifications Center Controller
import { initTheme, formatTimeAgo, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

let unreadOnly = false;

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('notifications');
  setupEventListeners();
  loadNotifications();
}

function setupEventListeners() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      unreadOnly = tab.dataset.filter === 'unread';
      loadNotifications();
    };
  });

  const markAllBtn = document.getElementById('mark-all-read-btn');
  if (markAllBtn) {
    markAllBtn.onclick = async () => {
      try {
        await api.put('/notifications/mark-all-read');
        toast.success('All notifications marked as read.');
        loadNotifications();
      } catch (err) {
        toast.error('Failed to mark all as read.');
      }
    };
  }
}

async function loadNotifications() {
  const container = document.getElementById('notifications-list');
  if (!container) return;

  container.innerHTML = `
    <div class="card skeleton" style="height: 70px; margin-bottom: 0.5rem;"></div>
    <div class="card skeleton" style="height: 70px; margin-bottom: 0.5rem;"></div>
  `;

  try {
    const res = await api.get('/notifications', { unread_only: unreadOnly });
    const notifications = res.notifications || [];

    if (notifications.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '🔔',
        title: "You're all caught up!",
        description: 'No new notifications right now. Activity in your discussions and study groups will appear here.'
      });
      return;
    }

    container.innerHTML = notifications.map(n => {
      let icon = '🔔';
      if (n.type === 'discussion_reply' || n.type === 'comment_reply') icon = '💬';
      else if (n.type === 'upvote') icon = '▲';
      else if (n.type === 'group_join') icon = '👥';

      return `
        <div class="card interactive-card notif-item" data-id="${n.id}" data-link="${n.link || ''}" style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; ${!n.is_read ? 'border-left: 4px solid var(--brand-primary); background: var(--bg-surface-elevated);' : ''} cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="font-size: 1.5rem;">${icon}</div>
            <div>
              <div style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary); margin-bottom: 0.15rem;">
                ${escapeHTML(n.title)}
              </div>
              <div style="font-size: 0.8125rem; color: var(--text-secondary);">
                ${escapeHTML(n.message)}
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="post-time">${formatTimeAgo(n.created_at)}</span>
            ${!n.is_read ? '<span style="width: 8px; height: 8px; border-radius: var(--radius-full); background: var(--brand-primary);"></span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.notif-item').forEach(item => {
      item.onclick = async () => {
        const id = item.dataset.id;
        const link = item.dataset.link;
        try {
          await api.put(`/notifications/${id}/read`);
        } catch (e) {}

        if (link) {
          window.location.href = link;
        } else {
          loadNotifications();
        }
      };
    });
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load notifications.</p>`;
  }
}

init();
