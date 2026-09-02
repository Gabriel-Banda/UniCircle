// UniCircle Global Navigation & Identity Components
import { auth } from '../auth.js';
import { api } from '../api.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { THEMES, setTheme, getInitials } from '../config.js';

export function renderNavigation(activePage = '') {
  const user = auth.getUser();
  const currentPath = window.location.pathname;

  // 1. TOP HEADER
  const topHeader = document.querySelector('.top-header');
  if (topHeader) {
    topHeader.innerHTML = `
      <a href="/pages/home.html" class="header-brand">
        <div class="brand-icon-wrap">🎓</div>
        <span>Uni<span class="text-gradient">Circle</span></span>
      </a>

      <div class="header-search">
        <span class="search-icon">🔍</span>
        <input type="text" id="global-search-input" placeholder="Search discussions, courses, communities..." />
      </div>

      <div class="header-actions">
        <!-- Theme Selector Dropdown -->
        <div style="position: relative;" id="theme-selector-wrap">
          <button id="theme-toggle-btn" class="btn btn-secondary btn-icon" title="Change Theme">
            🎨
          </button>
          <div id="theme-dropdown" class="card" style="display: none; position: absolute; right: 0; top: 3.25rem; width: 180px; padding: 0.5rem; z-index: 200; box-shadow: var(--shadow-xl);">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-tertiary); padding: 0.25rem 0.5rem; text-transform: uppercase;">Select Theme</div>
            ${THEMES.map(t => `
              <button class="theme-option-btn btn-ghost" data-theme-id="${t.id}" style="width: 100%; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-radius: var(--radius-sm); font-size: 0.8125rem; text-align: left;">
                <span>${t.icon}</span>
                <span>${t.name}</span>
              </button>
            `).join('')}
          </div>
        </div>

        ${user ? `
          <!-- Notifications Bell -->
          <div class="notif-btn-wrap">
            <a href="/pages/notifications.html" class="btn btn-secondary btn-icon" title="Notifications">
              🔔
            </a>
            <span id="notif-badge-count" class="notif-badge" style="display: none;">0</span>
          </div>

          <!-- User Profile Dropdown -->
          <div style="position: relative;" id="user-menu-wrap">
            <button id="user-menu-btn" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <div class="avatar avatar-sm" style="background-color: ${user.avatar_color || 'var(--brand-primary)'};">
                ${getInitials(user.name)}
              </div>
            </button>
            <div id="user-dropdown" class="card" style="display: none; position: absolute; right: 0; top: 3.25rem; width: 220px; padding: 0.75rem; z-index: 200; box-shadow: var(--shadow-xl);">
              <div style="padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                <div style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary);">${user.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-tertiary);">@${user.username}</div>
              </div>
              <a href="/pages/profile.html" class="nav-link" style="padding: 0.4rem 0.6rem; font-size: 0.875rem;">👤 My Profile</a>
              <a href="/pages/saved.html" class="nav-link" style="padding: 0.4rem 0.6rem; font-size: 0.875rem;">🔖 Saved Posts</a>
              <a href="/pages/activity.html" class="nav-link" style="padding: 0.4rem 0.6rem; font-size: 0.875rem;">⚡ My Activity</a>
              <a href="/pages/settings.html" class="nav-link" style="padding: 0.4rem 0.6rem; font-size: 0.875rem;">⚙️ Settings</a>
              ${user.role === 'admin' || user.role === 'moderator' ? `
                <a href="/pages/admin.html" class="nav-link" style="padding: 0.4rem 0.6rem; font-size: 0.875rem; color: var(--accent-rose);">🛡️ Admin & Mod</a>
              ` : ''}
              <div style="border-top: 1px solid var(--border-color); margin-top: 0.5rem; padding-top: 0.5rem;">
                <button id="logout-btn" class="nav-link" style="width: 100%; text-align: left; padding: 0.4rem 0.6rem; font-size: 0.875rem; color: var(--accent-rose);">🚪 Log Out</button>
              </div>
            </div>
          </div>
        ` : `
          <a href="/pages/login.html" class="btn btn-secondary btn-sm">Log In</a>
          <a href="/pages/signup.html" class="btn btn-primary btn-sm">Join UniCircle</a>
        `}
      </div>
    `;

    // Search Enter listener
    const searchInput = topHeader.querySelector('#global-search-input');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
          window.location.href = `/pages/search.html?q=${encodeURIComponent(searchInput.value.trim())}`;
        }
      });
    }

    // Theme dropdown toggles
    const themeBtn = topHeader.querySelector('#theme-toggle-btn');
    const themeDropdown = topHeader.querySelector('#theme-dropdown');
    if (themeBtn && themeDropdown) {
      themeBtn.onclick = (e) => {
        e.stopPropagation();
        themeDropdown.style.display = themeDropdown.style.display === 'none' ? 'block' : 'none';
      };
      themeDropdown.querySelectorAll('.theme-option-btn').forEach(btn => {
        btn.onclick = () => {
          setTheme(btn.dataset.themeId);
          themeDropdown.style.display = 'none';
        };
      });
    }

    // User dropdown toggles
    const userBtn = topHeader.querySelector('#user-menu-btn');
    const userDropdown = topHeader.querySelector('#user-dropdown');
    if (userBtn && userDropdown) {
      userBtn.onclick = (e) => {
        e.stopPropagation();
        userDropdown.style.display = userDropdown.style.display === 'none' ? 'block' : 'none';
      };
    }

    const logoutBtn = topHeader.querySelector('#logout-btn');
    if (logoutBtn) {
      logoutBtn.onclick = () => auth.logout();
    }

    document.addEventListener('click', () => {
      if (themeDropdown) themeDropdown.style.display = 'none';
      if (userDropdown) userDropdown.style.display = 'none';
    });
  }

  // 2. LEFT SIDEBAR
  const leftSidebar = document.querySelector('.left-sidebar');
  if (leftSidebar && user) {
    leftSidebar.innerHTML = `
      <div style="margin-bottom: 0.5rem;">
        <button id="sidebar-new-post-btn" class="btn btn-primary btn-interactive" style="width: 100%; padding: 0.8rem 1rem; font-size: 0.9375rem; box-shadow: var(--brand-glow);">
          <span>✍️</span>
          <span>New Discussion</span>
        </button>
      </div>

      <nav class="nav-menu">
        <a href="/pages/home.html" class="nav-link ${activePage === 'home' ? 'active' : ''}">
          <span class="nav-icon">🏠</span>
          <span>Home Feed</span>
        </a>
        <a href="/pages/discussions.html" class="nav-link ${activePage === 'discussions' ? 'active' : ''}">
          <span class="nav-icon">💬</span>
          <span>Discussions</span>
        </a>
        <a href="/pages/communities.html" class="nav-link ${activePage === 'communities' ? 'active' : ''}">
          <span class="nav-icon">🏛️</span>
          <span>Communities</span>
        </a>
        <a href="/pages/groups.html" class="nav-link ${activePage === 'groups' ? 'active' : ''}">
          <span class="nav-icon">👥</span>
          <span>Study Groups</span>
        </a>
        <a href="/pages/saved.html" class="nav-link ${activePage === 'saved' ? 'active' : ''}">
          <span class="nav-icon">🔖</span>
          <span>Saved Posts</span>
        </a>
        <a href="/pages/activity.html" class="nav-link ${activePage === 'activity' ? 'active' : ''}">
          <span class="nav-icon">⚡</span>
          <span>My Activity</span>
        </a>
        <a href="/pages/settings.html" class="nav-link ${activePage === 'settings' ? 'active' : ''}">
          <span class="nav-icon">⚙️</span>
          <span>Settings</span>
        </a>
        ${user.role === 'admin' || user.role === 'moderator' ? `
          <a href="/pages/admin.html" class="nav-link ${activePage === 'admin' ? 'active' : ''}" style="color: var(--accent-rose);">
            <span class="nav-icon">🛡️</span>
            <span>Moderation</span>
          </a>
        ` : ''}
      </nav>

      <!-- Enrolled Courses Quick List -->
      ${user.courses && user.courses.length > 0 ? `
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 0.625rem;">My Courses</div>
          <div style="display: flex; flex-direction: column; gap: 0.25rem;">
            ${user.courses.map(c => `
              <a href="/pages/course.html?id=${c.id}" class="nav-link" style="padding: 0.4rem 0.6rem; font-size: 0.8125rem;">
                <span class="badge badge-course" style="font-size: 0.6875rem;">${c.code}</span>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</span>
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    const newPostBtn = leftSidebar.querySelector('#sidebar-new-post-btn');
    if (newPostBtn) {
      newPostBtn.onclick = () => modal.showCreateDiscussionModal();
    }
  }

  // 3. RIGHT RAIL: ACADEMIC IDENTITY CARD
  const rightRail = document.querySelector('.right-rail');
  if (rightRail && user) {
    rightRail.innerHTML = `
      <div class="identity-card animate-fade-in">
        <div class="identity-header">
          <div class="avatar avatar-md" style="background-color: ${user.avatar_color || 'var(--brand-primary)'};">
            ${getInitials(user.name)}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary);">${user.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary);">@${user.username}</div>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
          <div class="identity-item">
            <span class="identity-label">Institution:</span>
            <span class="identity-val">${user.institution_name || 'Not set'}</span>
          </div>
          <div class="identity-item">
            <span class="identity-label">Faculty:</span>
            <span class="identity-val">${user.faculty_name || 'Not set'}</span>
          </div>
          <div class="identity-item">
            <span class="identity-label">Program:</span>
            <span class="identity-val">${user.program_name || 'Not set'}</span>
          </div>
          <div class="identity-item">
            <span class="identity-label">Year:</span>
            <span class="identity-val">${user.academic_year || 'Year 1'}</span>
          </div>
        </div>

        <div style="margin-top: 1rem;">
          <a href="/pages/settings.html" class="btn btn-secondary btn-sm" style="width: 100%;">Edit Identity</a>
        </div>
      </div>

      <!-- Quick Actions Card -->
      <div class="card" style="padding: 1.25rem;">
        <div style="font-weight: 700; font-size: 0.875rem; color: var(--text-primary); margin-bottom: 0.75rem;">⚡ Quick Actions</div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <button id="quick-create-disc-btn" class="btn btn-secondary btn-sm" style="justify-content: flex-start;">✍️ Ask a Question</button>
          <button id="quick-create-grp-btn" class="btn btn-secondary btn-sm" style="justify-content: flex-start;">👥 Form Study Group</button>
          <a href="/pages/communities.html" class="btn btn-secondary btn-sm" style="justify-content: flex-start;">🏛️ Browse Communities</a>
        </div>
      </div>
    `;

    const quickDiscBtn = rightRail.querySelector('#quick-create-disc-btn');
    if (quickDiscBtn) quickDiscBtn.onclick = () => modal.showCreateDiscussionModal();
    const quickGrpBtn = rightRail.querySelector('#quick-create-grp-btn');
    if (quickGrpBtn) quickGrpBtn.onclick = () => modal.showCreateGroupModal();
  }

  // 4. MOBILE BOTTOM NAVIGATION BAR
  let mobileNav = document.querySelector('.mobile-nav-bar');
  if (!mobileNav) {
    mobileNav = document.createElement('div');
    mobileNav.className = 'mobile-nav-bar';
    document.body.appendChild(mobileNav);
  }

  mobileNav.innerHTML = `
    <a href="/pages/home.html" class="mobile-nav-item ${activePage === 'home' ? 'active' : ''}">
      <span class="mobile-nav-icon">🏠</span>
      <span>Home</span>
    </a>
    <a href="/pages/communities.html" class="mobile-nav-item ${activePage === 'communities' ? 'active' : ''}">
      <span class="mobile-nav-icon">🏛️</span>
      <span>Communities</span>
    </a>
    <button id="mobile-create-post-btn" class="mobile-create-btn" title="Create Discussion">
      +
    </button>
    <a href="/pages/notifications.html" class="mobile-nav-item ${activePage === 'notifications' ? 'active' : ''}">
      <span class="mobile-nav-icon">🔔</span>
      <span>Alerts</span>
    </a>
    <a href="/pages/profile.html" class="mobile-nav-item ${activePage === 'profile' ? 'active' : ''}">
      <span class="mobile-nav-icon">👤</span>
      <span>Profile</span>
    </a>
  `;

  const mobileCreateBtn = mobileNav.querySelector('#mobile-create-post-btn');
  if (mobileCreateBtn) {
    mobileCreateBtn.onclick = () => modal.showCreateDiscussionModal();
  }

  // Initialize live notifications check & SSE
  if (user) {
    initNotificationsStream();
  }
}

// REAL-TIME NOTIFICATIONS
async function initNotificationsStream() {
  const token = localStorage.getItem('unicircle_token');
  if (!token) return;

  // Initial unread fetch
  try {
    const data = await api.get('/notifications?unread_only=true');
    updateNotifBadge(data.unread_count);
  } catch (e) {}

  // Setup SSE stream
  try {
    const evtSource = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    evtSource.addEventListener('notification', (e) => {
      try {
        const notif = JSON.parse(e.data);
        toast.info(`🔔 ${notif.title}: ${notif.message}`, 5000);
        // Increment badge
        const badge = document.getElementById('notif-badge-count');
        if (badge) {
          const current = parseInt(badge.textContent, 10) || 0;
          updateNotifBadge(current + 1);
        }
      } catch (err) {}
    });
  } catch (err) {
    console.warn('SSE connection error:', err);
  }
}

function updateNotifBadge(count) {
  const badge = document.getElementById('notif-badge-count');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}
