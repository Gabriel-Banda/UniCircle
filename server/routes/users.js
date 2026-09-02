import express from 'express';
import db from '../database/db.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// GET PUBLIC STUDENT PROFILE
router.get('/profile/:username', optionalAuth, (req, res) => {
  const { username } = req.params;
  const cleanUsername = username.trim().toLowerCase();

  const user = db.prepare(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar_color, u.avatar_url, 
           u.role, u.academic_year, u.created_at,
           i.name as institution_name,
           f.name as faculty_name,
           p.name as program_name
    FROM users u
    LEFT JOIN institutions i ON u.institution_id = i.id
    LEFT JOIN faculties f ON u.faculty_id = f.id
    LEFT JOIN programs p ON u.program_id = p.id
    WHERE LOWER(u.username) = ? AND u.is_banned = 0
  `).get(cleanUsername);

  if (!user) {
    return res.status(404).json({ error: 'Student profile not found.' });
  }

  // Get enrolled courses
  user.courses = db.prepare(`
    SELECT c.id, c.code, c.name, c.academic_year
    FROM user_courses uc
    JOIN courses c ON uc.course_id = c.id
    WHERE uc.user_id = ?
    ORDER BY c.code ASC
  `).all(user.id);

  // Real statistics derived purely from SQLite database
  user.stats = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM discussions WHERE author_id = ? AND is_anonymous = 0) as discussions_count,
      (SELECT COUNT(*) FROM comments WHERE author_id = ? AND is_anonymous = 0) as comments_count,
      (SELECT COUNT(*) FROM study_group_members WHERE user_id = ?) as groups_count,
      (SELECT COUNT(*) FROM reactions r JOIN discussions d ON r.target_id = d.id WHERE r.target_type = 'discussion' AND d.author_id = ? AND d.is_anonymous = 0) as upvotes_received
  `).get(user.id, user.id, user.id, user.id);

  res.json({ user });
});

// GET USER'S PUBLIC DISCUSSIONS
router.get('/:id/discussions', optionalAuth, (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user ? req.user.id : null;

  // If requesting own discussions, include own anonymous ones; otherwise hide anonymous posts
  const isSelf = currentUserId === id;
  const whereClause = isSelf 
    ? 'd.author_id = ?' 
    : 'd.author_id = ? AND d.is_anonymous = 0';

  const discussions = db.prepare(`
    SELECT d.*, 
           u.name as author_name, u.username as author_username, u.avatar_color as author_avatar_color, u.avatar_url as author_avatar_url,
           c.code as course_code, c.name as course_name,
           (SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id) as upvotes_count,
           (SELECT COUNT(*) FROM comments cm WHERE cm.discussion_id = d.id) as comments_count
    FROM discussions d
    JOIN users u ON d.author_id = u.id
    LEFT JOIN courses c ON d.course_id = c.id
    WHERE ${whereClause}
    ORDER BY d.created_at DESC
  `).all(id);

  res.json({ discussions });
});

// GET USER'S RECENT ACTIVITY
router.get('/:id/activity', optionalAuth, (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user ? req.user.id : null;

  if (currentUserId !== id && (!req.user || req.user.role !== 'admin')) {
    // Return sanitized public activity
    const activity = db.prepare(`
      SELECT action_type, title, description, link, created_at
      FROM user_activity
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(id);
    return res.json({ activity });
  }

  const activity = db.prepare(`
    SELECT *
    FROM user_activity
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 30
  `).all(id);

  res.json({ activity });
});

export default router;
