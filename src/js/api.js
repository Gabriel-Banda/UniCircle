// UniCircle Supabase API Bridge for Cloudflare Pages
import { supabase } from './supabase.js';
import { auth } from './auth.js';

class ApiClient {
  // ---------------- AUTHENTICATION ----------------
  async register({ email, password, username, name }) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');

    // Check if username is taken in public.profiles
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (existingUser) {
      throw new Error('This username is already taken. Please choose another.');
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        data: {
          username: cleanUsername,
          name: name.trim()
        }
      }
    });

    if (error) throw new Error(error.message);

    const user = data.user;
    if (!user) throw new Error('Registration failed.');

    // Upsert into profiles table
    const avatarColor = '#4F46E5';
    await supabase.from('profiles').upsert({
      id: user.id,
      email: cleanEmail,
      username: cleanUsername,
      name: name.trim(),
      avatar_color: avatarColor,
      created_at: new Date().toISOString()
    });

    // Check if email confirmation is required
    if (!data.session) {
      return {
        message: 'Account created! Please check your email to confirm your account (or log in).',
        token: null,
        user: { id: user.id, email: cleanEmail, name, username: cleanUsername }
      };
    }

    const fullUser = await auth.fetchCurrentUser();
    return {
      message: 'Account created successfully!',
      token: data.session.access_token,
      user: fullUser
    };
  }

  async login({ login, password }) {
    let cleanEmail = login.trim().toLowerCase();

    // If login is a username (no @), look up the email
    if (!cleanEmail.includes('@')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('username', cleanEmail)
        .maybeSingle();

      if (profile && profile.email) {
        cleanEmail = profile.email;
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error) throw new Error(error.message);

    const fullUser = await auth.fetchCurrentUser();
    return {
      message: 'Logged in successfully.',
      token: data.session.access_token,
      user: fullUser
    };
  }

  // ---------------- ROUTER COMPATIBILITY LAYER ----------------
  async post(endpoint, body = {}) {
    if (endpoint === '/auth/register') return this.register(body);
    if (endpoint === '/auth/login') return this.login(body);
    if (endpoint === '/auth/reset-password-request') {
      const { error } = await supabase.auth.resetPasswordForEmail(body.email, {
        redirectTo: `${window.location.origin}/pages/reset-password.html`
      });
      if (error) throw new Error(error.message);
      return { message: 'Password reset link sent to your email.' };
    }
    if (endpoint === '/auth/reset-password') {
      const { error } = await supabase.auth.updateUser({ password: body.new_password });
      if (error) throw new Error(error.message);
      return { message: 'Password updated successfully!' };
    }

    // Academic Additions
    if (endpoint === '/academic/institutions') {
      const { data, error } = await supabase
        .from('institutions')
        .insert({ name: body.name.trim(), short_code: body.short_code?.trim() || '' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { institution: data };
    }

    if (endpoint.startsWith('/academic/institutions/') && endpoint.endsWith('/faculties')) {
      const instId = endpoint.split('/')[3];
      const { data, error } = await supabase
        .from('faculties')
        .insert({ institution_id: instId, name: body.name.trim() })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { faculty: data };
    }

    if (endpoint.startsWith('/academic/faculties/') && endpoint.endsWith('/programs')) {
      const facId = endpoint.split('/')[3];
      const { data, error } = await supabase
        .from('programs')
        .insert({ faculty_id: facId, name: body.name.trim() })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { program: data };
    }

    if (endpoint.startsWith('/academic/programs/') && endpoint.endsWith('/courses')) {
      const progId = endpoint.split('/')[3];
      const { data, error } = await supabase
        .from('courses')
        .insert({
          program_id: progId,
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          academic_year: body.academic_year || 'Year 1'
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { course: data };
    }

    if (endpoint.startsWith('/academic/courses/') && endpoint.endsWith('/enroll')) {
      const courseId = endpoint.split('/')[3];
      const user = auth.getUser();
      await supabase.from('user_courses').upsert({ user_id: user.id, course_id: courseId });
      return { message: 'Enrolled in course' };
    }

    // Discussions Create
    if (endpoint === '/discussions') {
      const user = auth.getUser();
      const { data, error } = await supabase
        .from('discussions')
        .insert({
          title: body.title.trim(),
          body: body.body.trim(),
          category: body.category || 'General',
          course_id: body.course_id || null,
          community_id: body.community_id || null,
          institution_id: user.institution_id || null,
          author_id: user.id,
          is_anonymous: body.is_anonymous || false,
          tags: body.tags || [],
          attachment_url: body.attachment_url || null,
          attachment_name: body.attachment_name || null
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return { discussion: data, message: 'Discussion posted!' };
    }

    // Upvote Discussion
    if (endpoint.startsWith('/discussions/') && endpoint.endsWith('/upvote')) {
      const discId = endpoint.split('/')[2];
      const user = auth.getUser();
      const { data: existing } = await supabase
        .from('reactions')
        .select('id')
        .eq('target_type', 'discussion')
        .eq('target_id', discId)
        .eq('user_id', user.id)
        .maybeSingle();

      let isUpvoted = false;
      if (existing) {
        await supabase.from('reactions').delete().eq('id', existing.id);
        isUpvoted = false;
      } else {
        await supabase.from('reactions').insert({
          target_type: 'discussion',
          target_id: discId,
          user_id: user.id,
          reaction_type: 'upvote'
        });
        isUpvoted = true;
      }

      const { count } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })
        .eq('target_type', 'discussion')
        .eq('target_id', discId);

      return { is_upvoted: isUpvoted, upvotes_count: count || 0 };
    }

    // Save / Bookmark Discussion
    if (endpoint.startsWith('/discussions/') && endpoint.endsWith('/save')) {
      const discId = endpoint.split('/')[2];
      const user = auth.getUser();
      const { data: existing } = await supabase
        .from('saved_discussions')
        .select('*')
        .eq('discussion_id', discId)
        .eq('user_id', user.id)
        .maybeSingle();

      let isSaved = false;
      if (existing) {
        await supabase.from('saved_discussions').delete().eq('discussion_id', discId).eq('user_id', user.id);
        isSaved = false;
      } else {
        await supabase.from('saved_discussions').insert({ discussion_id: discId, user_id: user.id });
        isSaved = true;
      }
      return { is_saved: isSaved };
    }

    // Comments Create
    if (endpoint.startsWith('/discussions/') && endpoint.endsWith('/comments')) {
      const discId = endpoint.split('/')[2];
      const user = auth.getUser();
      const { data, error } = await supabase
        .from('comments')
        .insert({
          discussion_id: discId,
          parent_id: body.parent_id || null,
          author_id: user.id,
          is_anonymous: body.is_anonymous || false,
          body: body.body.trim()
        })
        .select(`
          *,
          author:profiles(name, username, avatar_color)
        `)
        .single();

      if (error) throw new Error(error.message);
      return { comment: data };
    }

    // Upvote Comment
    if (endpoint.startsWith('/comments/') && endpoint.endsWith('/upvote')) {
      const commentId = endpoint.split('/')[2];
      const user = auth.getUser();
      const { data: existing } = await supabase
        .from('reactions')
        .select('id')
        .eq('target_type', 'comment')
        .eq('target_id', commentId)
        .eq('user_id', user.id)
        .maybeSingle();

      let isUpvoted = false;
      if (existing) {
        await supabase.from('reactions').delete().eq('id', existing.id);
        isUpvoted = false;
      } else {
        await supabase.from('reactions').insert({
          target_type: 'comment',
          target_id: commentId,
          user_id: user.id,
          reaction_type: 'upvote'
        });
        isUpvoted = true;
      }

      const { count } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })
        .eq('target_type', 'comment')
        .eq('target_id', commentId);

      return { is_upvoted: isUpvoted, upvotes_count: count || 0 };
    }

    // Study Groups Create
    if (endpoint === '/groups') {
      const user = auth.getUser();
      const { data, error } = await supabase
        .from('study_groups')
        .insert({
          name: body.name.trim(),
          description: body.description || '',
          course_id: body.course_id || null,
          creator_id: user.id,
          max_members: body.max_members || 20
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      await supabase.from('study_group_members').insert({ group_id: data.id, user_id: user.id, role: 'admin' });
      return { group: data };
    }

    // Join Study Group
    if (endpoint.startsWith('/groups/') && endpoint.endsWith('/join')) {
      const grpId = endpoint.split('/')[2];
      const user = auth.getUser();
      await supabase.from('study_group_members').upsert({ group_id: grpId, user_id: user.id, role: 'member' });
      return { message: 'Joined study group' };
    }

    // Send Group Message
    if (endpoint.startsWith('/groups/') && endpoint.endsWith('/messages')) {
      const grpId = endpoint.split('/')[2];
      const user = auth.getUser();
      const { data, error } = await supabase
        .from('study_group_messages')
        .insert({
          group_id: grpId,
          sender_id: user.id,
          message: body.message.trim()
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { message: data };
    }

    // Join Community
    if (endpoint.startsWith('/communities/') && endpoint.endsWith('/join')) {
      const commId = endpoint.split('/')[2];
      const user = auth.getUser();
      await supabase.from('community_members').upsert({ community_id: commId, user_id: user.id });
      return { message: 'Joined community' };
    }

    // Reports
    if (endpoint === '/admin/reports') {
      const user = auth.getUser();
      await supabase.from('reports').insert({
        reporter_id: user.id,
        target_type: body.target_type,
        target_id: body.target_id,
        reason: body.reason,
        details: body.details || ''
      });
      return { message: 'Report submitted' };
    }

    throw new Error(`Unsupported POST endpoint: ${endpoint}`);
  }

  async get(endpoint, params = {}) {
    if (endpoint === '/auth/me') {
      const user = await auth.fetchCurrentUser();
      return { user };
    }

    // Academic Lookups
    if (endpoint === '/academic/institutions') {
      let query = supabase.from('institutions').select('*').order('name');
      if (params.q) query = query.ilike('name', `%${params.q}%`);
      const { data } = await query;
      return { institutions: data || [] };
    }

    if (endpoint.startsWith('/academic/institutions/') && endpoint.endsWith('/faculties')) {
      const instId = endpoint.split('/')[3];
      const { data } = await supabase.from('faculties').select('*').eq('institution_id', instId).order('name');
      return { faculties: data || [] };
    }

    if (endpoint.startsWith('/academic/faculties/') && endpoint.endsWith('/programs')) {
      const facId = endpoint.split('/')[3];
      const { data } = await supabase.from('programs').select('*').eq('faculty_id', facId).order('name');
      return { programs: data || [] };
    }

    if (endpoint.startsWith('/academic/programs/') && endpoint.endsWith('/courses')) {
      const progId = endpoint.split('/')[3];
      let query = supabase.from('courses').select('*').eq('program_id', progId).order('code');
      if (params.year) query = query.eq('academic_year', params.year);
      const { data } = await query;
      return { courses: data || [] };
    }

    if (endpoint.startsWith('/academic/courses/') && !endpoint.includes('/members')) {
      const courseId = endpoint.split('/')[3];
      const user = auth.getUser();
      const { data: course } = await supabase
        .from('courses')
        .select(`*, program:programs(name, faculty:faculties(name, institution:institutions(name)))`)
        .eq('id', courseId)
        .maybeSingle();

      if (course && user) {
        const { data: enrollment } = await supabase
          .from('user_courses')
          .select('*')
          .eq('user_id', user.id)
          .eq('course_id', courseId)
          .maybeSingle();
        course.is_enrolled = !!enrollment;
      }
      return { course };
    }

    if (endpoint.startsWith('/academic/courses/') && endpoint.endsWith('/members')) {
      const courseId = endpoint.split('/')[3];
      const { data } = await supabase
        .from('user_courses')
        .select('joined_at, profile:profiles(id, name, username, avatar_color, bio, academic_year)')
        .eq('course_id', courseId);
      return { members: data ? data.map(d => ({ ...d.profile, joined_at: d.joined_at })) : [] };
    }

    // Discussions Listing
    if (endpoint === '/discussions') {
      const user = auth.getUser();
      let query = supabase
        .from('discussions')
        .select(`
          *,
          author:profiles(id, name, username, avatar_color, avatar_url),
          course:courses(code, name),
          reactions(count),
          comments(count)
        `)
        .order('created_at', { ascending: false });

      if (params.category && params.category !== 'All') query = query.eq('category', params.category);
      if (params.course_id) query = query.eq('course_id', params.course_id);
      if (params.community_id) query = query.eq('community_id', params.community_id);

      const { data, error } = await query;
      if (error) console.warn(error);

      const formatted = (data || []).map(d => ({
        ...d,
        course_code: d.course?.code,
        course_name: d.course?.name,
        upvotes_count: d.reactions?.[0]?.count || 0,
        comments_count: d.comments?.[0]?.count || 0,
        author: d.is_anonymous ? { name: 'Anonymous Student', username: 'anonymous', avatar_color: '#64748B' } : d.author
      }));

      return { discussions: formatted };
    }

    // Single Discussion Details
    if (endpoint.startsWith('/discussions/') && !endpoint.includes('/comments')) {
      const discId = endpoint.split('/')[2];
      const user = auth.getUser();
      const { data: d } = await supabase
        .from('discussions')
        .select(`
          *,
          author:profiles(id, name, username, avatar_color, avatar_url),
          course:courses(code, name)
        `)
        .eq('id', discId)
        .single();

      if (!d) throw new Error('Discussion not found.');

      // Check upvoted and saved state
      let isUpvoted = false;
      let isSaved = false;
      if (user) {
        const { data: react } = await supabase.from('reactions').select('id').eq('target_type', 'discussion').eq('target_id', discId).eq('user_id', user.id).maybeSingle();
        isUpvoted = !!react;
        const { data: save } = await supabase.from('saved_discussions').select('user_id').eq('discussion_id', discId).eq('user_id', user.id).maybeSingle();
        isSaved = !!save;
      }

      const { count: upvotesCount } = await supabase.from('reactions').select('*', { count: 'exact', head: true }).eq('target_type', 'discussion').eq('target_id', discId);
      const { count: commentsCount } = await supabase.from('comments').select('*', { count: 'exact', head: true }).eq('discussion_id', discId);

      return {
        discussion: {
          ...d,
          course_code: d.course?.code,
          course_name: d.course?.name,
          upvotes_count: upvotesCount || 0,
          comments_count: commentsCount || 0,
          is_upvoted: isUpvoted,
          is_saved: isSaved,
          is_author: user && user.id === d.author_id,
          author: d.is_anonymous && (!user || user.id !== d.author_id)
            ? { name: 'Anonymous Student', username: 'anonymous', avatar_color: '#64748B' }
            : d.author
        }
      };
    }

    // Comments List
    if (endpoint.startsWith('/discussions/') && endpoint.endsWith('/comments')) {
      const discId = endpoint.split('/')[2];
      const user = auth.getUser();
      const { data } = await supabase
        .from('comments')
        .select(`
          *,
          author:profiles(id, name, username, avatar_color)
        `)
        .eq('discussion_id', discId)
        .order('created_at', { ascending: true });

      const comments = (data || []).map(c => ({
        ...c,
        is_author: user && user.id === c.author_id,
        author: c.is_anonymous && (!user || user.id !== c.author_id)
          ? { name: 'Anonymous Student', username: 'anonymous', avatar_color: '#64748B' }
          : c.author
      }));

      return { comments, total: comments.length };
    }

    // Communities List
    if (endpoint === '/communities') {
      const { data } = await supabase.from('communities').select('*').order('name');
      return { communities: data || [] };
    }

    if (endpoint.startsWith('/communities/')) {
      const commId = endpoint.split('/')[2];
      const { data } = await supabase.from('communities').select('*').eq('id', commId).single();
      return { community: data };
    }

    // Study Groups List
    if (endpoint === '/groups') {
      const { data } = await supabase
        .from('study_groups')
        .select(`*, creator:profiles(name, username, avatar_color), course:courses(code, name)`)
        .order('created_at', { ascending: false });

      const formatted = (data || []).map(g => ({
        ...g,
        creator_name: g.creator?.name,
        creator_username: g.creator?.username,
        creator_avatar_color: g.creator?.avatar_color,
        course_code: g.course?.code,
        course_name: g.course?.name
      }));
      return { groups: formatted };
    }

    if (endpoint.startsWith('/groups/') && !endpoint.includes('/messages')) {
      const grpId = endpoint.split('/')[2];
      const user = auth.getUser();
      const { data: group } = await supabase
        .from('study_groups')
        .select(`*, creator:profiles(name, username, avatar_color), course:courses(code, name)`)
        .eq('id', grpId)
        .single();

      const { data: members } = await supabase
        .from('study_group_members')
        .select('role, profile:profiles(id, name, username, avatar_color, bio)')
        .eq('group_id', grpId);

      const isMember = user && members ? members.some(m => m.profile?.id === user.id) : false;

      return {
        group: {
          ...group,
          creator_name: group.creator?.name,
          creator_username: group.creator?.username,
          course_code: group.course?.code,
          course_name: group.course?.name,
          is_member: isMember,
          members: members ? members.map(m => ({ ...m.profile, role: m.role })) : []
        }
      };
    }

    // Study Group Messages
    if (endpoint.startsWith('/groups/') && endpoint.endsWith('/messages')) {
      const grpId = endpoint.split('/')[2];
      const { data } = await supabase
        .from('study_group_messages')
        .select(`*, sender:profiles(name, username, avatar_color)`)
        .eq('group_id', grpId)
        .order('created_at', { ascending: true });

      const formatted = (data || []).map(m => ({
        ...m,
        sender_name: m.sender?.name,
        sender_username: m.sender?.username,
        sender_avatar_color: m.sender?.avatar_color
      }));
      return { messages: formatted };
    }

    // Notifications
    if (endpoint === '/notifications') {
      const user = auth.getUser();
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(40);
      return { notifications: data || [], unread_count: 0 };
    }

    // Global Search
    if (endpoint === '/search') {
      const query = params.q || '';
      const { data: discussions } = await supabase.from('discussions').select('id, title, body, category, created_at').ilike('title', `%${query}%`).limit(10);
      const { data: courses } = await supabase.from('courses').select('id, code, name, description').ilike('name', `%${query}%`).limit(10);
      const { data: communities } = await supabase.from('communities').select('*').ilike('name', `%${query}%`).limit(10);
      const { data: groups } = await supabase.from('study_groups').select('*').ilike('name', `%${query}%`).limit(10);
      const { data: users } = await supabase.from('profiles').select('id, name, username, avatar_color, bio').ilike('name', `%${query}%`).limit(10);

      const total = (discussions?.length || 0) + (courses?.length || 0) + (communities?.length || 0) + (groups?.length || 0) + (users?.length || 0);
      return { discussions: discussions || [], courses: courses || [], communities: communities || [], groups: groups || [], users: users || [], total_count: total };
    }

    // Public Profile
    if (endpoint.startsWith('/users/profile/')) {
      const username = endpoint.split('/')[3];
      const { data: user } = await supabase
        .from('profiles')
        .select(`*, institution:institutions(name), faculty:faculties(name), program:programs(name)`)
        .eq('username', username)
        .single();

      if (!user) throw new Error('User not found.');

      user.institution_name = user.institution?.name;
      user.faculty_name = user.faculty?.name;
      user.program_name = user.program?.name;
      user.stats = { discussions_count: 0, comments_count: 0, groups_count: 0, upvotes_received: 0 };

      return { user };
    }

    // User discussions
    if (endpoint.startsWith('/users/') && endpoint.endsWith('/discussions')) {
      const userId = endpoint.split('/')[2];
      const { data } = await supabase.from('discussions').select('*').eq('author_id', userId).eq('is_anonymous', false).order('created_at', { ascending: false });
      return { discussions: data || [] };
    }

    // User activity
    if (endpoint.startsWith('/users/') && endpoint.endsWith('/activity')) {
      const userId = endpoint.split('/')[2];
      const { data } = await supabase.from('user_activity').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
      return { activity: data || [] };
    }

    // Admin Reports & Metrics
    if (endpoint === '/admin/reports') {
      const { data } = await supabase.from('reports').select('*').eq('status', params.status || 'pending');
      return { reports: data || [] };
    }
    if (endpoint === '/admin/metrics') {
      return { metrics: { total_students: 0, total_discussions: 0, total_courses: 0, total_groups: 0, pending_reports: 0 } };
    }

    throw new Error(`Unsupported GET endpoint: ${endpoint}`);
  }

  async put(endpoint, body = {}) {
    const user = auth.getUser();
    if (endpoint === '/auth/profile') {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          name: body.name?.trim(),
          username: body.username?.trim(),
          bio: body.bio?.trim(),
          avatar_color: body.avatar_color
        })
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { user: data, message: 'Profile updated!' };
    }

    if (endpoint === '/auth/academic') {
      const { error } = await supabase
        .from('profiles')
        .update({
          institution_id: body.institution_id || null,
          faculty_id: body.faculty_id || null,
          program_id: body.program_id || null,
          academic_year: body.academic_year || 'Year 1'
        })
        .eq('id', user.id);

      if (error) throw new Error(error.message);

      // Sync enrolled courses
      if (Array.isArray(body.course_ids)) {
        await supabase.from('user_courses').delete().eq('user_id', user.id);
        if (body.course_ids.length > 0) {
          const rows = body.course_ids.map(cid => ({ user_id: user.id, course_id: cid }));
          await supabase.from('user_courses').insert(rows);
        }
      }
      return { message: 'Academic identity saved.' };
    }

    if (endpoint === '/auth/settings') {
      await supabase.from('profiles').update({ settings: body }).eq('id', user.id);
      return { message: 'Settings saved' };
    }

    if (endpoint === '/auth/password') {
      const { error } = await supabase.auth.updateUser({ password: body.new_password });
      if (error) throw new Error(error.message);
      return { message: 'Password updated successfully!' };
    }

    if (endpoint.startsWith('/notifications/') && endpoint.endsWith('/read')) {
      const notifId = endpoint.split('/')[2];
      await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
      return { message: 'Read' };
    }

    if (endpoint === '/notifications/mark-all-read') {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
      return { message: 'All read' };
    }

    throw new Error(`Unsupported PUT endpoint: ${endpoint}`);
  }

  async delete(endpoint) {
    const user = auth.getUser();
    if (endpoint.startsWith('/academic/courses/') && endpoint.endsWith('/enroll')) {
      const courseId = endpoint.split('/')[3];
      await supabase.from('user_courses').delete().eq('user_id', user.id).eq('course_id', courseId);
      return { message: 'Dropped course' };
    }

    if (endpoint.startsWith('/discussions/')) {
      const discId = endpoint.split('/')[2];
      await supabase.from('discussions').delete().eq('id', discId);
      return { message: 'Discussion deleted' };
    }

    if (endpoint.startsWith('/comments/')) {
      const commentId = endpoint.split('/')[2];
      await supabase.from('comments').delete().eq('id', commentId);
      return { message: 'Comment deleted' };
    }

    if (endpoint.startsWith('/groups/') && endpoint.endsWith('/join')) {
      const grpId = endpoint.split('/')[2];
      await supabase.from('study_group_members').delete().eq('group_id', grpId).eq('user_id', user.id);
      return { message: 'Left group' };
    }

    if (endpoint.startsWith('/communities/') && endpoint.endsWith('/join')) {
      const commId = endpoint.split('/')[2];
      await supabase.from('community_members').delete().eq('community_id', commId).eq('user_id', user.id);
      return { message: 'Left community' };
    }

    if (endpoint === '/auth/account') {
      await supabase.from('profiles').delete().eq('id', user.id);
      await supabase.auth.signOut();
      return { message: 'Account deleted' };
    }

    throw new Error(`Unsupported DELETE endpoint: ${endpoint}`);
  }

  async upload(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, file);

    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    return { url: publicUrl, name: file.name, size: file.size };
  }
}

export const api = new ApiClient();
