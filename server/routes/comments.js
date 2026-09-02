import express from 'express';
import { randomUUID } from 'crypto';
import db from '../database/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { createNotification, logActivity } from '../utils/sse.js';

const router = express.Router({ mergeParams: true });

function formatComment(c, currentUserId, userRole) {
  const isAuthor = currentUserId && c.author_id === currentUserId;
  const isPrivileged = userRole === 'admin' || userRole === 'moderator';

  const formatted = {
    id: c.id,
    discussion_id: c.discussion_id,
    parent_id: c.parent_id,
    body: c.body,
    created_at: c.created_at,
    updated_at: c.updated_at,
    upvotes_count: c.upvotes_count || 0,
    is_upvoted: !!c.is_upvoted,
    is_author: isAuthor,
    replies: []
  };

  if (c.is_anonymous) {
    formatted.is_anonymous = true;
    if (isAuthor || isPrivileged) {
      formatted.author = {
        id: c.author_id,
        name: c.author_name + ' (Anonymous)',
        username: c.author_username,
        avatar_color: '#64748B',
        avatar_url: ''
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
      id: c.author_id,
      name: c.author_name || 'Student',
      username: c.author_username || 'student',
      avatar_color: c.author_avatar_color || '#4F46E5',
      avatar_url: c.author_avatar_url || ''
    };
  }

  return formatted;
}

// GET COMMENTS FOR A DISCUSSION (Nested / Threaded)
router.get('/discussions/:discussionId/comments', optionalAuth, (req, res) => {
  const { discussionId } = req.params;
  const currentUserId = req.user ? req.user.id : null;
  const userRole = req.user ? req.user.role : null;

  const rows = db.prepare(`
    SELECT c.*,
           u.name as author_name, u.username as author_username, u.avatar_color as author_avatar_color, u.avatar_url as author_avatar_url,
           (SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'comment' AND r.target_id = c.id) as upvotes_count,
           ${currentUserId ? `(SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'comment' AND r.target_id = c.id AND r.user_id = '${currentUserId}')` : '0'} as is_upvoted
    FROM comments c
    JOIN users u ON c.author_id = u.id
    WHERE c.discussion_id = ?
    ORDER BY c.created_at ASC
  `).all(discussionId);

  const commentsMap = new Map();
  const topLevelComments = [];

  // First pass: format and store in map
  rows.forEach((row) => {
    const formatted = formatComment(row, currentUserId, userRole);
    commentsMap.set(formatted.id, formatted);
  });

  // Second pass: link child comments to parents
  rows.forEach((row) => {
    const item = commentsMap.get(row.id);
    if (row.parent_id && commentsMap.has(row.parent_id)) {
      commentsMap.get(row.parent_id).replies.push(item);
    } else {
      topLevelComments.push(item);
    }
  });

  res.json({ comments: topLevelComments, total: rows.length });
});

// POST A NEW COMMENT / REPLY
router.post('/discussions/:discussionId/comments', requireAuth, (req, res) => {
  try {
    const { discussionId } = req.params;
    const { body, parent_id, is_anonymous } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Comment body cannot be empty.' });
    }

    const discussion = db.prepare('SELECT id, title, author_id FROM discussions WHERE id = ?').get(discussionId);
    if (!discussion) {
      return res.status(404).json({ error: 'Discussion not found.' });
    }

    const commentId = 'cmt_' + randomUUID();
    const cleanBody = body.trim();

    db.prepare(`
      INSERT INTO comments (id, discussion_id, parent_id, author_id, is_anonymous, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(commentId, discussionId, parent_id || null, req.user.id, is_anonymous ? 1 : 0, cleanBody);

    // Notify parent comment author if reply, otherwise notify discussion author
    if (parent_id) {
      const parentComment = db.prepare('SELECT author_id FROM comments WHERE id = ?').get(parent_id);
      if (parentComment && parentComment.author_id !== req.user.id) {
        createNotification({
          userId: parentComment.author_id,
          senderId: is_anonymous ? null : req.user.id,
          type: 'comment_reply',
          title: 'New reply to your comment',
          message: `${is_anonymous ? 'A student' : req.user.name} replied to your comment on "${discussion.title}".`,
          link: `/pages/discussion.html?id=${discussionId}#${commentId}`
        });
      }
    } else if (discussion.author_id !== req.user.id) {
      createNotification({
        userId: discussion.author_id,
        senderId: is_anonymous ? null : req.user.id,
        type: 'discussion_reply',
        title: 'New comment on your discussion',
        message: `${is_anonymous ? 'A student' : req.user.name} commented on "${discussion.title}".`,
        link: `/pages/discussion.html?id=${discussionId}#${commentId}`
      });
    }

    logActivity({
      userId: req.user.id,
      actionType: 'comment',
      title: `Commented on discussion`,
      description: cleanBody.length > 60 ? cleanBody.substring(0, 57) + '...' : cleanBody,
      link: `/pages/discussion.html?id=${discussionId}#${commentId}`
    });

    const newRow = db.prepare(`
      SELECT c.*,
             u.name as author_name, u.username as author_username, u.avatar_color as author_avatar_color, u.avatar_url as author_avatar_url,
             0 as upvotes_count, 0 as is_upvoted
      FROM comments c
      JOIN users u ON c.author_id = u.id
      WHERE c.id = ?
    `).get(commentId);

    const formatted = formatComment(newRow, req.user.id, req.user.role);
    res.status(201).json({ comment: formatted, message: 'Comment added successfully.' });
  } catch (err) {
    console.error('Comment creation error:', err);
    res.status(500).json({ error: 'Failed to post comment.' });
  }
});

// EDIT COMMENT
router.put('/comments/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Comment body cannot be empty.' });
    }

    const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (row.author_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: 'You do not have permission to edit this comment.' });
    }

    db.prepare('UPDATE comments SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(body.trim(), id);

    res.json({ message: 'Comment updated successfully.' });
  } catch (err) {
    console.error('Comment edit error:', err);
    res.status(500).json({ error: 'Failed to update comment.' });
  }
});

// DELETE COMMENT
router.delete('/comments/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (row.author_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: 'You do not have permission to delete this comment.' });
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    res.json({ message: 'Comment deleted.' });
  } catch (err) {
    console.error('Comment delete error:', err);
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

// UPVOTE COMMENT TOGGLE
router.post('/comments/:id/upvote', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = db.prepare(`
      SELECT id FROM reactions 
      WHERE target_type = 'comment' AND target_id = ? AND user_id = ?
    `).get(id, userId);

    let isUpvoted = false;
    if (existing) {
      db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
      isUpvoted = false;
    } else {
      const reactionId = 'react_' + randomUUID();
      db.prepare(`
        INSERT INTO reactions (id, target_type, target_id, user_id, reaction_type, created_at)
        VALUES (?, 'comment', ?, ?, 'upvote', CURRENT_TIMESTAMP)
      `).run(reactionId, id, userId);
      isUpvoted = true;
    }

    const upvotesCount = db.prepare("SELECT COUNT(*) as count FROM reactions WHERE target_type = 'comment' AND target_id = ?").get(id).count;
    res.json({ is_upvoted: isUpvoted, upvotes_count: upvotesCount });
  } catch (err) {
    console.error('Comment upvote error:', err);
    res.status(500).json({ error: 'Failed to toggle upvote.' });
  }
});

export default router;
