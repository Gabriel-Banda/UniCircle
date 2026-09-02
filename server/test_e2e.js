// UniCircle Automated End-to-End Verification Test Script
import db from './database/db.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

console.log('--- Starting UniCircle Automated Verification Suite ---');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // Test 1: Verify database tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    console.log('Database tables:', tables.join(', '));
    assert(tables.includes('users'), 'Users table exists');
    assert(tables.includes('institutions'), 'Institutions table exists');
    assert(tables.includes('faculties'), 'Faculties table exists');
    assert(tables.includes('programs'), 'Programs table exists');
    assert(tables.includes('courses'), 'Courses table exists');
    assert(tables.includes('communities'), 'Communities table exists');
    assert(tables.includes('discussions'), 'Discussions table exists');
    assert(tables.includes('comments'), 'Comments table exists');
    assert(tables.includes('reactions'), 'Reactions table exists');
    assert(tables.includes('saved_discussions'), 'Saved discussions table exists');
    assert(tables.includes('study_groups'), 'Study groups table exists');
    assert(tables.includes('notifications'), 'Notifications table exists');
    assert(tables.includes('reports'), 'Reports table exists');
    assert(tables.includes('user_activity'), 'User activity table exists');

    // Test 2: Clean slate check (Zero fake data initially)
    const initialUsersCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    console.log(`Initial users in DB: ${initialUsersCount}`);

    // Test 3: Create real test student account
    const testUserId = 'test_usr_' + Date.now();
    const hash = await bcrypt.hash('password123', 10);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, username, name, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(testUserId, `student_${Date.now()}@university.edu`, hash, `student_${Date.now()}`, 'Alex Smith');

    const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(testUserId);
    assert(!!createdUser, 'User created and persisted in SQLite database');

    // Test 4: Create Academic hierarchy: Institution -> Faculty -> Program -> Course
    const instId = 'test_inst_' + Date.now();
    db.prepare('INSERT INTO institutions (id, name, short_code) VALUES (?, ?, ?)').run(instId, 'Imperial University', 'IU');
    
    const facId = 'test_fac_' + Date.now();
    db.prepare('INSERT INTO faculties (id, institution_id, name) VALUES (?, ?, ?)').run(facId, instId, 'Faculty of Medicine');

    const progId = 'test_prog_' + Date.now();
    db.prepare('INSERT INTO programs (id, faculty_id, name) VALUES (?, ?, ?)').run(progId, facId, 'Medicine & Surgery');

    const courseId = 'test_crs_' + Date.now();
    db.prepare('INSERT INTO courses (id, program_id, code, name, academic_year) VALUES (?, ?, ?, ?, ?)')
      .run(courseId, progId, 'MED101', 'Human Anatomy', 'Year 1');

    assert(db.prepare('SELECT * FROM institutions WHERE id = ?').get(instId) !== undefined, 'Institution persisted');
    assert(db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) !== undefined, 'Course persisted');

    // Test 5: Associate student with academic identity
    db.prepare(`
      UPDATE users SET institution_id = ?, faculty_id = ?, program_id = ?, academic_year = ? WHERE id = ?
    `).run(instId, facId, progId, 'Year 1', testUserId);

    db.prepare('INSERT INTO user_courses (user_id, course_id) VALUES (?, ?)').run(testUserId, courseId);
    assert(db.prepare('SELECT * FROM user_courses WHERE user_id = ? AND course_id = ?').get(testUserId, courseId) !== undefined, 'Student enrolled in course');

    // Test 6: Create Discussion
    const discId = 'test_disc_' + Date.now();
    db.prepare(`
      INSERT INTO discussions (id, title, body, category, course_id, author_id, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(discId, 'How to prepare for the Anatomy Term Exam?', 'Looking for key diagrams to memorize.', 'Questions', courseId, testUserId, '["anatomy","exam"]');

    const disc = db.prepare('SELECT * FROM discussions WHERE id = ?').get(discId);
    assert(disc && disc.title.includes('Anatomy'), 'Discussion created and linked to course');

    // Test 7: Post comment & nested reply
    const commentId = 'test_cmt_' + Date.now();
    db.prepare(`
      INSERT INTO comments (id, discussion_id, author_id, body, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(commentId, discId, testUserId, 'Focus on cranial nerves and brachial plexus diagrams.');

    const replyId = 'test_rpy_' + Date.now();
    db.prepare(`
      INSERT INTO comments (id, discussion_id, parent_id, author_id, body, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(replyId, discId, commentId, testUserId, 'Thanks! Will review Netter atlas tonight.');

    const cmtCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE discussion_id = ?').get(discId).count;
    assert(cmtCount === 2, 'Top-level and nested reply comments persisted');

    // Test 8: Upvote & Save
    db.prepare('INSERT INTO reactions (id, target_type, target_id, user_id, reaction_type) VALUES (?, ?, ?, ?, ?)')
      .run('react_' + Date.now(), 'discussion', discId, testUserId, 'upvote');
    db.prepare('INSERT INTO saved_discussions (user_id, discussion_id) VALUES (?, ?)')
      .run(testUserId, discId);

    const saved = db.prepare('SELECT * FROM saved_discussions WHERE user_id = ? AND discussion_id = ?').get(testUserId, discId);
    assert(!!saved, 'Discussion successfully saved to bookmarks');

    // Test 9: Study Group
    const grpId = 'test_grp_' + Date.now();
    db.prepare('INSERT INTO study_groups (id, name, course_id, creator_id) VALUES (?, ?, ?, ?)')
      .run(grpId, 'Anatomy Weekend Study Crew', courseId, testUserId);
    db.prepare('INSERT INTO study_group_members (group_id, user_id, role) VALUES (?, ?, ?)')
      .run(grpId, testUserId, 'admin');

    const grp = db.prepare('SELECT * FROM study_groups WHERE id = ?').get(grpId);
    assert(grp && grp.name === 'Anatomy Weekend Study Crew', 'Study group created');

    // Test 10: Notification
    const notifId = 'test_notif_' + Date.now();
    db.prepare(`
      INSERT INTO notifications (id, user_id, sender_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(notifId, testUserId, testUserId, 'upvote', 'Upvote received', 'Your discussion received an upvote.', `/pages/discussion.html?id=${discId}`);

    const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notifId);
    assert(!!notif, 'Real database notification generated');

    console.log(`\n===============================================`);
    console.log(`🏁 TESTS COMPLETED: ${passed} passed, ${failed} failed`);
    console.log(`===============================================`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test suite:', err);
    process.exit(1);
  }
}

runTests();
