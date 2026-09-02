import jwt from 'jsonwebtoken';
import db from '../database/db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'unicircle_super_secure_jwt_secret_2026_key!';

// Require user to be authenticated
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`
      SELECT u.id, u.email, u.username, u.name, u.bio, u.avatar_color, u.avatar_url, 
             u.role, u.institution_id, u.faculty_id, u.program_id, u.academic_year, 
             u.is_banned, u.settings_json,
             i.name as institution_name,
             f.name as faculty_name,
             p.name as program_name
      FROM users u
      LEFT JOIN institutions i ON u.institution_id = i.id
      LEFT JOIN faculties f ON u.faculty_id = f.id
      LEFT JOIN programs p ON u.program_id = p.id
      WHERE u.id = ?
    `).get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User account not found or session expired.' });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been suspended by a moderator.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token. Please log in again.' });
  }
}

// Optional auth (allows guest access while attaching req.user if logged in)
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`
      SELECT u.id, u.email, u.username, u.name, u.bio, u.avatar_color, u.avatar_url, 
             u.role, u.institution_id, u.faculty_id, u.program_id, u.academic_year, 
             u.is_banned, u.settings_json,
             i.name as institution_name,
             f.name as faculty_name,
             p.name as program_name
      FROM users u
      LEFT JOIN institutions i ON u.institution_id = i.id
      LEFT JOIN faculties f ON u.faculty_id = f.id
      LEFT JOIN programs p ON u.program_id = p.id
      WHERE u.id = ?
    `).get(decoded.id);

    if (user && !user.is_banned) {
      req.user = user;
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  next();
}

// Require specific role(s)
export function requireRole(allowedRoles = ['admin']) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. You do not have sufficient permissions.' });
    }
    next();
  };
}
