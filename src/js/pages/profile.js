// Student Profile Page Controller
import { initTheme, formatTimeAgo, CATEGORY_ICONS, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

const params = new URLSearchParams(window.location.search);
const targetUsername = params.get('u');

let profileUser = null;
let activeTab = 'discussions';

async function init() {
  const currentUser = await auth.requireAuth();
  if (!currentUser) return;

  renderNavigation('profile');

  const usernameToFetch = targetUsername || currentUser.username;
  await loadProfile(usernameToFetch);
  setupTabs();
  loadTabContent();
}

async function loadProfile(username) {
  const container = document.getElementById('profile-card-container');
  if (!container) return;

  try {
    const res = await api.get(`/users/profile/${encodeURIComponent(username)}`);
    profileUser = res.user;
    const u = profileUser;
    const isSelf = auth.getUser().id === u.id;

    container.innerHTML = `
      <div class="card animate-fade-in" style="padding: 2rem;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1.25rem;">
          <div style="display: flex; gap: 1.25rem; align-items: center;">
            <div class="avatar avatar-xl" style="background-color: ${u.avatar_color || '#4f46e5'};">
              ${getInitials(u.name)}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <h1 style="font-size: 1.5rem;">${escapeHTML(u.name)}</h1>
                ${u.role === 'admin' ? '<span class="badge badge-brand">Admin</span>' : (u.role === 'moderator' ? '<span class="badge badge-warning">Mod</span>' : '')}
              </div>
              <div style="font-size: 0.875rem; color: var(--text-tertiary); margin-bottom: 0.5rem;">@${escapeHTML(u.username)} • Joined ${formatTimeAgo(u.created_at)}</div>
              <p style="font-size: 0.9375rem; color: var(--text-secondary); max-width: 500px;">${escapeHTML(u.bio || 'No bio provided yet.')}</p>
            </div>
          </div>

          ${isSelf ? `
            <a href="/pages/settings.html" class="btn btn-secondary btn-sm">⚙️ Edit Profile</a>
          ` : ''}
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color); font-size: 0.875rem;">
          <div class="badge" style="padding: 0.35rem 0.75rem;">🏛️ ${escapeHTML(u.institution_name || 'No institution')}</div>
          <div class="badge" style="padding: 0.35rem 0.75rem;">🔬 ${escapeHTML(u.faculty_name || 'No faculty')}</div>
          <div class="badge" style="padding: 0.35rem 0.75rem;">📚 ${escapeHTML(u.program_name || 'No program')}</div>
          <div class="badge" style="padding: 0.35rem 0.75rem;">📅 ${escapeHTML(u.academic_year || 'Year 1')}</div>
        </div>

        <!-- Real Statistics Strip -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 1rem; margin-top: 1.5rem; text-align: center; background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-lg);">
          <div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--brand-primary);">${u.stats.discussions_count || 0}</div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary);">Discussions</div>
          </div>
          <div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--accent-blue);">${u.stats.comments_count || 0}</div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary);">Replies</div>
          </div>
          <div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--accent-green);">${u.stats.groups_count || 0}</div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary);">Groups</div>
          </div>
          <div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--accent-amber);">${u.stats.upvotes_received || 0}</div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary);">Upvotes Earned</div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem;">
        <h3 style="color: var(--accent-rose);">Profile Not Found</h3>
        <p style="margin-top: 0.5rem;">The student @${escapeHTML(username)} does not exist.</p>
      </div>
    `;
  }
}

function setupTabs() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      loadTabContent();
    };
  });
}

async function loadTabContent() {
  const container = document.getElementById('profile-tab-content');
  if (!container || !profileUser) return;

  if (activeTab === 'discussions') {
    try {
      const res = await api.get(`/users/${profileUser.id}/discussions`);
      const list = res.discussions || [];

      if (list.length === 0) {
        container.innerHTML = renderEmptyState({
          icon: '💬',
          title: 'No discussions posted yet',
          description: `${profileUser.name} hasn't created any discussions yet.`
        });
        return;
      }

      container.innerHTML = list.map(d => `
        <div class="discussion-card" data-id="${d.id}">
          <div class="discussion-meta">
            <span class="badge badge-brand">${CATEGORY_ICONS[d.category] || '📌'} ${escapeHTML(d.category)}</span>
            ${d.course_code ? `<span class="badge badge-course">${escapeHTML(d.course_code)}</span>` : ''}
            <span class="post-time">${formatTimeAgo(d.created_at)}</span>
          </div>
          <a href="/pages/discussion.html?id=${d.id}" class="discussion-title">${escapeHTML(d.title)}</a>
          <p class="discussion-snippet">${escapeHTML(d.body)}</p>
          <div class="discussion-footer">
            <span style="font-size: 0.75rem; color: var(--text-secondary);">▲ ${d.upvotes_count || 0} • 💬 ${d.comments_count || 0} replies</span>
            <a href="/pages/discussion.html?id=${d.id}" class="btn btn-secondary btn-sm">View Discussion →</a>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load discussions.</p>`;
    }
  } else if (activeTab === 'courses') {
    const courses = profileUser.courses || [];
    if (courses.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '📖',
        title: 'No courses enrolled yet',
        description: `${profileUser.name} hasn't added any courses yet.`
      });
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem;">
        ${courses.map(c => `
          <div class="card interactive-card" style="padding: 1.25rem;">
            <span class="badge badge-course">${escapeHTML(c.code)}</span>
            <a href="/pages/course.html?id=${c.id}" style="font-weight: 700; font-size: 1rem; color: var(--text-primary); display: block; margin: 0.5rem 0 0.25rem 0;">
              ${escapeHTML(c.name)}
            </a>
            <span style="font-size: 0.75rem; color: var(--text-tertiary);">${escapeHTML(c.academic_year || 'Year 1')}</span>
          </div>
        `).join('')}
      </div>
    `;
  } else if (activeTab === 'activity') {
    try {
      const res = await api.get(`/users/${profileUser.id}/activity`);
      const activities = res.activity || [];

      if (activities.length === 0) {
        container.innerHTML = renderEmptyState({
          icon: '⚡',
          title: 'No recent activity',
          description: 'No activity recorded yet for this student.'
        });
        return;
      }

      container.innerHTML = `
        <div class="card" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;">
          ${activities.map(a => `
            <div style="display: flex; align-items: flex-start; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
              <div>
                <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-primary);">${escapeHTML(a.title)}</div>
                ${a.description ? `<div style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHTML(a.description)}</div>` : ''}
              </div>
              <span class="post-time">${formatTimeAgo(a.created_at)}</span>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load activity.</p>`;
    }
  }
}

init();
