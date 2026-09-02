// Admin & Moderation Controller
import { initTheme, formatTimeAgo, escapeHTML } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { toast } from '../components/toast.js';
import { renderEmptyState } from '../components/empty-state.js';

initTheme();

let currentReportStatus = 'pending';

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  if (user.role !== 'admin' && user.role !== 'moderator') {
    toast.error('Access denied. Administrator privileges required.');
    window.location.href = '/pages/home.html';
    return;
  }

  renderNavigation('admin');
  loadMetrics();
  setupTabs();
  loadReports();
}

function setupTabs() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentReportStatus = tab.dataset.status;
      loadReports();
    };
  });
}

async function loadMetrics() {
  const grid = document.getElementById('admin-metrics-grid');
  if (!grid) return;

  try {
    const res = await api.get('/admin/metrics');
    const m = res.metrics;

    grid.innerHTML = `
      <div class="card" style="padding: 1rem; text-align: center;">
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--brand-primary);">${m.total_students || 0}</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">Students</div>
      </div>
      <div class="card" style="padding: 1rem; text-align: center;">
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent-blue);">${m.total_discussions || 0}</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">Discussions</div>
      </div>
      <div class="card" style="padding: 1rem; text-align: center;">
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent-green);">${m.total_courses || 0}</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">Courses</div>
      </div>
      <div class="card" style="padding: 1rem; text-align: center;">
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent-amber);">${m.total_groups || 0}</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">Study Groups</div>
      </div>
      <div class="card" style="padding: 1rem; text-align: center;">
        <div style="font-size: 1.5rem; font-weight: 800; color: ${m.pending_reports > 0 ? 'var(--accent-rose)' : 'var(--text-tertiary)'};">${m.pending_reports || 0}</div>
        <div style="font-size: 0.75rem; color: var(--text-tertiary);">Pending Reports</div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load admin metrics:', err);
  }
}

async function loadReports() {
  const container = document.getElementById('reports-list-container');
  if (!container) return;

  container.innerHTML = `
    <div class="card skeleton" style="height: 120px; margin-bottom: 0.5rem;"></div>
  `;

  try {
    const res = await api.get('/admin/reports', { status: currentReportStatus });
    const reports = res.reports || [];

    if (reports.length === 0) {
      container.innerHTML = renderEmptyState({
        icon: '🛡️',
        title: `No ${currentReportStatus} reports`,
        description: 'All clear! No flagged content in this queue.'
      });
      return;
    }

    container.innerHTML = reports.map(r => `
      <div class="card" style="padding: 1.25rem; border-left: 4px solid var(--accent-rose);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <div>
            <span class="badge badge-danger" style="margin-right: 0.5rem; text-transform: uppercase;">${escapeHTML(r.target_type)}</span>
            <span style="font-weight: 700; color: var(--text-primary); font-size: 0.9375rem;">${escapeHTML(r.reason)}</span>
          </div>
          <span class="post-time">${formatTimeAgo(r.created_at)}</span>
        </div>

        ${r.details ? `<p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.75rem;">"${escapeHTML(r.details)}"</p>` : ''}

        ${r.target_preview ? `
          <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: var(--radius-md); font-size: 0.875rem; margin-bottom: 0.75rem;">
            <div style="font-weight: 600; color: var(--text-primary);">${escapeHTML(r.target_preview.title || r.target_preview.name || 'Content preview')}:</div>
            <div style="color: var(--text-secondary); font-size: 0.8125rem;">${escapeHTML(r.target_preview.body || r.target_preview.bio || '')}</div>
          </div>
        ` : ''}

        <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.75rem;">
          Reported by: @${escapeHTML(r.reporter_username || 'student')}
        </div>

        ${r.status === 'pending' ? `
          <div style="display: flex; gap: 0.5rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <button class="btn btn-danger btn-sm resolve-btn" data-id="${r.id}" data-action="Deleted violating content">Resolve & Delete Content</button>
            <button class="btn btn-secondary btn-sm dismiss-btn" data-id="${r.id}">Dismiss Report</button>
          </div>
        ` : `
          <div style="font-size: 0.75rem; color: var(--accent-green); border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
            Status: ${r.status} ${r.action_taken ? `(${r.action_taken})` : ''}
          </div>
        `}
      </div>
    `).join('');

    // Event listeners
    container.querySelectorAll('.resolve-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const action_taken = btn.dataset.action;
        try {
          await api.put(`/admin/reports/${id}`, { status: 'resolved', action_taken });
          toast.success('Report resolved.');
          loadReports();
          loadMetrics();
        } catch (err) {
          toast.error(err.message);
        }
      };
    });

    container.querySelectorAll('.dismiss-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        try {
          await api.put(`/admin/reports/${id}`, { status: 'dismissed', action_taken: 'Dismissed as false report' });
          toast.info('Report dismissed.');
          loadReports();
          loadMetrics();
        } catch (err) {
          toast.error(err.message);
        }
      };
    });
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Failed to load moderation reports.</p>`;
  }
}

init();
