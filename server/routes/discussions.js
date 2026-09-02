import express from 'express';
import { randomUUID } from 'crypto';
import db from '../database/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { createNotification, logActivity } from '../utils/sse.js';

const router = express.Router();

// Helper to mask anonymous author for normal users
function formatDiscussion(d, currentUserId, userRole) {
  const isAuthor = currentUserId && d.author_id === currentUserId;
  const isPrivileged = userRole === 'admin' || userRole === 'moderator';

  // Parse tags
  let tags = [];
  try {
    tags = JSON.parse(d.tags || '[]');
  } catch (e) {
    tags = [];
  }

  const formatted = {
    id: d.id,
    title: d.title,
    body: d.body,
    category: d.category,
    community_id: d.community_id,
    community_name: d.community_name,
    course_id: d.course_id,
    course_code: d.course_code,
    course_name: d.course_name,
    institution_id: d.institution_id,
    institution_name: d.institution_name,
    faculty_id: d.faculty_id,
    program_id: d.program_id,
    academic_year: d.academic_year,
    tags,
    attachment_url: d.attachment_url,
    attachment_name: d.attachment_name,
    is_pinned: !!d.is_pinned,
    is_locked: !!d.is_locked,
    view_count: d.view_count || 0,
    created_at: d.created_at,
    updated_at: d.updated_at,
    upvotes_count: d.upvotes_count || 0,
    comments_count: d.comments_count || 0,
    is_upvoted: !!d.is_upvoted,
    is_saved: !!d.is_saved,
    is_author: isAuthor
  };

  if (d.is_anonymous) {
    formatted.is_anonymous = true;
    if (isAuthor || isPrivileged) {
      formatted.author = {
        id: d.author_id,
        name: d.author_name + ' (Posted Anonymously)',
        username: d.author_username,
        avatar_color: d.author_avatar_color || '#64748b',
        avatar_url: d.author_avatar_url || ''
      };
    } else {
      formatted.author = {
        id: null,
        name: 'Anonymous Student',
        username: 'anonymous',
        avatar_color: '#64748B',
        avatar_url: ''
      };
    }
  } else {
    formatted.is_anonymous = false;
    formatted.author = {
      id: d.author_id,
      name: d.author_name || 'Student',
      username: d.author_username || 'student',
      avatar_color: d.author_avatar_color || '#4F46E5',
      avatar_url: d.author_avatar_url || ''
    };
  }

  return formatted;
}

// LIST / FILTER DISCUSSIONS
router.get('/', optionalAuth, (req, res) => {
  const currentUserId = req.user ? req.user.id : null;
  const userRole = req.user ? req.user.role : null;

  const {
    category,
    course_id,
    community_id,
    institution_id,
    tag,
    author_id,
    saved_only,
    sort = 'recent', // 'recent', 'popular', 'unanswered'
    limit = 30,
    offset = 0
  } = req.query;

  let whereClauses = [];
  let params = [];

  if (category && category !== 'All') {
    whereClauses.push('d.category = ?');
    params.push(category);
  }
  if (course_id) {
    whereClauses.push('d.course_id = ?');
    params.push(course_id);
  }
  if (community_id) {
    whereClauses.push('d.community_id = ?');
    params.push(community_id);
  }
  if (institution_id) {
    whereClauses.push('d.institution_id = ?');
    params.push(institution_id);
  }
  if (author_id) {
    whereClauses.push('d.author_id = ?');
    params.push(author_id);
  }
  if (tag) {
    whereClauses.push('d.tags LIKE ?');
    params.push(`%"${tag}"%`);
  }
  if (saved_only === 'true' && currentUserId) {
    whereClauses.push('d.id IN (SELECT discussion_id FROM saved_discussions WHERE user_id = ?)');
    params.push(currentUserId);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  let orderSql = 'ORDER BY d.is_pinned DESC, d.created_at DESC';
  if (sort === 'popular') {
    orderSql = 'ORDER BY upvotes_count DESC, d.created_at DESC';
  } else if (sort === 'unanswered') {
    orderSql = 'ORDER BY comments_count ASC, d.created_at DESC';
  }

  const sql = `
    SELECT d.*, 
           u.name as author_name, u.username as author_username, u.avatar_color as author_avatar_color, u.avatar_url as author_avatar_url,
           c.code as course_code, c.name as course_name,
           comm.name as community_name,
           inst.name as institution_name,
           (SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id) as upvotes_count,
           (SELECT COUNT(*) FROM comments cm WHERE cm.discussion_id = d.id) as comments_count,
           ${currentUserId ? `(SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id AND r.user_id = '${currentUserId}')` : '0'} as is_upvoted,
           ${currentUserId ? `(SELECT COUNT(*) FROM saved_discussions sd WHERE sd.discussion_id = d.id AND sd.user_id = '${currentUserId}')` : '0'} as is_saved
    FROM discussions d
    JOIN users u ON d.author_id = u.id
    LEFT JOIN courses c ON d.course_id = c.id
    LEFT JOIN communities comm ON d.community_id = comm.id
    LEFT JOIN institutions inst ON d.institution_id = inst.id
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `;

  params.push(Number(limit), Number(offset));

  const rows = db.prepare(sql).all(...params);
  const discussions = rows.map((r) => formatDiscussion(r, currentUserId, userRole));

  res.json({ discussions, total: discussions.length });
});

// CREATE DISCUSSION
router.post('/', requireAuth, (req, res) => {
  try {
    const {
      title,
      body,
      category = 'General',
      community_id,
      course_id,
      is_anonymous = false,
      tags = [],
      attachment_url,
      attachment_name
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Discussion title is required.' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Discussion content body is required.' });
    }

    const discId = 'disc_' + randomUUID();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    const cleanTags = Array.isArray(tags) ? JSON.stringify(tags.map(t => t.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')).filter(Boolean)) : '[]';

    // Auto-resolve academic context from course or user profile
    let institutionId = req.user.institution_id;
    let facultyId = req.user.faculty_id;
    let programId = req.user.program_id;
    let academicYear = req.user.academic_year;

    if (course_id) {
      const crs = db.prepare(`
        SELECT c.*, p.faculty_id, f.institution_id 
        FROM courses c
        JOIN programs p ON c.program_id = p.id
        JOIN faculties f ON p.faculty_id = f.id
        WHERE c.id = ?
      `).get(course_id);
      if (crs) {
        programId = crs.program_id;
        facultyId = crs.faculty_id;
        institutionId = crs.institution_id;
        academicYear = crs.academic_year;
      }
    }

    db.prepare(`
      INSERT INTO discussions (
        id, title, body, category, community_id, course_id, institution_id, faculty_id, program_id, academic_year,
        author_id, is_anonymous, tags, attachment_url, attachment_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      discId, cleanTitle, cleanBody, category,
      community_id || null, course_id || null, institutionId || null, facultyId || null, programId || null, academicYear || null,
      req.user.id, is_anonymous ? 1 : 0, cleanTags, attachment_url || null, attachment_name || null
    );

    logActivity({
      userId: req.user.id,
      actionType: 'create_discussion',
      title: `Created discussion "${cleanTitle}"`,
      description: `Category: ${category}`,
      link: `/pages/discussion.html?id=${discId}`
    });

    const discussionRow = db.prepare(`
      SELECT d.*, 
             u.name as author_name, u.username as author_username, u.avatar_color as author_avatar_color, u.avatar_url as author_avatar_url,
             c.code as course_code, c.name as course_name,
             comm.name as community_name,
             inst.name as institution_name,
             0 as upvotes_count, 0 as comments_count, 0 as is_upvoted, 0 as is_saved
      FROM discussions d
      JOIN users u ON d.author_id = u.id
      LEFT JOIN courses c ON d.course_id = c.id
      LEFT JOIN communities comm ON d.community_id = comm.id
      LEFT JOIN institutions inst ON d.institution_id = inst.id
      WHERE d.id = ?
    `).get(discId);

    const formatted = formatDiscussion(discussionRow, req.user.id, req.user.role);
    res.status(201).json({ discussion: formatted, message: 'Discussion posted successfully!' });
  } catch (err) {
    console.error('Create discussion error:', err);
    res.status(500).json({ error: 'Failed to create discussion.' });
  }
});

// SINGLE DISCUSSION DETAILS
router.get('/:id', optionalAuth, (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user ? req.user.id : null;
  const userRole = req.user ? req.user.role : null;

  // Increment view counter
  db.prepare('UPDATE discussions SET view_count = view_count + 1 WHERE id = ?').run(id);

  const row = db.prepare(`
    SELECT d.*, 
           u.name as author_name, u.username as author_username, u.avatar_color as author_avatar_color, u.avatar_url as author_avatar_url,
           c.code as course_code, c.name as course_name,
           comm.name as community_name,
           inst.name as institution_name,
           (SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id) as upvotes_count,
           (SELECT COUNT(*) FROM comments cm WHERE cm.discussion_id = d.id) as comments_count,
           ${currentUserId ? `(SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'discussion' AND r.target_id = d.id AND r.user_id = '${currentUserId}')` : '0'} as is_upvoted,
           ${currentUserId ? `(SELECT COUNT(*) FROM saved_discussions sd WHERE sd.discussion_id = d.id AND sd.user_id = '${currentUserId}')` : '0'} as is_saved
    FROM discussions d
    JOIN users u ON d.author_id = u.id
    LEFT JOIN courses c ON d.course_id = c.id
    LEFT JOIN communities comm ON d.community_id = comm.id
    LEFT JOIN institutions inst ON d.institution_id = inst.id
    WHERE d.id = ?
  `).get(id);

  if (!row) {
    return res.status(404).json({ error: 'Discussion not found or has been removed.' });
  }

  const discussion = formatDiscussion(row, currentUserId, userRole);
  res.json({ discussion });
});

// EDIT DISCUSSION
router.put('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, body, category, tags } = req.body;

    const row = db.prepare('SELECT * FROM discussions WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Discussion not found.' });
    }

    if (row.author_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: 'You do not have permission to edit this discussion.' });
    }

    const cleanTitle = title !== undefined ? title.trim() : row.title;
    const cleanBody = body !== undefined ? body.trim() : row.body;
    const cleanCategory = category || row.category;
    const cleanTags = tags !== undefined ? JSON.stringify(tags) : row.tags;

    db.prepare(`
      UPDATE discussions 
      SET title = ?, body = ?, category = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(cleanTitle, cleanBody, cleanCategory, cleanTags, id);

    res.json({ message: 'Discussion updated successfully.' });
  } catch (err) {
    console.error('Edit discussion error:', err);
    res.status(500).json({ error: 'Failed to update discussion.' });
  }
});

// DELETE DISCUSSION
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM discussions WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Discussion not found.' });
    }

    if (row.author_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: 'You do not have permission to delete this discussion.' });
    }

    db.prepare('DELETE FROM discussions WHERE id = ?').run(id);
    res.json({ message: 'Discussion deleted permanently.' });
  } catch (err) {
    console.error('Delete discussion error:', err);
    res.status(500).json({ error: 'Failed to delete discussion.' });
  }
});

// UPVOTE / REACTION TOGGLE
router.post('/:id/upvote', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const discussion = db.prepare('SELECT author_id, title FROM discussions WHERE id = ?').get(id);
    if (!discussion) {
      return res.status(404).json({ error: 'Discussion not found.' });
    }

    const existing = db.prepare(`
      SELECT id FROM reactions 
      WHERE target_type = 'discussion' AND target_id = ? AND user_id = ?
    `).get(id, userId);

    let isUpvoted = false;
    if (existing) {
      db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
      isUpvoted = false;
    } else {
      const reactionId = 'react_' + randomUUID();
      db.prepare(`
        INSERT INTO reactions (id, target_type, target_id, user_id, reaction_type, created_at)
        VALUES (?, 'discussion', ?, ?, 'upvote', CURRENT_TIMESTAMP)
      `).run(reactionId, id, userId);
      isUpvoted = true;

      // Notify author
      createNotification({
        userId: discussion.author_id,
        senderId: userId,
        type: 'upvote',
        title: 'Upvote received',
        message: `${req.user.name} upvoted your discussion "${discussion.title}".`,
        link: `/pages/discussion.html?id=${id}`
      });

      logActivity({
        userId,
        actionType: 'upvote',
        title: `Upvoted discussion`,
        description: discussion.title,
        link: `/pages/discussion.html?id=${id}`
      });
    }

    const upvotesCount = db.prepare("SELECT COUNT(*) as count FROM reactions WHERE target_type = 'discussion' AND target_id = ?").get(id).count;

    res.json({ is_upvoted: isUpvoted, upvotes_count: upvotesCount });
  } catch (err) {
    console.error('Upvote error:', err);
    res.status(500).json({ error: 'Failed to toggle upvote.' });
  }
});

// SAVE / BOOKMARK TOGGLE
router.post('/:id/save', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = db.prepare('SELECT * FROM saved_discussions WHERE user_id = ? AND discussion_id = ?').get(userId, id);
    let isSaved = false;

    if (existing) {
      db.prepare('DELETE FROM saved_discussions WHERE user_id = ? AND discussion_id = ?').run(userId, id);
      isSaved = false;
    } else {
      db.prepare('INSERT INTO saved_discussions (user_id, discussion_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(userId, id);
      isSaved = true;

      logActivity({
        userId,
        actionType: 'save_discussion',
        title: `Bookmarked a discussion`,
        link: `/pages/discussion.html?id=${id}`
      });
    }

    res.json({ is_saved: isSaved, message: isSaved ? 'Discussion saved to your bookmarks.' : 'Discussion removed from bookmarks.' });
  } catch (err) {
    console.error('Save discussion error:', err);
    res.status(500).json({ error: 'Failed to toggle save.' });
  }
});

export default router;
