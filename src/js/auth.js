// UniCircle Auth State & Route Protection
import { api } from './api.js';

class AuthManager {
  constructor() {
    this.user = null;
    this.loadCachedUser();
  }

  loadCachedUser() {
    try {
      const cached = localStorage.getItem('unicircle_user');
      if (cached) {
        this.user = JSON.parse(cached);
      }
    } catch (e) {
      this.user = null;
    }
  }

  getUser() {
    return this.user;
  }

  isAuthenticated() {
    return !!localStorage.getItem('unicircle_token');
  }

  setSession(token, user) {
    localStorage.setItem('unicircle_token', token);
    localStorage.setItem('unicircle_user', JSON.stringify(user));
    this.user = user;
    if (user.settings && user.settings.theme) {
      document.documentElement.setAttribute('data-theme', user.settings.theme);
      localStorage.setItem('unicircle_theme', user.settings.theme);
    }
  }

  async fetchCurrentUser() {
    if (!this.isAuthenticated()) return null;
    try {
      const data = await api.get('/auth/me');
      if (data.user) {
        this.setSession(localStorage.getItem('unicircle_token'), data.user);
        return data.user;
      }
    } catch (err) {
      console.warn('Failed to refresh user session:', err);
    }
    return this.user;
  }

  logout() {
    localStorage.removeItem('unicircle_token');
    localStorage.removeItem('unicircle_user');
    this.user = null;
    window.location.href = '/pages/login.html';
  }

  // Guard protected pages
  async requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = `/pages/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return false;
    }

    const user = await this.fetchCurrentUser();
    if (!user) {
      window.location.href = '/pages/login.html';
      return false;
    }

    // If user hasn't set their academic institution and is not on the onboarding page, redirect to onboarding
    if (!user.institution_id && !window.location.pathname.includes('onboarding.html')) {
      window.location.href = '/pages/onboarding.html';
      return false;
    }

    return user;
  }

  // Prevent logged-in users from viewing login / register pages
  checkGuest() {
    if (this.isAuthenticated()) {
      window.location.href = '/pages/home.html';
    }
  }
}

export const auth = new AuthManager();
