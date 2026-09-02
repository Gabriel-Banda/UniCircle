-- UniCircle Relational SQLite Database Schema
PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#4F46E5',
    avatar_url TEXT DEFAULT '',
    role TEXT DEFAULT 'student', -- 'student', 'moderator', 'admin'
    institution_id TEXT,
    faculty_id TEXT,
    program_id TEXT,
    academic_year TEXT DEFAULT '',
    is_banned INTEGER DEFAULT 0,
    reset_token TEXT,
    reset_expires INTEGER,
    settings_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL,
    FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE SET NULL,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
);

-- Academic Hierarchy Tables
CREATE TABLE IF NOT EXISTS institutions (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    short_code TEXT,
    country TEXT DEFAULT '',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faculties (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    UNIQUE(institution_id, name)
);

CREATE TABLE IF NOT EXISTS programs (
    id TEXT PRIMARY KEY,
    faculty_id TEXT NOT NULL,
    name TEXT NOT NULL,
    degree_type TEXT DEFAULT 'Undergraduate', -- 'Undergraduate', 'Postgraduate', 'PhD', 'Diploma'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE CASCADE,
    UNIQUE(faculty_id, name)
);

CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    academic_year TEXT DEFAULT 'Year 1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
    UNIQUE(program_id, code)
);

CREATE TABLE IF NOT EXISTS user_courses (
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Communities
CREATE TABLE IF NOT EXISTS communities (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL, -- 'institution', 'faculty', 'program', 'year', 'course', 'general'
    ref_id TEXT, -- References institution_id, faculty_id, program_id, or course_id depending on level
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '🎓',
    cover_color TEXT DEFAULT '#4f46e5',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_members (
    user_id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    role TEXT DEFAULT 'member', -- 'admin', 'moderator', 'member'
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, community_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
);

-- Discussions
CREATE TABLE IF NOT EXISTS discussions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General', -- 'Questions', 'Course Discussion', 'Assignments', 'Exams', 'Study Help', 'Resources', 'Study Groups', 'Campus Life', 'Announcements', 'Projects', 'Career', 'General'
    community_id TEXT,
    course_id TEXT,
    institution_id TEXT,
    faculty_id TEXT,
    program_id TEXT,
    academic_year TEXT,
    author_id TEXT NOT NULL,
    is_anonymous INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]', -- JSON array of tags e.g. ["exam-prep", "calculus"]
    attachment_url TEXT,
    attachment_name TEXT,
    is_pinned INTEGER DEFAULT 0,
    is_locked INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE SET NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL,
    FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE SET NULL,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
);

-- Comments & Nested Replies
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    discussion_id TEXT NOT NULL,
    parent_id TEXT, -- NULL for top-level comments, comment id for nested replies
    author_id TEXT NOT NULL,
    is_anonymous INTEGER DEFAULT 0,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Reactions (Upvotes)
CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL, -- 'discussion', 'comment'
    target_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reaction_type TEXT DEFAULT 'upvote',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(target_type, target_id, user_id, reaction_type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Saved / Bookmarked Discussions
CREATE TABLE IF NOT EXISTS saved_discussions (
    user_id TEXT NOT NULL,
    discussion_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, discussion_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE
);

-- Study Groups
CREATE TABLE IF NOT EXISTS study_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    course_id TEXT,
    institution_id TEXT,
    program_id TEXT,
    academic_year TEXT,
    creator_id TEXT NOT NULL,
    max_members INTEGER DEFAULT 20,
    is_private INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS study_group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member', -- 'admin', 'member'
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS study_group_messages (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    sender_id TEXT,
    type TEXT NOT NULL, -- 'discussion_reply', 'comment_reply', 'upvote', 'group_invite', 'group_join', 'mention', 'system'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT DEFAULT '',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Moderation Reports
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    target_type TEXT NOT NULL, -- 'discussion', 'comment', 'user', 'group'
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT DEFAULT '',
    status TEXT DEFAULT 'pending', -- 'pending', 'resolved', 'dismissed'
    action_taken TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User Activity Log
CREATE TABLE IF NOT EXISTS user_activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'create_discussion', 'comment', 'upvote', 'join_group', 'save_discussion', 'joined_course'
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    link TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance & quick lookups
CREATE INDEX IF NOT EXISTS idx_discussions_community ON discussions(community_id);
CREATE INDEX IF NOT EXISTS idx_discussions_course ON discussions(course_id);
CREATE INDEX IF NOT EXISTS idx_discussions_author ON discussions(author_id);
CREATE INDEX IF NOT EXISTS idx_discussions_category ON discussions(category);
CREATE INDEX IF NOT EXISTS idx_discussions_created ON discussions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_discussion ON comments(discussion_id);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_faculties_institution ON faculties(institution_id);
CREATE INDEX IF NOT EXISTS idx_programs_faculty ON programs(faculty_id);
CREATE INDEX IF NOT EXISTS idx_courses_program ON courses(program_id);
