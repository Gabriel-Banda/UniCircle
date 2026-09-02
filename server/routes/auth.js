import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import db from '../database/db.js';
import { requireAuth, JWT_SECRET } from '../middleware/auth.js';
import { logActivity } from '../utils/sse.js';

const router = express.Router();

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// Full user data query helper
function getUserDetails(userId) {
  const user = db.prepare(`
    SELECT u.id, u.email, u.username, u.name, u.bio, u.avatar_color, u.avatar_url, 
           u.role, u.institution_id, u.faculty_id, u.program_id, u.academic_year, 
           u.is_banned, u.settings_json, u.created_at,
           i.name as institution_name,
           f.name as faculty_name,
           p.name as program_name
    FROM users u
    LEFT JOIN institutions i ON u.institution_id = i.id
    LEFT JOIN faculties f ON u.faculty_id = f.id
    LEFT JOIN programs p ON u.program_id = p.id
    WHERE u.id = ?
  `).get(userId);

  if (!user) return null;

  // Parse settings_json
  try {
    user.settings = JSON.parse(user.settings_json || '{}');
  } catch (e) {
    user.settings = {};
  }
  delete user.settings_json;

  // Get enrolled courses
  user.courses = db.prepare(`
    SELECT c.id, c.code, c.name, c.description, c.academic_year, uc.joined_at
    FROM user_courses uc
    JOIN courses c ON uc.course_id = c.id
    WHERE uc.user_id = ?
    ORDER BY c.code ASC
  `).all(userId);

  // Real stats (derived from database only!)
  const stats = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM discussions WHERE author_id = ?) as discussions_count,
      (SELECT COUNT(*) FROM comments WHERE author_id = ?) as comments_count,
      (SELECT COUNT(*) FROM saved_discussions WHERE user_id = ?) as saved_count,
      (SELECT COUNT(*) FROM study_group_members WHERE user_id = ?) as groups_count,
      (SELECT COUNT(*) FROM reactions r JOIN discussions d ON r.target_id = d.id WHERE r.target_type = 'discussion' AND d.author_id = ?) as upvotes_received
  `).get(userId, userId, userId, userId, userId);

  user.stats = stats;
  return user;
}

// AVATAR COLORS PALETTE for fresh registrations
const AVATAR_COLORS = [
  '#4F46E5', '#7C3AED', '#EC4899', '#F43F5E', '#EA580C',
  '#D97706', '#059669', '#0D9488', '#0284C7', '#2563EB'
];

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { email, password, username, name } = req.body;

    if (!email || !password || !username || !name) {
      return res.status(400).json({ error: 'Please provide email, password, username, and full name.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');

    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 alphanumeric characters.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    // Check existing
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existingEmail) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existingUser) {
      return res.status(400).json({ error: 'This username is already taken. Please choose another.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const userId = 'usr_' + randomUUID();
    const avatar_color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    // Initial default settings
    const defaultSettings = JSON.stringify({
      theme: 'dark',
      profile_visible: true,
      allow_anonymous_posts: true,
      email_notifications: false,
      browser_notifications: true
    });

    db.prepare(`
      INSERT INTO users (id, email, password_hash, username, name, avatar_color, settings_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, cleanEmail, password_hash, cleanUsername, name.trim(), avatar_color, defaultSettings);

    logActivity({
      userId,
      actionType: 'account_created',
      title: 'Joined UniCircle',
      description: 'Account registered successfully.',
      link: '/pages/profile.html'
    });

    const user = getUserDetails(userId);
    const token = generateToken(user);

    res.status(201).json({
      message: 'Account created successfully! Welcome to UniCircle.',
      token,
      user
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Please enter your email/username and password.' });
    }

    const cleanLogin = login.trim().toLowerCase();
    const userRow = db.prepare(`
      SELECT * FROM users WHERE email = ? OR username = ?
    `).get(cleanLogin, cleanLogin);

    if (!userRow) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    if (userRow.is_banned) {
      return res.status(403).json({ error: 'This account has been suspended by a moderator.' });
    }

    const isMatch = await bcrypt.compare(password, userRow.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    const user = getUserDetails(userRow.id);
    const token = generateToken(user);

    res.json({
      message: 'Logged in successfully.',
      token,
      user
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in. Please try again.' });
  }
});

// GET CURRENT USER / ME
router.get('/me', requireAuth, (req, res) => {
  const user = getUserDetails(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json({ user });
});

// UPDATE PROFILE (Name, Bio, Avatar color, etc.)
router.put('/profile', requireAuth, (req, res) => {
  try {
    const { name, bio, avatar_color, avatar_url, username } = req.body;
    const userId = req.user.id;

    if (username && username !== req.user.username) {
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUsername, userId);
      if (existing) {
        return res.status(400).json({ error: 'Username is already taken.' });
      }
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(cleanUsername, userId);
    }

    const newName = name !== undefined ? name.trim() : req.user.name;
    const newBio = bio !== undefined ? bio.trim() : req.user.bio;
    const newAvatarColor = avatar_color || req.user.avatar_color;
    const newAvatarUrl = avatar_url !== undefined ? avatar_url.trim() : req.user.avatar_url;

    db.prepare(`
      UPDATE users 
      SET name = ?, bio = ?, avatar_color = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newName, newBio, newAvatarColor, newAvatarUrl, userId);

    const updatedUser = getUserDetails(userId);
    res.json({ message: 'Profile updated successfully.', user: updatedUser });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// UPDATE ACADEMIC IDENTITY (Institution, Faculty, Program, Year, Enrolled Courses)
router.put('/academic', requireAuth, (req, res) => {
  try {
    const { institution_id, faculty_id, program_id, academic_year, course_ids } = req.body;
    const userId = req.user.id;

    db.prepare(`
      UPDATE users 
      SET institution_id = ?, faculty_id = ?, program_id = ?, academic_year = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(institution_id || null, faculty_id || null, program_id || null, academic_year || 'Year 1', userId);

    // Auto-join corresponding academic communities
    if (institution_id) {
      const instComm = db.prepare("SELECT id FROM communities WHERE level = 'institution' AND ref_id = ?").get(institution_id);
      if (instComm) {
        db.prepare('INSERT OR IGNORE INTO community_members (user_id, community_id) VALUES (?, ?)').run(userId, instComm.id);
      }
    }
    if (faculty_id) {
      const facComm = db.prepare("SELECT id FROM communities WHERE level = 'faculty' AND ref_id = ?").get(faculty_id);
      if (facComm) {
        db.prepare('INSERT OR IGNORE INTO community_members (user_id, community_id) VALUES (?, ?)').run(userId, facComm.id);
      }
    }
    if (program_id) {
      const progComm = db.prepare("SELECT id FROM communities WHERE level = 'program' AND ref_id = ?").get(program_id);
      if (progComm) {
        db.prepare('INSERT OR IGNORE INTO community_members (user_id, community_id) VALUES (?, ?)').run(userId, progComm.id);
      }
    }

    // Sync enrolled courses if provided
    if (Array.isArray(course_ids)) {
      db.prepare('DELETE FROM user_courses WHERE user_id = ?').run(userId);
      const insertCourse = db.prepare('INSERT OR IGNORE INTO user_courses (user_id, course_id) VALUES (?, ?)');
      const insertCourseComm = db.prepare('INSERT OR IGNORE INTO community_members (user_id, community_id) VALUES (?, ?)');

      for (const courseId of course_ids) {
        insertCourse.run(userId, courseId);
        // Also add to course community
        const courseComm = db.prepare("SELECT id FROM communities WHERE level = 'course' AND ref_id = ?").get(courseId);
        if (courseComm) {
          insertCourseComm.run(userId, courseComm.id);
        }
      }
    }

    logActivity({
      userId,
      actionType: 'updated_academic_identity',
      title: 'Updated Academic Profile',
      description: 'Configured academic institution and enrolled courses.',
      link: '/pages/profile.html'
    });

    const updatedUser = getUserDetails(userId);
    res.json({ message: 'Academic identity saved successfully.', user: updatedUser });
  } catch (err) {
    console.error('Academic identity update error:', err);
    res.status(500).json({ error: 'Failed to update academic information.' });
  }
});

// UPDATE SETTINGS (Theme, notifications, privacy)
router.put('/settings', requireAuth, (req, res) => {
  try {
    const { theme, profile_visible, allow_anonymous_posts, email_notifications, browser_notifications } = req.body;
    const userId = req.user.id;

    const currentSettings = db.prepare('SELECT settings_json FROM users WHERE id = ?').get(userId);
    let settings = {};
    try {
      settings = JSON.parse(currentSettings.settings_json || '{}');
    } catch (e) {}

    if (theme !== undefined) settings.theme = theme;
    if (profile_visible !== undefined) settings.profile_visible = profile_visible;
    if (allow_anonymous_posts !== undefined) settings.allow_anonymous_posts = allow_anonymous_posts;
    if (email_notifications !== undefined) settings.email_notifications = email_notifications;
    if (browser_notifications !== undefined) settings.browser_notifications = browser_notifications;

    db.prepare('UPDATE users SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(settings), userId);

    const updatedUser = getUserDetails(userId);
    res.json({ message: 'Settings saved successfully.', settings: updatedUser.settings, user: updatedUser });
  } catch (err) {
    console.error('Settings error:', err);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

// CHANGE PASSWORD
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const userRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    const isMatch = await bcrypt.compare(current_password, userRow.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, userId);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// PASSWORD RESET REQUEST (Generates a secure reset token)
router.post('/reset-password-request', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Please enter your email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(cleanEmail);

    if (!user) {
      // Return success message regardless to prevent email enumeration
      return res.json({ message: 'If an account with that email exists, a password reset link has been generated.' });
    }

    const resetToken = randomUUID();
    const expires = Date.now() + 3600000; // 1 hour

    db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?').run(resetToken, expires, user.id);

    res.json({
      message: 'Password reset link generated.',
      resetToken, // Returned for convenient local testing
      resetUrl: `/pages/reset-password.html?token=${resetToken}`
    });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Failed to process password reset request.' });
  }
});

// EXECUTE PASSWORD RESET WITH TOKEN
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const user = db.prepare('SELECT id, reset_expires FROM users WHERE reset_token = ?').get(token);
    if (!user || user.reset_expires < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired password reset link.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newHash, user.id);

    res.json({ message: 'Your password has been successfully reset! You can now log in.' });
  } catch (err) {
    console.error('Password reset execution error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// DELETE ACCOUNT (Danger zone)
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user.id;

    if (!password) {
      return res.status(400).json({ error: 'Please enter your password to confirm account deletion.' });
    }

    const userRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    const isMatch = await bcrypt.compare(password, userRow.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect password.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ message: 'Your account has been permanently deleted.' });
  } catch (err) {
    console.error('Account deletion error:', err);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

export default router;
