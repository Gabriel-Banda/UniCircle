// Communities Hub Page Controller
import { initTheme, escapeHTML } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

let currentLevel = '';
let currentSearch = '';

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('communities');
  setupEventListeners();
  loadCommunities();
}

function setupEventListeners() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentLevel = tab.dataset.level;
      loadCommunities();
    };
  });

  const searchInput = document.getElementById('comm-search-input');
  if (searchInput) {
    let debounce;
    searchInput.oninput = (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        currentSearch = e.target.value.trim();
        loadCommunities();
      }, 300);
    };
  }
}

async function loadCommunities() {
  const grid = document.getElementById('communities-grid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="card skeleton" style="height: 160px;"></div>
    <div class="card skeleton" style="height: 160px;"></div>
    <div class="card skeleton" style="height: 160px;"></div>
  `;

  try {
    const params = {};
    if (currentLevel) params.level = currentLevel;
    if (currentSearch) params.q = currentSearch;

    const res = await api.get('/communities', params);
    const communities = res.communities || [];

    if (communities.length === 0) {
      grid.style.display = 'block';
      grid.innerHTML = renderEmptyState({
        icon: '🏛️',
        title: 'No communities found',
        description: 'No academic spaces match this search filter.'
      });
      return;
    }

    grid.style.display = 'grid';
    grid.innerHTML = communities.map(c => `
      <div class="card interactive-card" style="display: flex; flex-direction: column; justify-content: space-between; gap: 1rem; border-top: 4px solid ${c.cover_color || 'var(--brand-primary)'};">
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="font-size: 1.75rem;">${c.icon || '🎓'}</span>
            <span class="badge" style="text-transform: capitalize;">${c.level}</span>
          </div>
          <a href="/pages/community.html?id=${c.id}" style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary); display: block; line-height: 1.3;">
            ${escapeHTML(c.name)}
          </a>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.35rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHTML(c.description || 'Academic community space.')}
          </p>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: auto;">
          <span style="font-size: 0.75rem; color: var(--text-tertiary);">
            👥 ${c.members_count || 0} members • 💬 ${c.discussions_count || 0}
          </span>
          <button class="btn btn-sm ${c.is_member ? 'btn-secondary' : 'btn-primary'} join-comm-btn" data-id="${c.id}" data-joined="${c.is_member}">
            ${c.is_member ? 'Joined ✓' : 'Join'}
          </button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.join-comm-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const isJoined = btn.dataset.joined === 'true';

        try {
          if (isJoined) {
            await api.delete(`/communities/${id}/join`);
            btn.dataset.joined = 'false';
            btn.className = 'btn btn-sm btn-primary join-comm-btn';
            btn.textContent = 'Join';
            toast.info('Left community.');
          } else {
            await api.post(`/communities/${id}/join`);
            btn.dataset.joined = 'true';
            btn.className = 'btn btn-sm btn-secondary join-comm-btn';
            btn.textContent = 'Joined ✓';
            toast.success('Joined community!');
          }
        } catch (err) {
          toast.error(err.message);
        }
      };
    });
  } catch (err) {
    grid.innerHTML = `<p style="color: var(--accent-rose);">Failed to load communities.</p>`;
  }
}

init();
