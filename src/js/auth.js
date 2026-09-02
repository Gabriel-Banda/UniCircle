// UniCircle Auth Manager powered directly by Supabase
import { supabase } from './supabase.js';

class AuthManager {
  constructor() {
    this.user = null;
    this.session = null;
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
    return !!localStorage.getItem('unicircle_token') || !!this.user;
  }

  setSession(token, user) {
    localStorage.setItem('unicircle_token', token || 'supabase_active_session');
    localStorage.setItem('unicircle_user', JSON.stringify(user));
    this.user = user;
    if (user && user.settings && user.settings.theme) {
      document.documentElement.setAttribute('data-theme', user.settings.theme);
      localStorage.setItem('unicircle_theme', user.settings.theme);
    }
  }

  async fetchCurrentUser() {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) {
        this.user = null;
        localStorage.removeItem('unicircle_token');
        localStorage.removeItem('unicircle_user');
        return null;
      }

      this.session = session;
      const userId = session.user.id;

      // Fetch profile from public.profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select(`
          *,
          institution:institutions(name),
          faculty:faculties(name),
          program:programs(name)
        `)
        .eq('id', userId)
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        console.warn('Profile fetch error:', profileError);
      }

      // If profile doesn't exist yet, construct base profile from auth metadata
      const userMeta = session.user.user_metadata || {};
      const fullUser = {
        id: userId,
        email: session.user.email,
        username: profile?.username || userMeta.username || session.user.email.split('@')[0],
        name: profile?.name || userMeta.name || session.user.email.split('@')[0],
        bio: profile?.bio || '',
        avatar_color: profile?.avatar_color || '#4F46E5',
        avatar_url: profile?.avatar_url || '',
        role: profile?.role || 'student',
        institution_id: profile?.institution_id || null,
        institution_name: profile?.institution?.name || null,
        faculty_id: profile?.faculty_id || null,
        faculty_name: profile?.faculty?.name || null,
        program_id: profile?.program_id || null,
        program_name: profile?.program?.name || null,
        academic_year: profile?.academic_year || 'Year 1',
        settings: profile?.settings || { theme: 'dark' },
        courses: []
      };

      // Fetch user's enrolled courses
      const { data: userCourses } = await supabase
        .from('user_courses')
        .select('course_id, courses(*)')
        .eq('user_id', userId);

      if (userCourses) {
        fullUser.courses = userCourses.map(uc => uc.courses).filter(Boolean);
      }

      this.setSession(session.access_token, fullUser);
      return fullUser;
    } catch (err) {
      console.warn('Failed to refresh Supabase user session:', err);
      return this.user;
    }
  }

  async logout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    localStorage.removeItem('unicircle_token');
    localStorage.removeItem('unicircle_user');
    this.user = null;
    this.session = null;
    window.location.href = '/pages/login.html';
  }

  async requireAuth() {
    const user = await this.fetchCurrentUser();
    if (!user) {
      window.location.href = `/pages/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return false;
    }

    if (!user.institution_id && !window.location.pathname.includes('onboarding.html')) {
      window.location.href = '/pages/onboarding.html';
      return false;
    }

    return user;
  }

  async checkGuest() {
    const user = await this.fetchCurrentUser();
    if (user) {
      window.location.href = '/pages/home.html';
    }
  }
}

export const auth = new AuthManager();
