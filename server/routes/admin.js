import express from 'express';
import { randomUUID } from 'crypto';
import db from '../database/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// SUBMIT REPORT (Any authenticated student can report inappropriate content)
router.post('/reports', requireAuth, (req, res) => {
  try {
    const { target_type, target_id, reason, details } = req.body;

    if (!target_type || !target_id || !reason) {
      return res.status(400).json({ error: 'Target type, target ID, and reason are required.' });
    }

    const reportId = 'rep_' + randomUUID();
    db.prepare(`
      INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `).run(reportId, req.user.id, target_type, target_id, reason, details ? details.trim() : '');

    res.status(201).json({ message: 'Thank you. The content has been flagged for our moderation team.' });
  } catch (err) {
    console.error('Report submission error:', err);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

// GET MODERATION QUEUE (Admins & Moderators only)
router.get('/reports', requireAuth, requireRole(['admin', 'moderator']), (req, res) => {
  const { status = 'pending' } = req.query;

  const reports = db.prepare(`
    SELECT r.*,
           u.name as reporter_name, u.username as reporter_username
    FROM reports r
    JOIN users u ON r.reporter_id = u.id
    WHERE r.status = ?
    ORDER BY r.created_at DESC
  `).all(status);

  // Fetch contextual preview for each report target
  const populatedReports = reports.map((report) => {
    let targetPreview = null;
    if (report.target_type === 'discussion') {
      targetPreview = db.prepare('SELECT id, title, body, author_id FROM discussions WHERE id = ?').get(report.target_id);
    } else if (report.target_type === 'comment') {
      targetPreview = db.prepare('SELECT id, body, author_id, discussion_id FROM comments WHERE id = ?').get(report.target_id);
    } else if (report.target_type === 'user') {
      targetPreview = db.prepare('SELECT id, name, username, bio, is_banned FROM users WHERE id = ?').get(report.target_id);
    }
    return { ...report, target_preview: targetPreview };
  });

  res.json({ reports: populatedReports });
});

// RESOLVE OR DISMISS REPORT
router.put('/reports/:id', requireAuth, requireRole(['admin', 'moderator']), (req, res) => {
  try {
    const { id } = req.params;
    const { status, action_taken } = req.body;

    if (!['pending', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    db.prepare(`
      UPDATE reports 
      SET status = ?, action_taken = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, action_taken || '', id);

    res.json({ message: `Report status updated to ${status}.` });
  } catch (err) {
    console.error('Update report error:', err);
    res.status(500).json({ error: 'Failed to update report.' });
  }
});

// BAN OR UNBAN USER
router.post('/users/:id/ban', requireAuth, requireRole(['admin', 'moderator']), (req, res) => {
  try {
    const { id } = req.params;
    const { is_banned = true } = req.body;

    db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(is_banned ? 1 : 0, id);

    res.json({ message: `User account has been ${is_banned ? 'suspended' : 'reinstated'}.` });
  } catch (err) {
    console.error('Ban user error:', err);
    res.status(500).json({ error: 'Failed to change user status.' });
  }
});

// GET PLATFORM OVERVIEW METRICS (Admin only)
router.get('/metrics', requireAuth, requireRole(['admin']), (req, res) => {
  const metrics = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM users WHERE is_banned = 0) as total_students,
      (SELECT COUNT(*) FROM institutions) as total_institutions,
      (SELECT COUNT(*) FROM faculties) as total_faculties,
      (SELECT COUNT(*) FROM programs) as total_programs,
      (SELECT COUNT(*) FROM courses) as total_courses,
      (SELECT COUNT(*) FROM discussions) as total_discussions,
      (SELECT COUNT(*) FROM comments) as total_comments,
      (SELECT COUNT(*) FROM study_groups) as total_groups,
      (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports
  `).get();

  res.json({ metrics });
});

export default router;
