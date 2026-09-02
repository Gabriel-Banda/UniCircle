// Settings Page Controller
import { initTheme, setTheme, THEMES } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderNavigation } from '../components/nav.js';
import { toast } from '../components/toast.js';

initTheme();

const PALETTE = [
  '#4F46E5', '#7C3AED', '#EC4899', '#F43F5E', '#EA580C',
  '#D97706', '#059669', '#0D9488', '#0284C7', '#2563EB'
];

let selectedColor = '#4F46E5';

async function init() {
  const user = await auth.requireAuth();
  if (!user) return;

  renderNavigation('settings');
  populateSettings(user);
  setupTabs();
  renderPalette(user);
  renderThemeCards();
  setupForms(user);
}

function populateSettings(user) {
  document.getElementById('set-name').value = user.name || '';
  document.getElementById('set-username').value = user.username || '';
  document.getElementById('set-bio').value = user.bio || '';
  document.getElementById('set-year').value = user.academic_year || 'Year 1';
  selectedColor = user.avatar_color || '#4F46E5';
}

function setupTabs() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const secId = tab.dataset.section;
      document.querySelectorAll('.settings-section').forEach(sec => {
        sec.style.display = sec.id === secId ? 'block' : 'none';
      });
    };
  });
}

function renderPalette(user) {
  const container = document.getElementById('avatar-color-palette');
  if (!container) return;

  container.innerHTML = PALETTE.map(color => `
    <button type="button" class="avatar-color-choice" data-color="${color}" style="width: 2rem; height: 2rem; border-radius: var(--radius-full); background: ${color}; border: 3px solid ${color === selectedColor ? '#ffffff' : 'transparent'}; cursor: pointer; transition: transform var(--transition-fast); box-shadow: var(--shadow-sm);"></button>
  `).join('');

  container.querySelectorAll('.avatar-color-choice').forEach(btn => {
    btn.onclick = () => {
      selectedColor = btn.dataset.color;
      container.querySelectorAll('.avatar-color-choice').forEach(b => {
        b.style.border = b.dataset.color === selectedColor ? '3px solid #ffffff' : 'transparent';
      });
    };
  });
}

function renderThemeCards() {
  const grid = document.getElementById('theme-selector-grid');
  if (!grid) return;

  const currentTheme = localStorage.getItem('unicircle_theme') || 'dark';

  grid.innerHTML = THEMES.map(t => `
    <div class="card interactive-card theme-card ${t.id === currentTheme ? 'active-theme' : ''}" data-theme="${t.id}" style="padding: 1.25rem; cursor: pointer; border: 2px solid ${t.id === currentTheme ? 'var(--brand-primary)' : 'var(--border-color)'};">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">${t.icon}</div>
      <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary);">${t.name}</div>
      <span style="font-size: 0.75rem; color: var(--text-tertiary);">${t.id === currentTheme ? 'Currently Active' : 'Click to Apply'}</span>
    </div>
  `).join('');

  grid.querySelectorAll('.theme-card').forEach(card => {
    card.onclick = async () => {
      const themeId = card.dataset.theme;
      setTheme(themeId);
      renderThemeCards();
      toast.success(`Applied ${themeId} theme.`);

      try {
        await api.put('/auth/settings', { theme: themeId });
      } catch (e) {}
    };
  });
}

function setupForms(user) {
  // Profile form
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('save-profile-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const name = document.getElementById('set-name').value.trim();
      const username = document.getElementById('set-username').value.trim();
      const bio = document.getElementById('set-bio').value.trim();

      try {
        const res = await api.put('/auth/profile', {
          name,
          username,
          bio,
          avatar_color: selectedColor
        });
        auth.setSession(localStorage.getItem('unicircle_token'), res.user);
        toast.success('Profile updated successfully!');
        renderNavigation('settings');
      } catch (err) {
        toast.error(err.message || 'Failed to update profile.');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Profile Changes';
      }
    };
  }

  // Academic info form
  const academicForm = document.getElementById('academic-form');
  if (academicForm) {
    academicForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('save-academic-btn');
      saveBtn.disabled = true;

      const academic_year = document.getElementById('set-year').value;

      try {
        const res = await api.put('/auth/academic', {
          institution_id: user.institution_id,
          faculty_id: user.faculty_id,
          program_id: user.program_id,
          academic_year
        });
        auth.setSession(localStorage.getItem('unicircle_token'), res.user);
        toast.success('Academic information updated!');
        renderNavigation('settings');
      } catch (err) {
        toast.error(err.message || 'Failed to update academic info.');
      } finally {
        saveBtn.disabled = false;
      }
    };
  }

  // Password form
  const passForm = document.getElementById('password-form');
  if (passForm) {
    passForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('save-pass-btn');
      saveBtn.disabled = true;

      const current_password = document.getElementById('current-pass').value;
      const new_password = document.getElementById('new-pass').value;

      try {
        await api.put('/auth/password', { current_password, new_password });
        toast.success('Password changed successfully!');
        document.getElementById('current-pass').value = '';
        document.getElementById('new-pass').value = '';
      } catch (err) {
        toast.error(err.message || 'Failed to change password.');
      } finally {
        saveBtn.disabled = false;
      }
    };
  }

  // Delete account form
  const deleteForm = document.getElementById('delete-account-form');
  if (deleteForm) {
    deleteForm.onsubmit = async (e) => {
      e.preventDefault();
      const password = document.getElementById('delete-pass').value;
      if (!confirm('Are you ABSOLUTELY certain you want to permanently delete your UniCircle account? This action cannot be undone.')) {
        return;
      }

      try {
        await api.delete('/auth/account', { password });
        toast.info('Account deleted.');
        auth.logout();
      } catch (err) {
        toast.error(err.message || 'Failed to delete account.');
      }
    };
  }
}

init();
