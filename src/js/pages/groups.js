// Study Groups Page Controller
import { initTheme, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { modal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

let currentFilter = 'all';

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('groups');
  setupEventListeners();
  loadGroups();
}

function setupEventListeners() {
  const createBtn = document.getElementById('open-new-group-modal-btn');
  if (createBtn) {
    createBtn.onclick = () => modal.showCreateGroupModal({
      onCreated: () => loadGroups()
    });
  }

  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      loadGroups();
    };
  });
}

async function loadGroups() {
  const grid = document.getElementById('study-groups-grid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="card skeleton" style="height: 180px;"></div>
    <div class="card skeleton" style="height: 180px;"></div>
  `;

  try {
    const params = {};
    if (currentFilter === 'my') params.my_groups = 'true';

    const res = await api.get('/groups', params);
    const groups = res.groups || [];

    if (groups.length === 0) {
      grid.style.display = 'block';
      grid.innerHTML = renderEmptyState({
        icon: '👥',
        title: currentFilter === 'my' ? 'You haven\'t joined any study groups yet' : 'No study groups created yet',
        description: 'Create a study group with students from your courses to review notes and prepare for exams.',
        actionText: 'Create Study Group',
        actionId: 'empty-group-btn'
      });

      const emptyBtn = document.getElementById('empty-group-btn');
      if (emptyBtn) {
        emptyBtn.onclick = () => modal.showCreateGroupModal({
          onCreated: () => loadGroups()
        });
      }
      return;
    }

    grid.style.display = 'grid';
    grid.innerHTML = groups.map(g => `
      <div class="card interactive-card" style="display: flex; flex-direction: column; justify-content: space-between; gap: 1rem; border-top: 4px solid var(--brand-primary);">
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
            ${g.course_code ? `<span class="badge badge-course">${escapeHTML(g.course_code)}</span>` : `<span class="badge">General</span>`}
            <span style="font-size: 0.75rem; color: var(--text-tertiary);">👥 ${g.members_count || 0}/${g.max_members}</span>
          </div>

          <h3 style="font-size: 1.15rem; margin-bottom: 0.35rem; line-height: 1.3;">
            <a href="/pages/group.html?id=${g.id}" style="color: var(--text-primary);">
              ${escapeHTML(g.name)}
            </a>
          </h3>

          <p style="font-size: 0.875rem; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHTML(g.description || 'Study collaboration group.')}
          </p>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; display: flex; align-items: center; justify-content: space-between; margin-top: auto;">
          <div style="display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: var(--text-tertiary);">
            <div class="avatar avatar-sm" style="width: 1.25rem; height: 1.25rem; font-size: 0.6rem; background-color: ${g.creator_avatar_color || '#4f46e5'};">
              ${getInitials(g.creator_name)}
            </div>
            <span>${escapeHTML(g.creator_name)}</span>
          </div>

          <a href="/pages/group.html?id=${g.id}" class="btn ${g.is_member ? 'btn-secondary' : 'btn-primary'} btn-sm">
            ${g.is_member ? 'Open Group →' : 'View Group'}
          </a>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<p style="color: var(--accent-rose);">Failed to load study groups.</p>`;
  }
}

init();
