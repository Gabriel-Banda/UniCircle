// Reset database to completely pristine clean state
import db from './database/db.js';

db.exec(`
  DELETE FROM study_group_messages;
  DELETE FROM study_group_members;
  DELETE FROM study_groups;
  DELETE FROM comments;
  DELETE FROM reactions;
  DELETE FROM saved_discussions;
  DELETE FROM notifications;
  DELETE FROM reports;
  DELETE FROM user_activity;
  DELETE FROM discussions;
  DELETE FROM user_courses;
  DELETE FROM community_members;
  DELETE FROM communities;
  DELETE FROM courses;
  DELETE FROM programs;
  DELETE FROM faculties;
  DELETE FROM institutions;
  DELETE FROM users;
`);

console.log('✓ UniCircle database reset to pristine 100% clean state.');
