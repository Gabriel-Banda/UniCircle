import express from 'express';
import { randomUUID } from 'crypto';
import db from '../database/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { logActivity } from '../utils/sse.js';

const router = express.Router();

// LIST COMMUNITIES (Optionally filter by level or search)
router.get('/', optionalAuth, (req, res) => {
  const { level, q } = req.query;
  const currentUserId = req.user ? req.user.id : null;

  let whereClauses = [];
  let params = [];

  if (level) {
    whereClauses.push('c.level = ?');
    params.push(level);
  }
  if (q) {
    whereClauses.push('(c.name LIKE ? OR c.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT c.*,
           (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) as members_count,
           (SELECT COUNT(*) FROM discussions d WHERE d.community_id = c.id) as discussions_count,
           ${currentUserId ? `(SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = '${currentUserId}')` : '0'} as is_member
    FROM communities c
    ${whereSql}
    ORDER BY members_count DESC, c.name ASC
  `;

  const communities = db.prepare(sql).all(...params).map(c => ({
    ...c,
    is_member: !!c.is_member
  }));

  res.json({ communities });
});

// GET USER'S JOINED COMMUNITIES
router.get('/my', requireAuth, (req, res) => {
  const userId = req.user.id;
  const communities = db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) as members_count,
           (SELECT COUNT(*) FROM discussions d WHERE d.community_id = c.id) as discussions_count,
           1 as is_member
    FROM communities c
    JOIN community_members cm ON c.id = cm.community_id
    WHERE cm.user_id = ?
    ORDER BY cm.joined_at DESC
  `).all(userId).map(c => ({
    ...c,
    is_member: true
  }));

  res.json({ communities });
});

// GET SINGLE COMMUNITY DETAILS
router.get('/:id', optionalAuth, (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user ? req.user.id : null;

  const community = db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) as members_count,
           (SELECT COUNT(*) FROM discussions d WHERE d.community_id = c.id) as discussions_count,
           ${currentUserId ? `(SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = '${currentUserId}')` : '0'} as is_member
  `).get(id);

  if (!community) {
    return res.status(404).json({ error: 'Community not found.' });
  }

  community.is_member = !!community.is_member;

  // Get recent active members
  community.members = db.prepare(`
    SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_url, cm.role, cm.joined_at
    FROM community_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.community_id = ? AND u.is_banned = 0
    ORDER BY cm.joined_at DESC
    LIMIT 12
  `).all(id);

  res.json({ community });
});

// JOIN COMMUNITY
router.post('/:id/join', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const community = db.prepare('SELECT name FROM communities WHERE id = ?').get(id);
  if (!community) {
    return res.status(404).json({ error: 'Community not found.' });
  }

  db.prepare('INSERT OR IGNORE INTO community_members (user_id, community_id, role, joined_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
    .run(userId, id, 'member');

  logActivity({
    userId,
    actionType: 'joined_community',
    title: `Joined community`,
    description: community.name,
    link: `/pages/community.html?id=${id}`
  });

  const membersCount = db.prepare('SELECT COUNT(*) as count FROM community_members WHERE community_id = ?').get(id).count;
  res.json({ message: `Joined ${community.name}`, is_member: true, members_count: membersCount });
});

// LEAVE COMMUNITY
router.delete('/:id/join', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  db.prepare('DELETE FROM community_members WHERE user_id = ? AND community_id = ?').run(userId, id);
  const membersCount = db.prepare('SELECT COUNT(*) as count FROM community_members WHERE community_id = ?').get(id).count;

  res.json({ message: 'Left community', is_member: false, members_count: membersCount });
});

export default router;
