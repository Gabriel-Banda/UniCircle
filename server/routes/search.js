import express from 'express';
import db from '../database/db.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// GLOBAL MULTI-ENTITY SEARCH
router.get('/', optionalAuth, (req, res) => {
  const query = (req.query.q || '').trim();
  const type = req.query.type; // 'all', 'discussions', 'courses', 'communities', 'groups', 'users'

  if (!query) {
    return res.json({
      discussions: [],
      courses: [],
      communities: [],
      groups: [],
      users: [],
      total_count: 0
    });
  }

  const searchTerm = `%${query}%`;
  const results = {
    discussions: [],
    courses: [],
    communities: [],
    groups: [],
    users: [],
    total_count: 0
  };

  if (!type || type === 'all' || type === 'discussions') {
    results.discussions = db.prepare(`
      SELECT d.id, d.title, d.body, d.category, d.is_anonymous, d.created_at,
             u.name as author_name, u.username as author_username, u.avatar_color as author_avatar_color,
             c.code as course_code, c.name as course_name,
             (SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id) as upvotes_count,
             (SELECT COUNT(*) FROM comments cm WHERE cm.discussion_id = d.id) as comments_count
      FROM discussions d
      JOIN users u ON d.author_id = u.id
      LEFT JOIN courses c ON d.course_id = c.id
      WHERE d.title LIKE ? OR d.body LIKE ? OR d.category LIKE ? OR d.tags LIKE ?
      ORDER BY d.created_at DESC
      LIMIT 15
    `).all(searchTerm, searchTerm, searchTerm, searchTerm).map(d => {
      if (d.is_anonymous) {
        d.author_name = 'Anonymous Student';
        d.author_username = 'anonymous';
        d.author_avatar_color = '#64748B';
      }
      return d;
    });
  }

  if (!type || type === 'all' || type === 'courses') {
    results.courses = db.prepare(`
      SELECT c.*, p.name as program_name,
             (SELECT COUNT(*) FROM user_courses uc WHERE uc.course_id = c.id) as student_count,
             (SELECT COUNT(*) FROM discussions d WHERE d.course_id = c.id) as discussion_count
      FROM courses c
      JOIN programs p ON c.program_id = p.id
      WHERE c.code LIKE ? OR c.name LIKE ? OR c.description LIKE ?
      ORDER BY student_count DESC, c.code ASC
      LIMIT 10
    `).all(searchTerm, searchTerm, searchTerm);
  }

  if (!type || type === 'all' || type === 'communities') {
    results.communities = db.prepare(`
      SELECT c.*,
             (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) as members_count,
             (SELECT COUNT(*) FROM discussions d WHERE d.community_id = c.id) as discussions_count
      FROM communities c
      WHERE c.name LIKE ? OR c.description LIKE ?
      ORDER BY members_count DESC, c.name ASC
      LIMIT 10
    `).all(searchTerm, searchTerm);
  }

  if (!type || type === 'all' || type === 'groups') {
    results.groups = db.prepare(`
      SELECT g.*, c.code as course_code, c.name as course_name,
             (SELECT COUNT(*) FROM study_group_members sgm WHERE sgm.group_id = g.id) as members_count
      FROM study_groups g
      LEFT JOIN courses c ON g.course_id = c.id
      WHERE g.name LIKE ? OR g.description LIKE ?
      ORDER BY g.created_at DESC
      LIMIT 10
    `).all(searchTerm, searchTerm);
  }

  if (!type || type === 'all' || type === 'users') {
    results.users = db.prepare(`
      SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_url, u.bio, u.academic_year,
             i.name as institution_name,
             p.name as program_name
      FROM users u
      LEFT JOIN institutions i ON u.institution_id = i.id
      LEFT JOIN programs p ON u.program_id = p.id
      WHERE (u.name LIKE ? OR u.username LIKE ? OR u.bio LIKE ?) AND u.is_banned = 0
      LIMIT 10
    `).all(searchTerm, searchTerm, searchTerm);
  }

  results.total_count = (results.discussions.length) + (results.courses.length) + 
                        (results.communities.length) + (results.groups.length) + (results.users.length);

  res.json(results);
});

export default router;
