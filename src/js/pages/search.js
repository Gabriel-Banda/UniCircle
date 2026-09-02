// Global Search Page Controller
import { initTheme, formatTimeAgo, CATEGORY_ICONS, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

const params = new URLSearchParams(window.location.search);
let currentQuery = params.get('q') || '';
let currentType = 'all';

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('search');

  const input = document.getElementById('search-main-input');
  if (input && currentQuery) {
    input.value = currentQuery;
  }

  setupEventListeners();
  if (currentQuery) {
    executeSearch();
  } else {
    showInitialEmptyState();
  }
}

function setupEventListeners() {
  const input = document.getElementById('search-main-input');
  if (input) {
    let debounce;
    input.oninput = (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        currentQuery = e.target.value.trim();
        if (currentQuery) executeSearch();
        else showInitialEmptyState();
      }, 300);
    };
  }

  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentType = tab.dataset.type;
      if (currentQuery) executeSearch();
    };
  });
}

function showInitialEmptyState() {
  const container = document.getElementById('search-results-container');
  if (!container) return;
  container.innerHTML = renderEmptyState({
    icon: '🔍',
    title: 'Search UniCircle',
    description: 'Type a topic, course code, question, or classmate name above to explore.'
  });
}

async function executeSearch() {
  const container = document.getElementById('search-results-container');
  if (!container) return;

  container.innerHTML = `
    <div class="card skeleton" style="height: 100px; margin-bottom: 0.5rem;"></div>
    <div class="card skeleton" style="height: 100px;"></div>
  `;

  try {
    const res = await api.get('/search', { q: currentQuery, type: currentType });

    if (res.total_count === 0) {
      container.innerHTML = renderEmptyState({
        icon: '🧐',
        title: 'No results found',
        description: `We couldn't find anything matching "${escapeHTML(currentQuery)}". Try searching for general terms or course codes.`
      });
      return;
    }

    let html = '';

    // 1. Discussions
    if (res.discussions && res.discussions.length > 0) {
      html += `
        <div style="margin-top: 0.5rem;">
          <h3 style="font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--brand-primary);">Discussions (${res.discussions.length})</h3>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${res.discussions.map(d => `
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
                  <a href="/pages/discussion.html?id=${d.id}" class="btn btn-secondary btn-sm">Open Discussion →</a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 2. Courses
    if (res.courses && res.courses.length > 0) {
      html += `
        <div style="margin-top: 1.5rem;">
          <h3 style="font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--accent-green);">Courses (${res.courses.length})</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem;">
            ${res.courses.map(c => `
              <div class="card interactive-card" style="padding: 1rem;">
                <span class="badge badge-course">${escapeHTML(c.code)}</span>
                <a href="/pages/course.html?id=${c.id}" style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary); display: block; margin: 0.5rem 0 0.25rem 0;">
                  ${escapeHTML(c.name)}
                </a>
                <span style="font-size: 0.75rem; color: var(--text-tertiary);">🎓 ${c.student_count || 0} students</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 3. Communities
    if (res.communities && res.communities.length > 0) {
      html += `
        <div style="margin-top: 1.5rem;">
          <h3 style="font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--accent-blue);">Communities (${res.communities.length})</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem;">
            ${res.communities.map(c => `
              <div class="card interactive-card" style="padding: 1rem;">
                <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">${c.icon || '🏛️'}</div>
                <a href="/pages/community.html?id=${c.id}" style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary); display: block;">
                  ${escapeHTML(c.name)}
                </a>
                <span style="font-size: 0.75rem; color: var(--text-tertiary);">👥 ${c.members_count || 0} members</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 4. Study Groups
    if (res.groups && res.groups.length > 0) {
      html += `
        <div style="margin-top: 1.5rem;">
          <h3 style="font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--accent-amber);">Study Groups (${res.groups.length})</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem;">
            ${res.groups.map(g => `
              <div class="card interactive-card" style="padding: 1rem;">
                <a href="/pages/group.html?id=${g.id}" style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary); display: block;">
                  ${escapeHTML(g.name)}
                </a>
                <span style="font-size: 0.75rem; color: var(--text-tertiary);">👥 ${g.members_count || 0} members</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 5. Classmates
    if (res.users && res.users.length > 0) {
      html += `
        <div style="margin-top: 1.5rem;">
          <h3 style="font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--accent-purple);">Students (${res.users.length})</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem;">
            ${res.users.map(u => `
              <div class="card interactive-card" style="padding: 0.875rem; display: flex; align-items: center; gap: 0.75rem;">
                <div class="avatar avatar-md" style="background-color: ${u.avatar_color || '#4f46e5'};">
                  ${getInitials(u.name)}
                </div>
                <div>
                  <a href="/pages/profile.html?u=${encodeURIComponent(u.username)}" style="font-weight: 700; font-size: 0.875rem; color: var(--text-primary); display: block;">
                    ${escapeHTML(u.name)}
                  </a>
                  <div style="font-size: 0.75rem; color: var(--text-tertiary);">@${u.username}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Failed to perform search.</p>`;
  }
}

init();
