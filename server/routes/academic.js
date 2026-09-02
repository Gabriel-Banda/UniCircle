import express from 'express';
import { randomUUID } from 'crypto';
import db from '../database/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { logActivity } from '../utils/sse.js';

const router = express.Router();

// Helper to auto-create community for an academic level
function ensureCommunity(level, refId, name, description = '', icon = '🎓', coverColor = '#4f46e5', createdBy = null) {
  let comm = db.prepare('SELECT * FROM communities WHERE level = ? AND ref_id = ?').get(level, refId);
  if (!comm) {
    const commId = 'comm_' + randomUUID();
    db.prepare(`
      INSERT INTO communities (id, level, ref_id, name, description, icon, cover_color, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(commId, level, refId, name, description, icon, coverColor, createdBy);
    comm = db.prepare('SELECT * FROM communities WHERE id = ?').get(commId);
  }
  return comm;
}

// ---------------- INSTITUTIONS ----------------
// Search or list institutions
router.get('/institutions', optionalAuth, (req, res) => {
  const query = (req.query.q || '').trim();
  let institutions;
  if (query) {
    institutions = db.prepare(`
      SELECT i.*, 
             (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id) as student_count,
             (SELECT COUNT(*) FROM faculties f WHERE f.institution_id = i.id) as faculty_count
      FROM institutions i
      WHERE i.name LIKE ? OR i.short_code LIKE ?
      ORDER BY student_count DESC, i.name ASC
    `).all(`%${query}%`, `%${query}%`);
  } else {
    institutions = db.prepare(`
      SELECT i.*, 
             (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id) as student_count,
             (SELECT COUNT(*) FROM faculties f WHERE f.institution_id = i.id) as faculty_count
      FROM institutions i
      ORDER BY student_count DESC, i.name ASC
    `).all();
  }
  res.json({ institutions });
});

// Create new institution (if student doesn't find their university during onboarding or community creation)
router.post('/institutions', requireAuth, (req, res) => {
  try {
    const { name, short_code, country } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Institution name is required.' });
    }

    const cleanName = name.trim();
    const cleanCode = short_code ? short_code.trim().toUpperCase() : '';

    // Check if exists
    let existing = db.prepare('SELECT * FROM institutions WHERE LOWER(name) = LOWER(?)').get(cleanName);
    if (existing) {
      return res.json({ institution: existing, message: 'Existing institution found.' });
    }

    const instId = 'inst_' + randomUUID();
    db.prepare(`
      INSERT INTO institutions (id, name, short_code, country, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(instId, cleanName, cleanCode, country ? country.trim() : '', req.user.id);

    // Auto-create institution community
    ensureCommunity('institution', instId, cleanName, `Official community for all students at ${cleanName}.`, '🏛️', '#4338CA', req.user.id);

    const institution = db.prepare('SELECT * FROM institutions WHERE id = ?').get(instId);
    res.status(201).json({ institution, message: 'Institution created successfully.' });
  } catch (err) {
    console.error('Create institution error:', err);
    res.status(500).json({ error: 'Failed to create institution.' });
  }
});

// ---------------- FACULTIES ----------------
// Get faculties for an institution
router.get('/institutions/:institutionId/faculties', optionalAuth, (req, res) => {
  const { institutionId } = req.params;
  const faculties = db.prepare(`
    SELECT f.*, 
           (SELECT COUNT(*) FROM users u WHERE u.faculty_id = f.id) as student_count,
           (SELECT COUNT(*) FROM programs p WHERE p.faculty_id = f.id) as program_count
    FROM faculties f
    WHERE f.institution_id = ?
    ORDER BY f.name ASC
  `).all(institutionId);

  res.json({ faculties });
});

// Create new faculty
router.post('/institutions/:institutionId/faculties', requireAuth, (req, res) => {
  try {
    const { institutionId } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Faculty/School name is required.' });
    }

    const cleanName = name.trim();
    const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(institutionId);
    if (!inst) {
      return res.status(404).json({ error: 'Institution not found.' });
    }

    let existing = db.prepare('SELECT * FROM faculties WHERE institution_id = ? AND LOWER(name) = LOWER(?)').get(institutionId, cleanName);
    if (existing) {
      return res.json({ faculty: existing });
    }

    const facId = 'fac_' + randomUUID();
    db.prepare(`
      INSERT INTO faculties (id, institution_id, name, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(facId, institutionId, cleanName);

    // Auto-create faculty community
    ensureCommunity('faculty', facId, `${cleanName} (${inst.short_code || inst.name})`, `Faculty community for ${cleanName} at ${inst.name}.`, '🔬', '#2563EB', req.user.id);

    const faculty = db.prepare('SELECT * FROM faculties WHERE id = ?').get(facId);
    res.status(201).json({ faculty, message: 'Faculty created successfully.' });
  } catch (err) {
    console.error('Create faculty error:', err);
    res.status(500).json({ error: 'Failed to create faculty.' });
  }
});

// ---------------- PROGRAMS ----------------
// Get programs for a faculty
router.get('/faculties/:facultyId/programs', optionalAuth, (req, res) => {
  const { facultyId } = req.params;
  const programs = db.prepare(`
    SELECT p.*, 
           (SELECT COUNT(*) FROM users u WHERE u.program_id = p.id) as student_count,
           (SELECT COUNT(*) FROM courses c WHERE c.program_id = p.id) as course_count
    FROM programs p
    WHERE p.faculty_id = ?
    ORDER BY p.name ASC
  `).all(facultyId);

  res.json({ programs });
});

// Create new program
router.post('/faculties/:facultyId/programs', requireAuth, (req, res) => {
  try {
    const { facultyId } = req.params;
    const { name, degree_type } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Program name is required.' });
    }

    const cleanName = name.trim();
    const faculty = db.prepare('SELECT * FROM faculties WHERE id = ?').get(facultyId);
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found.' });
    }

    let existing = db.prepare('SELECT * FROM programs WHERE faculty_id = ? AND LOWER(name) = LOWER(?)').get(facultyId, cleanName);
    if (existing) {
      return res.json({ program: existing });
    }

    const progId = 'prog_' + randomUUID();
    db.prepare(`
      INSERT INTO programs (id, faculty_id, name, degree_type, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(progId, facultyId, cleanName, degree_type || 'Undergraduate');

    // Auto-create program community
    ensureCommunity('program', progId, cleanName, `Discussions and connections for students studying ${cleanName}.`, '📚', '#7C3AED', req.user.id);

    const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(progId);
    res.status(201).json({ program, message: 'Program created successfully.' });
  } catch (err) {
    console.error('Create program error:', err);
    res.status(500).json({ error: 'Failed to create program.' });
  }
});

// ---------------- COURSES ----------------
// Get courses for a program (optionally filter by academic year)
router.get('/programs/:programId/courses', optionalAuth, (req, res) => {
  const { programId } = req.params;
  const year = req.query.year;

  let courses;
  if (year) {
    courses = db.prepare(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM user_courses uc WHERE uc.course_id = c.id) as student_count,
             (SELECT COUNT(*) FROM discussions d WHERE d.course_id = c.id) as discussion_count
      FROM courses c
      WHERE c.program_id = ? AND c.academic_year = ?
      ORDER BY c.code ASC
    `).all(programId, year);
  } else {
    courses = db.prepare(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM user_courses uc WHERE uc.course_id = c.id) as student_count,
             (SELECT COUNT(*) FROM discussions d WHERE d.course_id = c.id) as discussion_count
      FROM courses c
      WHERE c.program_id = ?
      ORDER BY c.code ASC
    `).all(programId);
  }

  res.json({ courses });
});

// Create new course
router.post('/programs/:programId/courses', requireAuth, (req, res) => {
  try {
    const { programId } = req.params;
    const { code, name, description, academic_year } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Course code and course name are required.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    let existing = db.prepare('SELECT * FROM courses WHERE program_id = ? AND UPPER(code) = ?').get(programId, cleanCode);
    if (existing) {
      return res.json({ course: existing, message: 'Course already exists.' });
    }

    const courseId = 'crs_' + randomUUID();
    db.prepare(`
      INSERT INTO courses (id, program_id, code, name, description, academic_year, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(courseId, programId, cleanCode, cleanName, description ? description.trim() : '', academic_year || 'Year 1');

    // Auto-create course community
    ensureCommunity('course', courseId, `${cleanCode}: ${cleanName}`, description || `Dedicated space for ${cleanCode} students to ask questions, share resources, and study.`, '📖', '#059669', req.user.id);

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    res.status(201).json({ course, message: 'Course created successfully.' });
  } catch (err) {
    console.error('Create course error:', err);
    res.status(500).json({ error: 'Failed to create course.' });
  }
});

// Single Course Details
router.get('/courses/:courseId', optionalAuth, (req, res) => {
  const { courseId } = req.params;
  const course = db.prepare(`
    SELECT c.*, 
           p.name as program_name, p.faculty_id,
           f.name as faculty_name, f.institution_id,
           i.name as institution_name,
           (SELECT COUNT(*) FROM user_courses uc WHERE uc.course_id = c.id) as student_count,
           (SELECT COUNT(*) FROM discussions d WHERE d.course_id = c.id) as discussion_count,
           (SELECT COUNT(*) FROM study_groups g WHERE g.course_id = c.id) as groups_count
    FROM courses c
    JOIN programs p ON c.program_id = p.id
    JOIN faculties f ON p.faculty_id = f.id
    JOIN institutions i ON f.institution_id = i.id
    WHERE c.id = ?
  `).get(courseId);

  if (!course) {
    return res.status(404).json({ error: 'Course not found.' });
  }

  // Check if current user is enrolled
  let isEnrolled = false;
  if (req.user) {
    const enrollment = db.prepare('SELECT * FROM user_courses WHERE user_id = ? AND course_id = ?').get(req.user.id, courseId);
    isEnrolled = !!enrollment;
  }
  course.is_enrolled = isEnrolled;

  res.json({ course });
});

// Enroll / Join a course
router.post('/courses/:courseId/enroll', requireAuth, (req, res) => {
  const { courseId } = req.params;
  const userId = req.user.id;

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) {
    return res.status(404).json({ error: 'Course not found.' });
  }

  db.prepare('INSERT OR IGNORE INTO user_courses (user_id, course_id) VALUES (?, ?)').run(userId, courseId);

  // Add to course community
  const courseComm = db.prepare("SELECT id FROM communities WHERE level = 'course' AND ref_id = ?").get(courseId);
  if (courseComm) {
    db.prepare('INSERT OR IGNORE INTO community_members (user_id, community_id) VALUES (?, ?)').run(userId, courseComm.id);
  }

  logActivity({
    userId,
    actionType: 'joined_course',
    title: `Enrolled in ${course.code}`,
    description: `Joined course space for ${course.name}`,
    link: `/pages/course.html?id=${courseId}`
  });

  res.json({ message: `Successfully enrolled in ${course.code}: ${course.name}` });
});

// Leave / Drop a course
router.delete('/courses/:courseId/enroll', requireAuth, (req, res) => {
  const { courseId } = req.params;
  const userId = req.user.id;

  db.prepare('DELETE FROM user_courses WHERE user_id = ? AND course_id = ?').run(userId, courseId);
  res.json({ message: 'Course removed from your enrolled courses.' });
});

// Get members enrolled in a course
router.get('/courses/:courseId/members', optionalAuth, (req, res) => {
  const { courseId } = req.params;
  const members = db.prepare(`
    SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_url, u.bio, u.academic_year, uc.joined_at
    FROM user_courses uc
    JOIN users u ON uc.user_id = u.id
    WHERE uc.course_id = ? AND u.is_banned = 0
    ORDER BY uc.joined_at DESC
  `).all(courseId);

  res.json({ members });
});

export default router;
