// UniCircle Global Configuration & Helpers

export const API_BASE = '/api';

// Theme Management
export const THEMES = [
  { id: 'dark', name: 'Dark Mode', icon: '🌙' },
  { id: 'light', name: 'Light Mode', icon: '☀️' },
  { id: 'navy', name: 'Midnight Navy', icon: '🌊' },
  { id: 'emerald', name: 'Emerald Campus', icon: '🌿' },
  { id: 'sunset', name: 'Sunset Glow', icon: '🌅' },
  { id: 'cyberpunk', name: 'Cyberpunk Neon', icon: '⚡' }
];

export function initTheme() {
  const savedTheme = localStorage.getItem('unicircle_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  return savedTheme;
}

export function setTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  localStorage.setItem('unicircle_theme', themeId);
}

// Relative Time Formatter (e.g., "5m ago", "2h ago", "yesterday")
export function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) return `${diffInWeeks}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Format Initial Avatar
export function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// HTML Entity Escape / Sanitize
export function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Discussion Category Icons
export const CATEGORY_ICONS = {
  'Questions': '❓',
  'Course Discussion': '💬',
  'Assignments': '📝',
  'Exams': '🎯',
  'Study Help': '💡',
  'Resources': '📂',
  'Study Groups': '👥',
  'Campus Life': '🏫',
  'Announcements': '📢',
  'Projects': '🚀',
  'Career': '💼',
  'General': '📌'
};
