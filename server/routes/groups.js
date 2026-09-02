import express from 'express';
import { randomUUID } from 'crypto';
import db from '../database/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { createNotification, logActivity } from '../utils/sse.js';

const router = express.Router();

// LIST STUDY GROUPS
router.get('/', optionalAuth, (req, res) => {
  const currentUserId = req.user ? req.user.id : null;
  const { course_id, institution_id, program_id, my_groups } = req.query;

  let whereClauses = [];
  let params = [];

  if (course_id) {
    whereClauses.push('g.course_id = ?');
    params.push(course_id);
  }
  if (institution_id) {
    whereClauses.push('g.institution_id = ?');
    params.push(institution_id);
  }
  if (program_id) {
    whereClauses.push('g.program_id = ?');
    params.push(program_id);
  }
  if (my_groups === 'true' && currentUserId) {
    whereClauses.push('g.id IN (SELECT group_id FROM study_group_members WHERE user_id = ?)');
    params.push(currentUserId);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT g.*,
           c.code as course_code, c.name as course_name,
           u.name as creator_name, u.username as creator_username, u.avatar_color as creator_avatar_color,
           (SELECT COUNT(*) FROM study_group_members sgm WHERE sgm.group_id = g.id) as members_count,
           (SELECT COUNT(*) FROM study_group_messages sgmsg WHERE sgmsg.group_id = g.id) as messages_count,
           ${currentUserId ? `(SELECT COUNT(*) FROM study_group_members sgm WHERE sgm.group_id = g.id AND sgm.user_id = '${currentUserId}')` : '0'} as is_member
    FROM study_groups g
    JOIN users u ON g.creator_id = u.id
    LEFT JOIN courses c ON g.course_id = c.id
    ${whereSql}
    ORDER BY g.created_at DESC
  `;

  const groups = db.prepare(sql).all(...params).map(g => ({
    ...g,
    is_member: !!g.is_member
  }));

  res.json({ groups });
});

// CREATE STUDY GROUP
router.post('/', requireAuth, (req, res) => {
  try {
    const { name, description, course_id, max_members = 20, is_private = false } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Study group name is required.' });
    }

    const groupId = 'grp_' + randomUUID();
    const cleanName = name.trim();

    let institutionId = req.user.institution_id;
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
        institutionId = crs.institution_id;
        academicYear = crs.academic_year;
      }
    }

    db.prepare(`
      INSERT INTO study_groups (
        id, name, description, course_id, institution_id, program_id, academic_year, creator_id, max_members, is_private, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      groupId, cleanName, description ? description.trim() : '',
      course_id || null, institutionId || null, programId || null, academicYear || null,
      req.user.id, max_members || 20, is_private ? 1 : 0
    );

    // Auto-add creator as admin member
    db.prepare(`
      INSERT INTO study_group_members (group_id, user_id, role, joined_at)
      VALUES (?, ?, 'admin', CURRENT_TIMESTAMP)
    `).run(groupId, req.user.id);

    logActivity({
      userId: req.user.id,
      actionType: 'create_group',
      title: `Created study group "${cleanName}"`,
      description: description || 'New study group formed.',
      link: `/pages/group.html?id=${groupId}`
    });

    const group = db.prepare(`
      SELECT g.*, 
             c.code as course_code, c.name as course_name,
             u.name as creator_name, u.username as creator_username, u.avatar_color as creator_avatar_color,
             1 as members_count, 0 as messages_count, 1 as is_member
      FROM study_groups g
      JOIN users u ON g.creator_id = u.id
      LEFT JOIN courses c ON g.course_id = c.id
      WHERE g.id = ?
    `).get(groupId);

    res.status(201).json({ group, message: 'Study group created successfully!' });
  } catch (err) {
    console.error('Create study group error:', err);
    res.status(500).json({ error: 'Failed to create study group.' });
  }
});

// GET SINGLE STUDY GROUP DETAILS
router.get('/:id', optionalAuth, (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user ? req.user.id : null;

  const group = db.prepare(`
    SELECT g.*,
           c.code as course_code, c.name as course_name,
           u.name as creator_name, u.username as creator_username, u.avatar_color as creator_avatar_color,
           (SELECT COUNT(*) FROM study_group_members sgm WHERE sgm.group_id = g.id) as members_count,
           ${currentUserId ? `(SELECT COUNT(*) FROM study_group_members sgm WHERE sgm.group_id = g.id AND sgm.user_id = '${currentUserId}')` : '0'} as is_member
    FROM study_groups g
    JOIN users u ON g.creator_id = u.id
    LEFT JOIN courses c ON g.course_id = c.id
    WHERE g.id = ?
  `).get(id);

  if (!group) {
    return res.status(404).json({ error: 'Study group not found.' });
  }

  group.is_member = !!group.is_member;

  // Get members
  group.members = db.prepare(`
    SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_url, u.bio, sgm.role, sgm.joined_at
    FROM study_group_members sgm
    JOIN users u ON sgm.user_id = u.id
    WHERE sgm.group_id = ? AND u.is_banned = 0
    ORDER BY sgm.joined_at ASC
  `).all(id);

  res.json({ group });
});

// JOIN STUDY GROUP
router.post('/:id/join', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const group = db.prepare('SELECT * FROM study_groups WHERE id = ?').get(id);
  if (!group) {
    return res.status(404).json({ error: 'Study group not found.' });
  }

  const memberCount = db.prepare('SELECT COUNT(*) as count FROM study_group_members WHERE group_id = ?').get(id).count;
  if (memberCount >= group.max_members) {
    return res.status(400).json({ error: 'This study group is already at maximum capacity.' });
  }

  db.prepare('INSERT OR IGNORE INTO study_group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
    .run(id, userId, 'member');

  // Notify creator
  if (group.creator_id !== userId) {
    createNotification({
      userId: group.creator_id,
      senderId: userId,
      type: 'group_join',
      title: 'New study group member',
      message: `${req.user.name} joined your study group "${group.name}".`,
      link: `/pages/group.html?id=${id}`
    });
  }

  logActivity({
    userId,
    actionType: 'join_group',
    title: `Joined study group`,
    description: group.name,
    link: `/pages/group.html?id=${id}`
  });

  res.json({ message: `Joined ${group.name}!`, is_member: true });
});

// LEAVE STUDY GROUP
router.delete('/:id/join', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  db.prepare('DELETE FROM study_group_members WHERE group_id = ? AND user_id = ?').run(id, userId);
  res.json({ message: 'Left study group.', is_member: false });
});

// GET STUDY GROUP MESSAGES / CHAT
router.get('/:id/messages', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  // Verify membership
  const member = db.prepare('SELECT * FROM study_group_members WHERE group_id = ? AND user_id = ?').get(id, userId);
  if (!member && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You must be a member of this study group to read messages.' });
  }

  const messages = db.prepare(`
    SELECT m.*,
           u.name as sender_name, u.username as sender_username, u.avatar_color as sender_avatar_color, u.avatar_url as sender_avatar_url
    FROM study_group_messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.group_id = ?
    ORDER BY m.created_at ASC
    LIMIT 100
  `).all(id);

  res.json({ messages });
});

// POST STUDY GROUP MESSAGE
router.post('/:id/messages', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const member = db.prepare('SELECT * FROM study_group_members WHERE group_id = ? AND user_id = ?').get(id, userId);
    if (!member && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You must join this study group to send messages.' });
    }

    const msgId = 'msg_' + randomUUID();
    const cleanMsg = message.trim();

    db.prepare(`
      INSERT INTO study_group_messages (id, group_id, sender_id, message, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(msgId, id, userId, cleanMsg);

    const fullMsg = db.prepare(`
      SELECT m.*,
             u.name as sender_name, u.username as sender_username, u.avatar_color as sender_avatar_color, u.avatar_url as sender_avatar_url
      FROM study_group_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(msgId);

    res.status(201).json({ message: fullMsg });
  } catch (err) {
    console.error('Group message error:', err);
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

export default router;
