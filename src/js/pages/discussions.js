// Discussions Hub Page Controller
import { initTheme, formatTimeAgo, CATEGORY_ICONS, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { modal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

let currentCategory = 'All';
let currentSort = 'recent';
let currentSearch = '';

const CATEGORIES = [
  'All', 'Questions', 'Course Discussion', 'Assignments', 'Exams',
  'Study Help', 'Resources', 'Study Groups', 'Campus Life',
  'Announcements', 'Projects', 'Career', 'General'
];

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('discussions');

  // Check URL query parameters (e.g. ?category=Exams or ?course_id=crs_123)
  const params = new URLSearchParams(window.location.search);
  if (params.get('category')) currentCategory = params.get('category');
  if (params.get('q')) currentSearch = params.get('q');

  renderCategoryPills();
  setupEventListeners();
  loadDiscussions();
}

function renderCategoryPills() {
  const bar = document.getElementById('disc-category-pills');
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
      loadDiscussions();
    };
  });
}

function setupEventListeners() {
  const newBtn = document.getElementById('open-new-disc-modal-btn');
  if (newBtn) {
    newBtn.onclick = () => modal.showCreateDiscussionModal({
      defaultCategory: currentCategory !== 'All' ? currentCategory : 'General',
      onCreated: () => loadDiscussions()
    });
  }

  const searchInput = document.getElementById('disc-filter-search');
  if (searchInput) {
    if (currentSearch) searchInput.value = currentSearch;
    let debounce;
    searchInput.oninput = (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        currentSearch = e.target.value.trim();
        loadDiscussions();
      }, 300);
    };
  }

  const sortSelect = document.getElementById('disc-sort-select');
  if (sortSelect) {
    sortSelect.onchange = (e) => {
      currentSort = e.target.value;
      loadDiscussions();
    };
  }
}

async function loadDiscussions() {
  const container = document.getElementById('discussions-list-container');
  if (!container) return;

  container.innerHTML = `
    <div class="card skeleton" style="height: 140px; margin-bottom: 0.75rem;"></div>
    <div class="card skeleton" style="height: 140px; margin-bottom: 0.75rem;"></div>
    <div class="card skeleton" style="height: 140px;"></div>
  `;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const params = {
      sort: currentSort
    };

    if (currentCategory !== 'All') params.category = currentCategory;
    if (currentSearch) params.tag = currentSearch;
    if (urlParams.get('course_id')) params.course_id = urlParams.get('course_id');
    if (urlParams.get('community_id')) params.community_id = urlParams.get('community_id');

    const res = await api.get('/discussions', params);
    const discussions = res.discussions || [];

    if (discussions.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '💬',
        title: 'No discussions found in this section',
        description: 'Be the first student to start a discussion or ask a question here.',
        actionText: 'Create Discussion',
        actionId: 'disc-empty-create-btn'
      });

      const emptyBtn = document.getElementById('disc-empty-create-btn');
      if (emptyBtn) {
        emptyBtn.onclick = () => modal.showCreateDiscussionModal({
          defaultCategory: currentCategory !== 'All' ? currentCategory : 'General',
          onCreated: () => loadDiscussions()
        });
      }
      return;
    }

    container.innerHTML = discussions.map(d => renderCard(d)).join('');
    attachEvents(container);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2rem; color: var(--accent-rose);">
        Failed to load discussions.
      </div>
    `;
  }
}

function renderCard(d) {
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
            <span>${d.comments_count || 0} replies</span>
          </a>
          <span class="post-time" style="margin-left: 0.5rem;">👁️ ${d.view_count || 0}</span>
        </div>

        <div class="interaction-group">
          <button class="action-btn save-btn ${d.is_saved ? 'active-saved' : ''}" data-id="${d.id}">
            <span>${d.is_saved ? '🔖' : '🏷️'}</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachEvents(container) {
  container.querySelectorAll('.upvote-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const discId = btn.dataset.id;
      try {
        const res = await api.post(`/discussions/${discId}/upvote`);
        btn.querySelector('.upvote-count').textContent = res.upvotes_count;
        if (res.is_upvoted) btn.classList.add('active-upvote', 'upvote-active');
        else btn.classList.remove('active-upvote', 'upvote-active');
      } catch (err) {
        toast.error(err.message);
      }
    };
  });

  container.querySelectorAll('.save-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const discId = btn.dataset.id;
      try {
        const res = await api.post(`/discussions/${discId}/save`);
        if (res.is_saved) {
          btn.classList.add('active-saved');
          btn.querySelector('span').textContent = '🔖';
          toast.success('Saved to bookmarks.');
        } else {
          btn.classList.remove('active-saved');
          btn.querySelector('span').textContent = '🏷️';
          toast.info('Removed from bookmarks.');
        }
      } catch (err) {
        toast.error(err.message);
      }
    };
  });
}

init();
