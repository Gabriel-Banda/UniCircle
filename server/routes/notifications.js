import express from 'express';
import db from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { addClient } from '../utils/sse.js';

const router = express.Router();

// GET USER NOTIFICATIONS
router.get('/', requireAuth, (req, res) => {
  const userId = req.user.id;
  const { unread_only } = req.query;

  let sql = `
    SELECT n.*,
           u.name as sender_name, u.username as sender_username, u.avatar_color as sender_avatar_color, u.avatar_url as sender_avatar_url
    FROM notifications n
    LEFT JOIN users u ON n.sender_id = u.id
    WHERE n.user_id = ?
  `;

  if (unread_only === 'true') {
    sql += ' AND n.is_read = 0';
  }

  sql += ' ORDER BY n.created_at DESC LIMIT 50';

  const notifications = db.prepare(sql).all(userId);
  const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId).count;

  res.json({ notifications, unread_count: unreadCount });
});

// MARK SINGLE NOTIFICATION AS READ
router.put('/:id/read', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId).count;

  res.json({ message: 'Marked as read', unread_count: unreadCount });
});

// MARK ALL NOTIFICATIONS AS READ
router.put('/mark-all-read', requireAuth, (req, res) => {
  const userId = req.user.id;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  res.json({ message: 'All notifications marked as read', unread_count: 0 });
});

// REAL-TIME SSE STREAM FOR LIVE NOTIFICATIONS
router.get('/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', userId: req.user.id })}\n\n`);

  addClient(req.user.id, res);
});

export default router;
