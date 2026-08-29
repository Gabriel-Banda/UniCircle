-- ============================================================================
-- UniCircle — Supabase schema
-- Run this in the Supabase SQL editor on a fresh project.
-- Auth users live in Supabase's built-in `auth.users`; `profiles` extends it.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------- Academic hierarchy -------------------------------------------

create table institutions (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table faculties (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (institution_id, name)
);

create table programs (
  id uuid primary key default uuid_generate_v4(),
  faculty_id uuid not null references faculties(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (faculty_id, name)
);

create table academic_years (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid not null references programs(id) on delete cascade,
  label text not null, -- e.g. "Year 1"
  created_at timestamptz not null default now(),
  unique (program_id, label)
);

create table courses (
  id uuid primary key default uuid_generate_v4(),
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  name text not null,
  code text, -- e.g. "ANAT201"
  created_at timestamptz not null default now(),
  unique (academic_year_id, name)
);

-- ---------- Profiles (extends auth.users) ---------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  name text not null,
  bio text,
  avatar_url text,
  institution_id uuid references institutions(id),
  faculty_id uuid references faculties(id),
  program_id uuid references programs(id),
  academic_year_id uuid references academic_years(id),
  role text not null default 'student' check (role in ('student', 'moderator', 'admin')),
  profile_visibility text not null default 'public' check (profile_visibility in ('public', 'community', 'private')),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

create table user_courses (
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  primary key (user_id, course_id)
);

-- ---------- Communities -----------------------------------------------

create table communities (
  id uuid primary key default uuid_generate_v4(),
  level text not null check (level in ('institution', 'faculty', 'program', 'academic_year', 'course')),
  institution_id uuid references institutions(id),
  faculty_id uuid references faculties(id),
  program_id uuid references programs(id),
  academic_year_id uuid references academic_years(id),
  course_id uuid references courses(id),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table community_members (
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

-- ---------- Discussions -----------------------------------------------

create table discussions (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid not null references profiles(id) on delete cascade,
  community_id uuid references communities(id),
  course_id uuid references courses(id),
  title text not null,
  body text not null,
  category text not null check (category in
    ('question','course_discussion','assignment','exam','study_help','resource',
     'study_group','campus_life','announcement','project','career','general')),
  tags text[] default '{}',
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default uuid_generate_v4(),
  discussion_id uuid not null references discussions(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  parent_comment_id uuid references comments(id) on delete cascade,
  body text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  discussion_id uuid references discussions(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  type text not null default 'upvote',
  created_at timestamptz not null default now(),
  unique (user_id, discussion_id, comment_id, type),
  check (discussion_id is not null or comment_id is not null)
);

create table saved_discussions (
  user_id uuid not null references profiles(id) on delete cascade,
  discussion_id uuid not null references discussions(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, discussion_id)
);

-- ---------- Study groups -----------------------------------------------

create table study_groups (
  id uuid primary key default uuid_generate_v4(),
  creator_id uuid not null references profiles(id) on delete cascade,
  course_id uuid references courses(id),
  institution_id uuid references institutions(id),
  program_id uuid references programs(id),
  academic_year_id uuid references academic_years(id),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table study_group_members (
  group_id uuid not null references study_groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------- Notifications, reports, settings ---------------------------

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in
    ('reply_to_discussion','reply_to_comment','reaction','group_invite','group_join','community_activity')),
  actor_id uuid references profiles(id),
  discussion_id uuid references discussions(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  group_id uuid references study_groups(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  discussion_id uuid references discussions(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  reported_user_id uuid references profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now()
);

create table user_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  appearance text not null default 'system' check (appearance in ('light', 'dark', 'system')),
  allow_anonymous_posting boolean not null default true,
  notify_replies boolean not null default true,
  notify_reactions boolean not null default true,
  notify_group_activity boolean not null default true
);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table profiles enable row level security;
alter table user_courses enable row level security;
alter table communities enable row level security;
alter table community_members enable row level security;
alter table discussions enable row level security;
alter table comments enable row level security;
alter table reactions enable row level security;
alter table saved_discussions enable row level security;
alter table study_groups enable row level security;
alter table study_group_members enable row level security;
alter table notifications enable row level security;
alter table reports enable row level security;
alter table user_settings enable row level security;
alter table institutions enable row level security;
alter table faculties enable row level security;
alter table programs enable row level security;
alter table academic_years enable row level security;
alter table courses enable row level security;

-- Academic hierarchy: readable by anyone signed in, writable only by admins
create policy "hierarchy readable" on institutions for select using (true);
create policy "hierarchy readable" on faculties for select using (true);
create policy "hierarchy readable" on programs for select using (true);
create policy "hierarchy readable" on academic_years for select using (true);
create policy "hierarchy readable" on courses for select using (true);

-- Profiles: public/community-visible profiles readable by anyone signed in;
-- a user always sees and edits their own profile.
create policy "profiles readable per visibility" on profiles for select using (
  profile_visibility = 'public' or id = auth.uid()
);
create policy "profiles self update" on profiles for update using (id = auth.uid());
create policy "profiles self insert" on profiles for insert with check (id = auth.uid());

create policy "user_courses owner" on user_courses for all using (user_id = auth.uid());

-- Discussions: readable by any signed-in user; only the author can edit/delete.
create policy "discussions readable" on discussions for select using (auth.role() = 'authenticated');
create policy "discussions insert own" on discussions for insert with check (author_id = auth.uid());
create policy "discussions update own" on discussions for update using (author_id = auth.uid());
create policy "discussions delete own" on discussions for delete using (author_id = auth.uid());

create policy "comments readable" on comments for select using (auth.role() = 'authenticated');
create policy "comments insert own" on comments for insert with check (author_id = auth.uid());
create policy "comments update own" on comments for update using (author_id = auth.uid());
create policy "comments delete own" on comments for delete using (author_id = auth.uid());

create policy "reactions readable" on reactions for select using (auth.role() = 'authenticated');
create policy "reactions manage own" on reactions for all using (user_id = auth.uid());

create policy "saved own" on saved_discussions for all using (user_id = auth.uid());

create policy "communities readable" on communities for select using (auth.role() = 'authenticated');
create policy "community_members readable" on community_members for select using (auth.role() = 'authenticated');
create policy "community_members manage own" on community_members for all using (user_id = auth.uid());

create policy "study_groups readable" on study_groups for select using (auth.role() = 'authenticated');
create policy "study_groups insert own" on study_groups for insert with check (creator_id = auth.uid());
create policy "study_groups update own" on study_groups for update using (creator_id = auth.uid());
create policy "study_groups delete own" on study_groups for delete using (creator_id = auth.uid());

create policy "group_members readable" on study_group_members for select using (auth.role() = 'authenticated');
create policy "group_members manage own" on study_group_members for all using (user_id = auth.uid());

-- Notifications: only visible to their owner
create policy "notifications own" on notifications for select using (user_id = auth.uid());
create policy "notifications update own" on notifications for update using (user_id = auth.uid());

create policy "reports insert own" on reports for insert with check (reporter_id = auth.uid());
create policy "reports own visible" on reports for select using (reporter_id = auth.uid());

create policy "settings own" on user_settings for all using (user_id = auth.uid());

-- Anonymous posting: `is_anonymous` hides authorship in the UI layer (the
-- author_id column is never dropped, so moderators/admins can still trace
-- content — enforce that distinction in application code, not RLS, since
-- RLS can't selectively mask a single column per row for non-owners.
