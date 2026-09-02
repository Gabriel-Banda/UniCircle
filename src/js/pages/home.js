// Home Feed Dashboard Controller
import { initTheme, formatTimeAgo, CATEGORY_ICONS, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { modal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

let currentCategory = 'All';
let currentScope = 'all';
let currentSort = 'recent';

const CATEGORIES = [
  'All', 'Questions', 'Course Discussion', 'Assignments', 'Exams',
  'Study Help', 'Resources', 'Study Groups', 'Campus Life',
  'Announcements', 'Projects', 'Career', 'General'
];

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('home');
  setupHeaderGreeting(user);
  renderEnrolledCourses(user);
  renderCategoryPills();
  setupEventListeners();
  loadFeed();
}

function setupHeaderGreeting(user) {
  const hour = new Date().getHours();
  let timeGreeting = 'Good morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
  else if (hour >= 17) timeGreeting = 'Good evening';

  const greetingEl = document.getElementById('user-greeting');
  if (greetingEl) {
    greetingEl.innerHTML = `${timeGreeting}, ${escapeHTML(user.name)} 👋`;
  }

  const subtitleEl = document.getElementById('user-community-subtitle');
  if (subtitleEl) {
    if (user.institution_name) {
      subtitleEl.textContent = `Here's what's happening at ${user.institution_name}${user.program_name ? ` • ${user.program_name}` : ''}.`;
    } else {
      subtitleEl.textContent = "Here's what's happening in your academic community.";
    }
  }
}

function renderEnrolledCourses(user) {
  const section = document.getElementById('enrolled-courses-section');
  const strip = document.getElementById('enrolled-courses-strip');
  if (!section || !strip) return;

  if (user.courses && user.courses.length > 0) {
    section.style.display = 'block';
    strip.innerHTML = user.courses.map(c => `
      <a href="/pages/course.html?id=${c.id}" class="card interactive-card" style="padding: 0.75rem 1rem; min-width: 150px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.25rem;">
        <span class="badge badge-course" style="align-self: flex-start;">${escapeHTML(c.code)}</span>
        <span style="font-weight: 700; font-size: 0.875rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(c.name)}</span>
        <span style="font-size: 0.75rem; color: var(--text-tertiary);">${c.academic_year || 'Current'}</span>
      </a>
    `).join('');
  } else {
    section.style.display = 'none';
  }
}

function renderCategoryPills() {
  const bar = document.getElementById('category-pills-bar');
  if (!bar) return;

  bar.innerHTML = CATEGORIES.map(cat => `
    <button class="category-pill ${cat === currentCategory ? 'active' : ''}" data-cat="${cat}">
      <span>${CATEGORY_ICONS[cat] || '🏷️'}</span>
      <span>${cat}</span>
    </button>
  `).join('');

  bar.querySelectorAll('.category-pill').forEach(btn => {
    btn.onclick = () => {
      bar.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      loadFeed();
    };
  });
}

function setupEventListeners() {
  const createBtn = document.getElementById('home-create-post-btn');
  if (createBtn) {
    createBtn.onclick = () => modal.showCreateDiscussionModal({
      defaultCategory: currentCategory !== 'All' ? currentCategory : 'General',
      onCreated: () => loadFeed()
    });
  }

  // Feed scope tabs
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentScope = tab.dataset.filter;
      loadFeed();
    };
  });

  // Sort dropdown
  const sortSelect = document.getElementById('feed-sort-select');
  if (sortSelect) {
    sortSelect.onchange = (e) => {
      currentSort = e.target.value;
      loadFeed();
    };
  }
}

async function loadFeed() {
  const container = document.getElementById('discussions-feed');
  if (!container) return;

  // Show Skeleton Loaders
  container.innerHTML = `
    <div class="card skeleton" style="height: 140px; margin-bottom: 0.75rem;"></div>
    <div class="card skeleton" style="height: 140px; margin-bottom: 0.75rem;"></div>
    <div class="card skeleton" style="height: 140px;"></div>
  `;

  try {
    const params = {
      sort: currentSort
    };

    if (currentCategory !== 'All') {
      params.category = currentCategory;
    }

    if (currentScope === 'questions') {
      params.category = 'Questions';
    }

    const res = await api.get('/discussions', params);
    const discussions = res.discussions || [];

    if (discussions.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '💬',
        title: 'Your community is quiet... for now.',
        description: 'Start the first discussion and bring your classmates into the conversation.',
        actionText: 'Start a Discussion',
        actionId: 'empty-start-disc-btn'
      });

      const emptyBtn = document.getElementById('empty-start-disc-btn');
      if (emptyBtn) {
        emptyBtn.onclick = () => modal.showCreateDiscussionModal({
          onCreated: () => loadFeed()
        });
      }
      return;
    }

    container.innerHTML = discussions.map(d => renderDiscussionCard(d)).join('');
    attachDiscussionCardEvents(container);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2rem; border-color: rgba(239, 68, 68, 0.3);">
        <p style="color: var(--accent-rose);">Failed to load discussions. Please check your connection.</p>
        <button id="retry-feed-btn" class="btn btn-secondary btn-sm" style="margin-top: 1rem;">Retry</button>
      </div>
    `;
    const retryBtn = document.getElementById('retry-feed-btn');
    if (retryBtn) retryBtn.onclick = () => loadFeed();
  }
}

function renderDiscussionCard(d) {
  const icon = CATEGORY_ICONS[d.category] || '📌';
  const authorInitials = getInitials(d.author ? d.author.name : 'Student');
  const authorAvatarColor = d.author ? d.author.avatar_color : '#4F46E5';

  return `
    <div class="discussion-card" data-id="${d.id}">
      <div class="discussion-meta">
        <div class="author-chip">
          <div class="avatar avatar-sm" style="background-color: ${authorAvatarColor};">
            ${authorInitials}
          </div>
          <div>
            <div class="author-name">
              ${d.is_anonymous ? `<span class="badge badge-anonymous">🎭 ${escapeHTML(d.author.name)}</span>` : escapeHTML(d.author.name)}
            </div>
            <span class="post-time">${formatTimeAgo(d.created_at)}</span>
          </div>
        </div>

        <div style="display: flex; gap: 0.375rem; flex-wrap: wrap;">
          <span class="badge badge-brand">${icon} ${escapeHTML(d.category)}</span>
          ${d.course_code ? `<span class="badge badge-course">📖 ${escapeHTML(d.course_code)}</span>` : ''}
        </div>
      </div>

      <div>
        <a href="/pages/discussion.html?id=${d.id}" class="discussion-title">
          ${escapeHTML(d.title)}
        </a>
        <p class="discussion-snippet" style="margin-top: 0.375rem;">
          ${escapeHTML(d.body)}
        </p>
      </div>

      ${d.tags && d.tags.length > 0 ? `
        <div style="display: flex; gap: 0.375rem; flex-wrap: wrap;">
          ${d.tags.map(t => `<span class="badge" style="font-size: 0.6875rem;">#${escapeHTML(t)}</span>`).join('')}
        </div>
      ` : ''}

      <div class="discussion-footer">
        <div class="interaction-group">
          <button class="action-btn upvote-btn ${d.is_upvoted ? 'active-upvote' : ''}" data-id="${d.id}">
            <span>▲</span>
            <span class="upvote-count">${d.upvotes_count || 0}</span>
          </button>

          <a href="/pages/discussion.html?id=${d.id}" class="action-btn">
            <span>💬</span>
            <span>${d.comments_count || 0} comments</span>
          </a>

          <span class="post-time" style="margin-left: 0.5rem;">👁️ ${d.view_count || 0}</span>
        </div>

        <div class="interaction-group">
          <button class="action-btn save-btn ${d.is_saved ? 'active-saved' : ''}" data-id="${d.id}" title="Save / Bookmark">
            <span>${d.is_saved ? '🔖' : '🏷️'}</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachDiscussionCardEvents(container) {
  // Upvote click handlers
  container.querySelectorAll('.upvote-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const discId = btn.dataset.id;
      try {
        const res = await api.post(`/discussions/${discId}/upvote`);
        btn.querySelector('.upvote-count').textContent = res.upvotes_count;
        if (res.is_upvoted) {
          btn.classList.add('active-upvote', 'upvote-active');
        } else {
          btn.classList.remove('active-upvote', 'upvote-active');
        }
      } catch (err) {
        toast.error(err.message || 'Failed to upvote.');
      }
    };
  });

  // Bookmark / Save click handlers
  container.querySelectorAll('.save-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const discId = btn.dataset.id;
      try {
        const res = await api.post(`/discussions/${discId}/save`);
        if (res.is_saved) {
          btn.classList.add('active-saved');
          btn.querySelector('span').textContent = '🔖';
          toast.success('Discussion saved to your bookmarks!');
        } else {
          btn.classList.remove('active-saved');
          btn.querySelector('span').textContent = '🏷️';
          toast.info('Removed from bookmarks.');
        }
      } catch (err) {
        toast.error(err.message || 'Failed to save.');
      }
    };
  });
}

init();
