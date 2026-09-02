// Course Space Page Controller
import { initTheme, formatTimeAgo, CATEGORY_ICONS, escapeHTML, getInitials } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { modal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

const params = new URLSearchParams(window.location.search);
const courseId = params.get('id');

let currentCourse = null;
let activeTab = 'discussions';

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('home');

  if (!courseId) {
    window.location.href = '/pages/home.html';
    return;
  }

  await loadCourseHeader();
  setupTabs();
  loadTabContent();
}

async function loadCourseHeader() {
  const card = document.getElementById('course-header-card');
  if (!card) return;

  try {
    const res = await api.get(`/academic/courses/${courseId}`);
    currentCourse = res.course;
    const c = currentCourse;

    card.innerHTML = `
      <div class="card animate-fade-in" style="border-left: 5px solid var(--accent-green); padding: 1.75rem;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span class="badge badge-course" style="font-size: 0.875rem; font-weight: 700;">${escapeHTML(c.code)}</span>
              <span style="font-size: 0.8125rem; color: var(--text-tertiary);">${escapeHTML(c.academic_year || 'Year 1')}</span>
            </div>
            <h1 style="font-size: 1.65rem; margin-bottom: 0.5rem;">${escapeHTML(c.name)}</h1>
            <p style="font-size: 0.9375rem; color: var(--text-secondary); max-width: 650px;">
              ${escapeHTML(c.description || `${c.program_name} • ${c.faculty_name} • ${c.institution_name}`)}
            </p>
          </div>

          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button id="enroll-toggle-btn" class="btn ${c.is_enrolled ? 'btn-secondary' : 'btn-primary'} btn-interactive">
              ${c.is_enrolled ? 'Enrolled ✓' : 'Enroll in Course'}
            </button>
            <button id="course-create-post-btn" class="btn btn-primary btn-interactive">
              <span>✍️</span>
              <span>Post to Course</span>
            </button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 1.5rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color); font-size: 0.875rem; color: var(--text-tertiary);">
          <span>🎓 <strong style="color: var(--text-primary);">${c.student_count || 0}</strong> Students Enrolled</span>
          <span>💬 <strong style="color: var(--text-primary);">${c.discussion_count || 0}</strong> Discussions</span>
          <span>👥 <strong style="color: var(--text-primary);">${c.groups_count || 0}</strong> Study Groups</span>
        </div>
      </div>
    `;

    const enrollBtn = card.querySelector('#enroll-toggle-btn');
    if (enrollBtn) {
      enrollBtn.onclick = async () => {
        try {
          if (c.is_enrolled) {
            await api.delete(`/academic/courses/${courseId}/enroll`);
            c.is_enrolled = false;
            enrollBtn.className = 'btn btn-primary btn-interactive';
            enrollBtn.textContent = 'Enroll in Course';
            toast.info('Removed from enrolled courses.');
          } else {
            await api.post(`/academic/courses/${courseId}/enroll`);
            c.is_enrolled = true;
            enrollBtn.className = 'btn btn-secondary btn-interactive';
            enrollBtn.textContent = 'Enrolled ✓';
            toast.success(`Enrolled in ${c.code}!`);
          }
          await auth.fetchCurrentUser();
          renderNavigation('home');
        } catch (err) {
          toast.error(err.message);
        }
      };
    }

    const postBtn = card.querySelector('#course-create-post-btn');
    if (postBtn) {
      postBtn.onclick = () => {
        modal.showCreateDiscussionModal({
          defaultCourseId: courseId,
          onCreated: () => loadTabContent()
        });
      };
    }
  } catch (err) {
    card.innerHTML = `<p style="color: var(--accent-rose);">Failed to load course details.</p>`;
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
  const container = document.getElementById('course-tab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="card skeleton" style="height: 120px; margin-bottom: 0.75rem;"></div>
    <div class="card skeleton" style="height: 120px;"></div>
  `;

  if (activeTab === 'discussions' || activeTab === 'questions' || activeTab === 'resources') {
    let catFilter = null;
    if (activeTab === 'questions') catFilter = 'Questions';
    if (activeTab === 'resources') catFilter = 'Resources';

    try {
      const params = { course_id: courseId };
      if (catFilter) params.category = catFilter;

      const res = await api.get('/discussions', params);
      const list = res.discussions || [];

      if (list.length === 0) {
        container.innerHTML = renderEmptyState({
          icon: activeTab === 'questions' ? '❓' : (activeTab === 'resources' ? '📂' : '💬'),
          title: `No ${activeTab} yet for ${currentCourse ? currentCourse.code : 'this course'}`,
          description: 'Be the first to start a conversation or ask your classmates a question.',
          actionText: 'Post Discussion',
          actionId: 'course-empty-post-btn'
        });

        const emptyBtn = document.getElementById('course-empty-post-btn');
        if (emptyBtn) {
          emptyBtn.onclick = () => modal.showCreateDiscussionModal({
            defaultCourseId: courseId,
            defaultCategory: activeTab === 'questions' ? 'Questions' : (activeTab === 'resources' ? 'Resources' : 'Course Discussion'),
            onCreated: () => loadTabContent()
          });
        }
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
                <div class="author-name">${d.is_anonymous ? `<span class="badge badge-anonymous">🎭 Anonymous</span>` : escapeHTML(d.author.name)}</div>
                <span class="post-time">${formatTimeAgo(d.created_at)}</span>
              </div>
            </div>
            <span class="badge badge-brand">${CATEGORY_ICONS[d.category] || '📌'} ${escapeHTML(d.category)}</span>
          </div>

          <a href="/pages/discussion.html?id=${d.id}" class="discussion-title">${escapeHTML(d.title)}</a>
          <p class="discussion-snippet">${escapeHTML(d.body)}</p>

          <div class="discussion-footer">
            <span style="font-size: 0.8125rem; color: var(--text-secondary);">▲ ${d.upvotes_count || 0} • 💬 ${d.comments_count || 0}</span>
            <a href="/pages/discussion.html?id=${d.id}" class="btn btn-secondary btn-sm">View Discussion →</a>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load course discussions.</p>`;
    }
  } else if (activeTab === 'groups') {
    try {
      const res = await api.get('/groups', { course_id: courseId });
      const groups = res.groups || [];

      if (groups.length === 0) {
        container.innerHTML = renderEmptyState({
          icon: '👥',
          title: 'No study groups formed yet',
          description: `Form a study group for ${currentCourse ? currentCourse.code : 'this course'} to prepare for midterms and collaborate.`,
          actionText: 'Create Study Group',
          actionId: 'course-create-grp-btn'
        });

        const emptyBtn = document.getElementById('course-create-grp-btn');
        if (emptyBtn) {
          emptyBtn.onclick = () => modal.showCreateGroupModal({
            defaultCourseId: courseId,
            onCreated: () => loadTabContent()
          });
        }
        return;
      }

      container.innerHTML = `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 1rem;">
          <button id="tab-create-grp-btn" class="btn btn-primary btn-sm">+ Create Study Group</button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
          ${groups.map(g => `
            <div class="card interactive-card" style="display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
              <div>
                <h4 style="font-size: 1.1rem; margin-bottom: 0.25rem;">${escapeHTML(g.name)}</h4>
                <p style="font-size: 0.8125rem; color: var(--text-secondary);">${escapeHTML(g.description || 'Study group.')}</p>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                <span style="font-size: 0.75rem; color: var(--text-tertiary);">👥 ${g.members_count || 0}/${g.max_members} members</span>
                <a href="/pages/group.html?id=${g.id}" class="btn btn-secondary btn-sm">Open Group →</a>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      const createGrpBtn = container.querySelector('#tab-create-grp-btn');
      if (createGrpBtn) {
        createGrpBtn.onclick = () => modal.showCreateGroupModal({
          defaultCourseId: courseId,
          onCreated: () => loadTabContent()
        });
      }
    } catch (err) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load study groups.</p>`;
    }
  } else if (activeTab === 'members') {
    try {
      const res = await api.get(`/academic/courses/${courseId}/members`);
      const members = res.members || [];

      if (members.length === 0) {
        container.innerHTML = renderEmptyState({
          icon: '🎓',
          title: 'No classmates enrolled yet',
          description: 'Enroll in this course to appear in the directory and connect with other students.'
        });
        return;
      }

      container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem;">
          ${members.map(m => `
            <div class="card interactive-card" style="display: flex; align-items: center; gap: 0.75rem; padding: 1rem;">
              <div class="avatar avatar-md" style="background-color: ${m.avatar_color || '#4f46e5'};">
                ${getInitials(m.name)}
              </div>
              <div style="overflow: hidden;">
                <a href="/pages/profile.html?u=${encodeURIComponent(m.username)}" style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${escapeHTML(m.name)}
                </a>
                <div style="font-size: 0.75rem; color: var(--text-tertiary);">@${m.username}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load members.</p>`;
    }
  }
}

init();
