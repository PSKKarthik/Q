-- ============================================================
-- QGX DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- STORAGE BUCKET (for course files, attachments, forum uploads)
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('course-files', 'course-files', true)
  on conflict (id) do nothing;

-- Allow authenticated users to upload files
drop policy if exists "course_files_upload" on storage.objects;
create policy "course_files_upload" on storage.objects for insert
  with check (bucket_id = 'course-files' and auth.role() = 'authenticated');

-- Allow public read access
drop policy if exists "course_files_read" on storage.objects;
create policy "course_files_read" on storage.objects for select
  using (bucket_id = 'course-files');

-- Allow users to delete their own uploads
drop policy if exists "course_files_delete" on storage.objects;
create policy "course_files_delete" on storage.objects for delete
  using (bucket_id = 'course-files' and auth.uid()::text = (storage.foldername(name))[1]);

-- PROFILES (extends Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  role text not null check (role in ('admin','teacher','student','parent')),
  avatar text default '??',
  phone text,
  bio text,
  subject text,
  grade text,
  qgx_id text unique,
  xp integer default 0,
  score integer default 0,
  ghost_wins integer default 0,
  badges text[] default '{}',
  reputation integer default 0,
  joined date default now()
);

-- ANNOUNCEMENTS
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  author_id uuid references profiles(id) on delete set null,
  author_name text,
  role text,
  target text default 'all' check (target in ('all','teachers','students')),
  pinned boolean default false,
  created_at timestamptz default now()
);

-- TESTS & QUIZZES
create table if not exists tests (
  id text primary key,
  title text not null,
  subject text,
  teacher_id uuid references profiles(id) on delete cascade,
  teacher_name text,
  scheduled_date date,
  scheduled_time time,
  duration integer default 60,
  status text default 'scheduled',
  total_marks integer default 0,
  type text default 'test' check (type in ('test','quiz')),
  anti_cheat jsonb default '{
    "tabSwitch":false,
    "copyPaste":false,
    "randomQ":false,
    "randomOpts":false,
    "fullscreen":false,
    "timePerQ":0,
    "maxAttempts":1
  }',
  xp_reward integer default 100,
  created_at timestamptz default now()
);

-- QUESTIONS
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  test_id text references tests(id) on delete cascade,
  type text not null check (type in ('mcq','msq','tf','fib','match')),
  text text not null,
  options jsonb,
  answer jsonb,
  marks integer default 1,
  order_index integer default 0
);

-- ATTEMPTS
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  test_id text references tests(id) on delete cascade,
  score integer default 0,
  total integer default 0,
  percent integer default 0,
  answer_map jsonb default '{}',
  xp_earned integer default 0,
  submitted_at timestamptz default now(),
  unique(student_id, test_id)
);

-- COURSES
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  teacher_id uuid references profiles(id) on delete cascade,
  teacher_name text,
  description text,
  created_at timestamptz default now()
);

-- COURSE FILES
create table if not exists course_files (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  name text not null,
  storage_path text,
  type text,
  url text,
  size bigint,
  teacher_id uuid references profiles(id),
  uploaded_at timestamptz default now()
);

-- ENROLLMENTS
create table if not exists enrollments (
  student_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  primary key (student_id, course_id)
);

-- COURSE PROGRESS (tracks which files each student completed)
create table if not exists course_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  file_id uuid references course_files(id) on delete cascade,
  completed_at timestamptz default now(),
  unique(student_id, file_id)
);

-- COURSE RATINGS
create table if not exists course_ratings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  student_name text,
  course_id uuid references courses(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  review text,
  created_at timestamptz default now(),
  unique(student_id, course_id)
);

-- Migration: add status, section, order_index for existing databases
alter table courses add column if not exists status text default 'published' check (status in ('draft','published'));
alter table course_files add column if not exists section text;
alter table course_files add column if not exists order_index integer default 0;

-- ASSIGNMENTS
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  course_id uuid references courses(id) on delete cascade,
  teacher_id uuid references profiles(id),
  teacher_name text,
  due_date date,
  attachment_url text,
  attachment_name text,
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  max_points integer default 100,
  status text default 'active' check (status in ('active','closed')),
  created_at timestamptz default now()
);

-- SUBMISSIONS
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  file_name text,
  file_url text,
  text_response text,
  feedback text,
  grade text,
  score integer,
  is_draft boolean default false,
  is_late boolean default false,
  submitted_at timestamptz default now(),
  unique(assignment_id, student_id)
);

-- Migration: add assignment upgrade columns for existing databases
alter table assignments add column if not exists attachment_url text;
alter table assignments add column if not exists attachment_name text;
alter table assignments add column if not exists priority text default 'medium';
alter table assignments add column if not exists max_points integer default 100;
alter table assignments add column if not exists status text default 'active';
alter table submissions add column if not exists file_url text;
alter table submissions add column if not exists text_response text;
alter table submissions add column if not exists feedback text;
alter table submissions add column if not exists score integer;
alter table submissions add column if not exists is_draft boolean default false;
alter table submissions add column if not exists is_late boolean default false;

-- TIMETABLE
create table if not exists timetable (
  id uuid primary key default gen_random_uuid(),
  subject text,
  teacher_id uuid references profiles(id),
  teacher_name text,
  day text check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  time text,
  room text
);

-- NOTIFICATIONS
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  message text not null,
  type text default 'info',
  read boolean default false,
  created_at timestamptz default now()
);

-- ACTIVITY LOG
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  type text default 'info',
  created_at timestamptz default now()
);

-- FORUM POSTS
create table if not exists forum_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  author_id uuid references profiles(id) on delete cascade,
  author_name text,
  author_role text default 'student',
  likes text[] default '{}',
  bookmarks text[] default '{}',
  flair text check (flair in ('question','discussion','announcement','resource','help','showcase')),
  tags text[] default '{}',
  attachment_url text,
  attachment_name text,
  attachment_type text,
  comment_count integer default 0,
  view_count integer default 0,
  pinned boolean default false,
  best_answer_id uuid,
  edited_at timestamptz,
  created_at timestamptz default now()
);

-- FORUM COMMENTS
create table if not exists forum_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references forum_posts(id) on delete cascade,
  parent_id uuid references forum_comments(id) on delete cascade,
  author_id uuid references profiles(id) on delete cascade,
  author_name text,
  author_role text default 'student',
  body text not null,
  likes text[] default '{}',
  is_best_answer boolean default false,
  created_at timestamptz default now()
);

-- PLATFORM SETTINGS
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null
);
insert into platform_settings (key, value) 
  values ('double_xp', '{"active":false,"ends_at":null}')
  on conflict (key) do nothing;
insert into platform_settings (key, value)
  values ('xp_levels', '[
    {"level":1,"name":"ROOKIE","xp":0,"icon":"◇","color":"#6b7280"},
    {"level":2,"name":"SCHOLAR","xp":500,"icon":"◈","color":"#10b981"},
    {"level":3,"name":"ACHIEVER","xp":1000,"icon":"◆","color":"#f59e0b"},
    {"level":4,"name":"ELITE","xp":2000,"icon":"★","color":"#ff9500"},
    {"level":5,"name":"LEGEND","xp":3500,"icon":"◆","color":"#ef4444"},
    {"level":6,"name":"MYTHIC","xp":5000,"icon":"◈","color":"#8b5cf6"},
    {"level":7,"name":"IMMORTAL","xp":7500,"icon":"■","color":"#ec4899"}
  ]')
  on conflict (key) do nothing;
insert into platform_settings (key, value)
  values ('checkin_xp', '10')
  on conflict (key) do nothing;
insert into platform_settings (key, value)
  values ('max_xp_per_test', '500')
  on conflict (key) do nothing;

-- ============================================================
-- DEFENSIVE MIGRATIONS: ensure student_id exists on all tables
-- (fixes errors when tables existed from a previous partial run)
-- ============================================================
alter table attempts add column if not exists student_id uuid references profiles(id) on delete cascade;
alter table enrollments add column if not exists student_id uuid references profiles(id) on delete cascade;
alter table course_progress add column if not exists student_id uuid references profiles(id) on delete cascade;
alter table course_ratings add column if not exists student_id uuid references profiles(id) on delete cascade;
alter table submissions add column if not exists student_id uuid references profiles(id) on delete cascade;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table announcements enable row level security;
alter table tests enable row level security;
alter table questions enable row level security;
alter table attempts enable row level security;
alter table courses enable row level security;
alter table course_files enable row level security;
alter table enrollments enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table timetable enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;
alter table forum_posts enable row level security;
alter table forum_comments enable row level security;
alter table platform_settings enable row level security;
alter table course_progress enable row level security;
alter table course_ratings enable row level security;

-- Migration: add bookmarks, best_answer_id, is_best_answer for existing databases
alter table forum_posts add column if not exists bookmarks text[] default '{}';
alter table forum_posts add column if not exists best_answer_id uuid;
alter table forum_comments add column if not exists is_best_answer boolean default false;

-- Profiles
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select using (auth.role() = 'authenticated');
drop policy if exists "profiles_insert" on profiles;
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update using (auth.uid() = id)
  with check (
    -- Prevent users from changing their own role via client
    role = (select role from profiles where id = auth.uid())
  );

-- Announcements
drop policy if exists "announcements_select" on announcements;
create policy "announcements_select" on announcements for select using (true);
drop policy if exists "announcements_insert" on announcements;
create policy "announcements_insert" on announcements for insert with check (auth.role() = 'authenticated');
drop policy if exists "announcements_delete" on announcements;
create policy "announcements_delete" on announcements for delete using (auth.uid() = author_id);

-- Tests
drop policy if exists "tests_select" on tests;
create policy "tests_select" on tests for select using (true);
drop policy if exists "tests_insert" on tests;
create policy "tests_insert" on tests for insert with check (auth.role() = 'authenticated');
drop policy if exists "tests_update" on tests;
create policy "tests_update" on tests for update using (auth.uid() = teacher_id);
drop policy if exists "tests_delete" on tests;
create policy "tests_delete" on tests for delete using (auth.uid() = teacher_id);

-- Questions
-- Teachers can see questions for their own tests; students only via server-side API
drop policy if exists "questions_select" on questions;
create policy "questions_select" on questions for select using (
  exists (select 1 from tests where tests.id = questions.test_id and tests.teacher_id = auth.uid())
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
drop policy if exists "questions_insert" on questions;
create policy "questions_insert" on questions for insert with check (
  exists (select 1 from tests where tests.id = questions.test_id and tests.teacher_id = auth.uid())
);
-- Only the teacher who owns the test can delete questions
drop policy if exists "questions_delete" on questions;
create policy "questions_delete" on questions for delete using (
  exists (select 1 from tests where tests.id = questions.test_id and tests.teacher_id = auth.uid())
);

-- Attempts
drop policy if exists "attempts_select" on attempts;
create policy "attempts_select" on attempts for select using (auth.uid() = student_id);
drop policy if exists "attempts_insert" on attempts;
create policy "attempts_insert" on attempts for insert with check (auth.uid() = student_id);
drop policy if exists "attempts_select_teacher" on attempts;
create policy "attempts_select_teacher" on attempts for select using (
  exists (select 1 from tests where tests.id = attempts.test_id and tests.teacher_id = auth.uid())
);
-- Admin can see all attempts for platform analytics
drop policy if exists "attempts_select_admin" on attempts;
create policy "attempts_select_admin" on attempts for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

-- Courses
drop policy if exists "courses_select" on courses;
create policy "courses_select" on courses for select using (true);
drop policy if exists "courses_insert" on courses;
create policy "courses_insert" on courses for insert with check (auth.role() = 'authenticated');
drop policy if exists "courses_update" on courses;
create policy "courses_update" on courses for update using (auth.uid() = teacher_id);
drop policy if exists "courses_delete" on courses;
create policy "courses_delete" on courses for delete using (
  auth.uid() = teacher_id or
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

-- Course files
drop policy if exists "course_files_select" on course_files;
create policy "course_files_select" on course_files for select using (true);
drop policy if exists "course_files_insert" on course_files;
create policy "course_files_insert" on course_files for insert with check (auth.role() = 'authenticated');
drop policy if exists "course_files_delete" on course_files;
create policy "course_files_delete" on course_files for delete using (auth.uid() = teacher_id);

-- Enrollments
drop policy if exists "enrollments_select" on enrollments;
create policy "enrollments_select" on enrollments for select using (true);
drop policy if exists "enrollments_insert" on enrollments;
create policy "enrollments_insert" on enrollments for insert with check (auth.role() = 'authenticated');
drop policy if exists "enrollments_delete" on enrollments;
create policy "enrollments_delete" on enrollments for delete using (auth.uid() = student_id);

-- Course Progress
drop policy if exists "course_progress_select" on course_progress;
create policy "course_progress_select" on course_progress for select using (true);
drop policy if exists "course_progress_insert" on course_progress;
create policy "course_progress_insert" on course_progress for insert with check (auth.uid() = student_id);
drop policy if exists "course_progress_delete" on course_progress;
create policy "course_progress_delete" on course_progress for delete using (auth.uid() = student_id);

-- Course Ratings
drop policy if exists "course_ratings_select" on course_ratings;
create policy "course_ratings_select" on course_ratings for select using (true);
drop policy if exists "course_ratings_insert" on course_ratings;
create policy "course_ratings_insert" on course_ratings for insert with check (auth.uid() = student_id);
drop policy if exists "course_ratings_update" on course_ratings;
create policy "course_ratings_update" on course_ratings for update using (auth.uid() = student_id);

-- Assignments
drop policy if exists "assignments_select" on assignments;
create policy "assignments_select" on assignments for select using (true);
drop policy if exists "assignments_insert" on assignments;
create policy "assignments_insert" on assignments for insert with check (auth.role() = 'authenticated');

-- Submissions
drop policy if exists "submissions_select" on submissions;
create policy "submissions_select" on submissions for select using (
  auth.uid() = student_id or
  exists (select 1 from assignments where assignments.id = submissions.assignment_id and assignments.teacher_id = auth.uid())
);
drop policy if exists "submissions_insert" on submissions;
create policy "submissions_insert" on submissions for insert with check (auth.uid() = student_id);

-- Timetable
drop policy if exists "timetable_select" on timetable;
create policy "timetable_select" on timetable for select using (true);
drop policy if exists "timetable_insert" on timetable;
create policy "timetable_insert" on timetable for insert with check (auth.role() = 'authenticated');

-- Notifications
drop policy if exists "notifications_select" on notifications;
create policy "notifications_select" on notifications for select using (auth.uid() = user_id);
drop policy if exists "notifications_insert" on notifications;
create policy "notifications_insert" on notifications for insert with check (auth.role() = 'authenticated');
drop policy if exists "notifications_update" on notifications;
create policy "notifications_update" on notifications for update using (auth.uid() = user_id);

-- Activity log
drop policy if exists "activity_log_select" on activity_log;
create policy "activity_log_select" on activity_log for select using (true);
drop policy if exists "activity_log_insert" on activity_log;
create policy "activity_log_insert" on activity_log for insert with check (auth.role() = 'authenticated');

-- Forum posts
drop policy if exists "forum_posts_select" on forum_posts;
create policy "forum_posts_select" on forum_posts for select using (true);
drop policy if exists "forum_posts_insert" on forum_posts;
create policy "forum_posts_insert" on forum_posts for insert with check (auth.role() = 'authenticated');
drop policy if exists "forum_posts_update" on forum_posts;
create policy "forum_posts_update" on forum_posts for update using (auth.uid() = author_id);
drop policy if exists "forum_posts_delete" on forum_posts;
create policy "forum_posts_delete" on forum_posts for delete using (auth.uid() = author_id);

-- Forum comments
drop policy if exists "forum_comments_select" on forum_comments;
create policy "forum_comments_select" on forum_comments for select using (true);
drop policy if exists "forum_comments_insert" on forum_comments;
create policy "forum_comments_insert" on forum_comments for insert with check (auth.role() = 'authenticated');
drop policy if exists "forum_comments_delete" on forum_comments;
create policy "forum_comments_delete" on forum_comments for delete using (auth.uid() = author_id);

-- Platform settings (admin-only update)
drop policy if exists "platform_settings_select" on platform_settings;
create policy "platform_settings_select" on platform_settings for select using (true);
drop policy if exists "platform_settings_update" on platform_settings;
create policy "platform_settings_update" on platform_settings for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
drop policy if exists "platform_settings_insert" on platform_settings;
create policy "platform_settings_insert" on platform_settings for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

-- ============================================================
-- REALTIME
-- Run these to enable realtime on key tables
-- ============================================================
-- In Supabase Dashboard → Database → Replication
-- Toggle ON for: announcements, notifications, attempts, tests, activity_log

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, role, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User'),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    upper(substring(coalesce(new.raw_user_meta_data->>'name', 'US'), 1, 2))
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- RPC: Atomic toggle like on forum posts
-- ============================================================
create or replace function public.toggle_forum_like(post_id uuid, user_id uuid)
returns text[] as $$
declare
  current_likes text[];
begin
  select coalesce(likes, '{}') into current_likes from forum_posts where id = post_id for update;
  if user_id::text = any(current_likes) then
    update forum_posts set likes = array_remove(current_likes, user_id::text) where id = post_id
      returning likes into current_likes;
  else
    update forum_posts set likes = array_append(current_likes, user_id::text) where id = post_id
      returning likes into current_likes;
  end if;
  return current_likes;
end;
$$ language plpgsql security definer;

-- ============================================================
-- RPC: Atomic toggle like on forum comments
-- ============================================================
create or replace function public.toggle_comment_like(comment_id uuid, user_id uuid)
returns text[] as $$
declare
  current_likes text[];
begin
  select coalesce(likes, '{}') into current_likes from forum_comments where id = comment_id for update;
  if user_id::text = any(current_likes) then
    update forum_comments set likes = array_remove(current_likes, user_id::text) where id = comment_id
      returning likes into current_likes;
  else
    update forum_comments set likes = array_append(current_likes, user_id::text) where id = comment_id
      returning likes into current_likes;
  end if;
  return current_likes;
end;
$$ language plpgsql security definer;

-- ============================================================
-- RPC: Increment view count atomically
-- ============================================================
create or replace function public.increment_view_count(p_post_id uuid)
returns void as $$
begin
  update forum_posts set view_count = view_count + 1 where id = p_post_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- RPC: Atomic XP update to prevent race conditions (#11)
-- ============================================================
create or replace function public.atomic_xp_update(
  p_user_id uuid,
  p_xp_delta int,
  p_best_score int,
  p_ghost_win_increment int
)
returns void as $$
begin
  -- Clamp XP delta to prevent abuse: max ±500 per call, result never negative
  if p_xp_delta > 500 then p_xp_delta := 500; end if;
  if p_xp_delta < -500 then p_xp_delta := -500; end if;
  if p_best_score < 0 then p_best_score := 0; end if;
  if p_best_score > 100 then p_best_score := 100; end if;

  update profiles set
    xp = greatest(0, coalesce(xp, 0) + p_xp_delta),
    score = greatest(coalesce(score, 0), p_best_score),
    ghost_wins = greatest(0, coalesce(ghost_wins, 0) + p_ghost_win_increment)
  where id = p_user_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- TRIGGER: Sync comment_count on forum_posts
-- ============================================================
create or replace function public.update_comment_count()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    update forum_posts set comment_count = comment_count + 1 where id = NEW.post_id;
    return NEW;
  elsif (TG_OP = 'DELETE') then
    update forum_posts set comment_count = greatest(comment_count - 1, 0) where id = OLD.post_id;
    return OLD;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace trigger forum_comment_count_trigger
  after insert or delete on forum_comments
  for each row execute procedure public.update_comment_count();

-- ============================================================
-- MISSING RLS POLICIES (audit fix)
-- ============================================================

-- Timetable update + delete (teachers only)
drop policy if exists "timetable_update" on timetable;
create policy "timetable_update" on timetable for update using (auth.uid() = teacher_id);
drop policy if exists "timetable_delete" on timetable;
create policy "timetable_delete" on timetable for delete using (auth.uid() = teacher_id);

-- Assignments update + delete (teachers only)
drop policy if exists "assignments_update" on assignments;
create policy "assignments_update" on assignments for update using (auth.uid() = teacher_id);
drop policy if exists "assignments_delete" on assignments;
create policy "assignments_delete" on assignments for delete using (auth.uid() = teacher_id);

-- Submissions update (teacher of the assignment can grade)
drop policy if exists "submissions_update" on submissions;
create policy "submissions_update" on submissions for update using (
  auth.uid() = student_id or
  exists (select 1 from assignments where assignments.id = submissions.assignment_id and assignments.teacher_id = auth.uid())
);

-- ============================================================
-- PERFORMANCE INDEXES (audit fix)
-- ============================================================
create index if not exists idx_attempts_student on attempts(student_id);
create index if not exists idx_attempts_test on attempts(test_id);
create index if not exists idx_enrollments_student on enrollments(student_id);
create index if not exists idx_enrollments_course on enrollments(course_id);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_course_files_course on course_files(course_id);
create index if not exists idx_submissions_assignment on submissions(assignment_id);
create index if not exists idx_submissions_student on submissions(student_id);
create index if not exists idx_forum_posts_author on forum_posts(author_id);
create index if not exists idx_forum_comments_post on forum_comments(post_id);
create index if not exists idx_course_progress_student on course_progress(student_id);
create index if not exists idx_activity_log_created on activity_log(created_at desc);

-- ============================================================
-- ATTENDANCE
-- ============================================================
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  student_name text,
  teacher_id uuid references profiles(id) on delete cascade,
  subject text,
  date date not null,
  status text not null check (status in ('present','absent','late','excused')),
  note text,
  created_at timestamptz default now(),
  unique(student_id, teacher_id, subject, date)
);

alter table attendance add column if not exists student_id uuid references profiles(id) on delete cascade;
alter table attendance enable row level security;

-- Students see their own records
drop policy if exists "attendance_select_student" on attendance;
create policy "attendance_select_student" on attendance for select using (auth.uid() = student_id);
-- Teachers see records they created
drop policy if exists "attendance_select_teacher" on attendance;
create policy "attendance_select_teacher" on attendance for select using (auth.uid() = teacher_id);
-- Admin sees all
drop policy if exists "attendance_select_admin" on attendance;
create policy "attendance_select_admin" on attendance for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
-- Teachers can insert/update/delete their own attendance records
drop policy if exists "attendance_insert" on attendance;
create policy "attendance_insert" on attendance for insert with check (auth.uid() = teacher_id);
drop policy if exists "attendance_update" on attendance;
create policy "attendance_update" on attendance for update using (auth.uid() = teacher_id);
drop policy if exists "attendance_delete" on attendance;
create policy "attendance_delete" on attendance for delete using (auth.uid() = teacher_id);

create index if not exists idx_attendance_student on attendance(student_id);
create index if not exists idx_attendance_teacher on attendance(teacher_id);
create index if not exists idx_attendance_date on attendance(date desc);

-- ============================================================
-- FIX: Allow multiple attempts by removing unique constraint
-- ============================================================
alter table attempts drop constraint if exists attempts_student_id_test_id_key;
alter table attempts add column if not exists attempt_number integer default 1;

-- ============================================================
-- RPC: Atomic QGX ID generation (prevents race condition)
-- ============================================================
create or replace function public.generate_qgx_id(p_role text)
returns text as $$
declare
  prefix text;
  cnt integer;
  suffix text;
begin
  prefix := case p_role
    when 'admin' then 'A'
    when 'teacher' then 'T'
    when 'parent' then 'P'
    else 'S'
  end;
  select count(*) + 1 into cnt from profiles where role = p_role;
  suffix := upper(substring(gen_random_uuid()::text, 1, 8));
  return 'QGX-' || prefix || lpad(cnt::text, 4, '0') || suffix;
end;
$$ language plpgsql security definer;

-- ============================================================
-- PHASE 2 MIGRATIONS (#016-#030)
-- ============================================================

-- #018: Add ON DELETE CASCADE to teacher FK on course_files and assignments
-- (Run as ALTER since tables already exist — safe to run multiple times)
-- NOTE: Postgres doesn't support ALTER CONSTRAINT, so we drop + re-add
do $$ begin
  alter table course_files drop constraint if exists course_files_teacher_id_fkey;
  alter table course_files add constraint course_files_teacher_id_fkey
    foreign key (teacher_id) references profiles(id) on delete cascade;
exception when others then null;
end $$;
do $$ begin
  alter table assignments drop constraint if exists assignments_teacher_id_fkey;
  alter table assignments add constraint assignments_teacher_id_fkey
    foreign key (teacher_id) references profiles(id) on delete cascade;
exception when others then null;
end $$;

-- #019: Add FK constraint on forum_posts.best_answer_id
do $$ begin
  alter table forum_posts drop constraint if exists forum_posts_best_answer_id_fkey;
  alter table forum_posts add constraint forum_posts_best_answer_id_fkey
    foreign key (best_answer_id) references forum_comments(id) on delete set null;
exception when others then null;
end $$;

-- ============================================================
-- MESSAGES (DMs) — #023
-- ============================================================
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete cascade,
  receiver_id uuid references profiles(id) on delete cascade,
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);

alter table messages enable row level security;
drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "messages_insert" on messages;
create policy "messages_insert" on messages for insert with check (auth.uid() = sender_id);
drop policy if exists "messages_update" on messages;
create policy "messages_update" on messages for update using (auth.uid() = receiver_id);

create index if not exists idx_messages_sender on messages(sender_id);
create index if not exists idx_messages_receiver on messages(receiver_id);
create index if not exists idx_messages_created on messages(created_at desc);

-- ============================================================
-- CERTIFICATES — #027
-- ============================================================
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  student_name text,
  course_title text,
  issued_at timestamptz default now(),
  unique(student_id, course_id)
);

alter table certificates add column if not exists student_id uuid references profiles(id) on delete cascade;
alter table certificates enable row level security;
drop policy if exists "certificates_select" on certificates;
create policy "certificates_select" on certificates for select using (auth.uid() = student_id or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','teacher')));
drop policy if exists "certificates_insert" on certificates;
create policy "certificates_insert" on certificates for insert with check (auth.uid() = student_id);

create index if not exists idx_certificates_student on certificates(student_id);

-- ============================================================
-- PARENT-STUDENT LINK — #025
-- ============================================================
create table if not exists parent_students (
  parent_id uuid references profiles(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  primary key (parent_id, student_id)
);

alter table parent_students enable row level security;
drop policy if exists "parent_students_select" on parent_students;
create policy "parent_students_select" on parent_students for select using (auth.uid() = parent_id or auth.uid() = student_id);
drop policy if exists "parent_students_insert" on parent_students;
create policy "parent_students_insert" on parent_students for insert with check (auth.uid() = parent_id);
drop policy if exists "parent_students_delete" on parent_students;
create policy "parent_students_delete" on parent_students for delete using (auth.uid() = parent_id);

-- Update profiles role check to include parent
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin','teacher','student','parent'));

-- Parent RLS: parents can see their linked student's data
drop policy if exists "attempts_select_parent" on attempts;
create policy "attempts_select_parent" on attempts for select using (
  exists (select 1 from parent_students where parent_students.parent_id = auth.uid() and parent_students.student_id = attempts.student_id)
);
drop policy if exists "attendance_select_parent" on attendance;
create policy "attendance_select_parent" on attendance for select using (
  exists (select 1 from parent_students where parent_students.parent_id = auth.uid() and parent_students.student_id = attendance.student_id)
);

-- ============================================================
-- MESSAGING UPGRADE — group chats, attachments, edit/delete
-- ============================================================
alter table messages add column if not exists attachment_url text;
alter table messages add column if not exists attachment_name text;
alter table messages add column if not exists attachment_type text;
alter table messages add column if not exists edited_at timestamptz;
alter table messages add column if not exists deleted boolean default false;
alter table messages add column if not exists group_id uuid;

create table if not exists message_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  member_ids text[] default '{}',
  created_at timestamptz default now()
);

alter table message_groups enable row level security;
drop policy if exists "msg_groups_select" on message_groups;
create policy "msg_groups_select" on message_groups for select using (auth.uid()::text = any(member_ids));
drop policy if exists "msg_groups_insert" on message_groups;
create policy "msg_groups_insert" on message_groups for insert with check (auth.uid() = created_by);
drop policy if exists "msg_groups_update" on message_groups;
create policy "msg_groups_update" on message_groups for update using (auth.uid() = created_by);

-- ============================================================
-- CERTIFICATE UPGRADE — credential ID, verification
-- ============================================================
alter table certificates add column if not exists credential_id text unique;
alter table certificates add column if not exists verified boolean default true;

-- ============================================================
-- REPORT CARD UPGRADE — teacher comments, conduct
-- ============================================================
create table if not exists report_comments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete set null,
  teacher_name text,
  term text,
  comment text,
  conduct text check (conduct in ('excellent','good','satisfactory','needs_improvement','poor')),
  created_at timestamptz default now()
);

alter table report_comments enable row level security;
drop policy if exists "report_comments_select" on report_comments;
create policy "report_comments_select" on report_comments for select using (
  auth.uid() = student_id or auth.uid() = teacher_id or
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','parent'))
);
drop policy if exists "report_comments_insert" on report_comments;
create policy "report_comments_insert" on report_comments for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','teacher'))
);

-- Grade weights config per school/admin
create table if not exists grade_weights (
  id uuid primary key default gen_random_uuid(),
  tests_weight integer default 40,
  assignments_weight integer default 30,
  attendance_weight integer default 10,
  participation_weight integer default 20,
  updated_at timestamptz default now()
);

alter table grade_weights enable row level security;
drop policy if exists "grade_weights_select" on grade_weights;
create policy "grade_weights_select" on grade_weights for select using (true);
drop policy if exists "grade_weights_upsert" on grade_weights;
create policy "grade_weights_upsert" on grade_weights for all using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

-- ============================================================
-- ABSENCE EXCUSES — parent submissions
-- ============================================================
create table if not exists absence_excuses (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references profiles(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  date text not null,
  reason text not null,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table absence_excuses add column if not exists student_id uuid references profiles(id) on delete cascade;
alter table absence_excuses enable row level security;
drop policy if exists "excuses_select" on absence_excuses;
create policy "excuses_select" on absence_excuses for select using (
  auth.uid() = parent_id or auth.uid() = student_id or
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','teacher'))
);
drop policy if exists "excuses_insert" on absence_excuses;
create policy "excuses_insert" on absence_excuses for insert with check (auth.uid() = parent_id);
drop policy if exists "excuses_update" on absence_excuses;
create policy "excuses_update" on absence_excuses for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','teacher'))
);

-- ============================================================
-- AI TUTOR CHAT HISTORY
-- ============================================================
create table if not exists ai_chats (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  messages jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table ai_chats add column if not exists student_id uuid references profiles(id) on delete cascade;
alter table ai_chats enable row level security;
drop policy if exists "ai_chats_own" on ai_chats;
create policy "ai_chats_own" on ai_chats for all using (auth.uid() = student_id);

-- ============================================================
-- LIVE CLASSES
-- ============================================================
create table if not exists live_classes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  teacher_id uuid references profiles(id) on delete cascade,
  teacher_name text,
  course_id uuid references courses(id) on delete set null,
  room_url text,
  scheduled_at timestamptz not null,
  duration integer default 60,
  status text default 'scheduled' check (status in ('scheduled','live','ended')),
  created_at timestamptz default now()
);

alter table live_classes enable row level security;
drop policy if exists "live_classes_select" on live_classes;
create policy "live_classes_select" on live_classes for select using (true);
drop policy if exists "live_classes_insert" on live_classes;
create policy "live_classes_insert" on live_classes for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','teacher'))
);
drop policy if exists "live_classes_update" on live_classes;
create policy "live_classes_update" on live_classes for update using (auth.uid() = teacher_id);

-- ============================================================
-- GAMIFICATION QUESTS
-- ============================================================
create table if not exists quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text default 'daily' check (type in ('daily','weekly','special')),
  target_type text not null,
  target_count integer default 1,
  xp_reward integer default 50,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists quest_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  quest_id uuid references quests(id) on delete cascade,
  progress integer default 0,
  completed boolean default false,
  claimed boolean default false,
  completed_at timestamptz,
  unique(student_id, quest_id)
);

alter table quest_progress add column if not exists student_id uuid references profiles(id) on delete cascade;
alter table quest_progress add column if not exists claimed boolean default false;
alter table quests enable row level security;
alter table quest_progress enable row level security;
drop policy if exists "quests_select" on quests;
create policy "quests_select" on quests for select using (true);
drop policy if exists "quests_admin" on quests;
drop policy if exists "quests_admin_insert" on quests;
create policy "quests_admin_insert" on quests for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
drop policy if exists "quests_admin_update" on quests;
create policy "quests_admin_update" on quests for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
drop policy if exists "quests_admin_delete" on quests;
create policy "quests_admin_delete" on quests for delete using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
drop policy if exists "quest_progress_own" on quest_progress;
create policy "quest_progress_own" on quest_progress for all using (auth.uid() = student_id);
drop policy if exists "quest_progress_teacher_read" on quest_progress;
create policy "quest_progress_teacher_read" on quest_progress for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('teacher','admin'))
);

-- ============================================================
-- PARENT-TEACHER MEETING SLOTS
-- ============================================================
create table if not exists meeting_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references profiles(id) on delete cascade,
  teacher_name text,
  date text not null,
  time text not null,
  duration integer default 15,
  booked_by uuid references profiles(id) on delete set null,
  booked_name text,
  student_id uuid references profiles(id) on delete set null,
  status text default 'available' check (status in ('available','booked','completed','cancelled')),
  created_at timestamptz default now()
);

alter table meeting_slots enable row level security;
drop policy if exists "meeting_slots_select" on meeting_slots;
create policy "meeting_slots_select" on meeting_slots for select using (true);
drop policy if exists "meeting_slots_teacher" on meeting_slots;
create policy "meeting_slots_teacher" on meeting_slots for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('admin','teacher'))
);
drop policy if exists "meeting_slots_update" on meeting_slots;
create policy "meeting_slots_update" on meeting_slots for update using (
  auth.uid() = teacher_id or auth.uid() = booked_by
);

-- ============================================================
-- FORUM REPUTATION
-- ============================================================
alter table profiles add column if not exists reputation integer default 0;
alter table profiles add column if not exists badges text[] default '{}';

-- ============================================================
-- PLATFORM SETTINGS — theme preference
-- ============================================================
alter table profiles add column if not exists theme text default 'dark' check (theme in ('dark','light'));

-- ============================================================
-- COLLABORATION ROOMS
-- ============================================================
create table if not exists collaboration_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text default '',
  created_by uuid references profiles(id),
  creator_name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table collaboration_rooms enable row level security;
drop policy if exists "collab_rooms_read" on collaboration_rooms;
create policy "collab_rooms_read" on collaboration_rooms for select using (true);
drop policy if exists "collab_rooms_create" on collaboration_rooms;
create policy "collab_rooms_create" on collaboration_rooms for insert with check (auth.uid() = created_by);

create table if not exists room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references collaboration_rooms(id) on delete cascade,
  user_id uuid references profiles(id),
  user_name text not null,
  content text not null,
  created_at timestamptz default now()
);
alter table room_messages enable row level security;
drop policy if exists "room_msg_read" on room_messages;
create policy "room_msg_read" on room_messages for select using (true);
drop policy if exists "room_msg_create" on room_messages;
create policy "room_msg_create" on room_messages for insert with check (auth.uid() = user_id);

-- Enable realtime for collaboration
do $$ begin
  alter publication supabase_realtime add table room_messages;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- REPUTATION RPC
-- ============================================================
create or replace function increment_reputation(target_user uuid, delta integer)
returns void language plpgsql security definer as $$
begin
  update profiles set reputation = greatest(0, coalesce(reputation, 0) + delta) where id = target_user;
end;
$$;
