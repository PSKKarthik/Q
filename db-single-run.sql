-- ============================================================
-- QGX DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- STORAGE BUCKET (for course files, attachments, forum uploads)
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('course-files', 'course-files', true)
  on conflict (id) do update set public = false;

-- Allow authenticated users to upload files
drop policy if exists "course_files_upload" on storage.objects;
create policy "course_files_upload" on storage.objects for insert
  with check (bucket_id = 'course-files' and auth.role() = 'authenticated');

-- Allow authenticated read access (QGX-005 fix: was public)
drop policy if exists "course_files_read" on storage.objects;
create policy "course_files_read" on storage.objects for select
  using (bucket_id = 'course-files' and auth.role() = 'authenticated');

-- Allow users to delete their own uploads
drop policy if exists "course_files_delete" on storage.objects;
create policy "course_files_delete" on storage.objects for delete
    using (
      bucket_id = 'course-files'
      and (
        auth.uid()::text = (storage.foldername(name))[1]
        or (
          (storage.foldername(name))[1] = 'avatars'
          and auth.uid()::text = (storage.foldername(name))[2]
        )
      )
    );

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
  target text default 'all' check (target in ('all','teachers','students','parents')),
  pinned boolean default false,
  updated_at timestamptz default now(),
  expires_at timestamptz,
  created_at timestamptz default now()
);

alter table announcements add column if not exists updated_at timestamptz default now();
alter table announcements add column if not exists expires_at timestamptz;
alter table announcements drop constraint if exists announcements_title_not_empty;
alter table announcements add constraint announcements_title_not_empty check (length(btrim(title)) > 0);
alter table announcements drop constraint if exists announcements_title_max_len;
alter table announcements add constraint announcements_title_max_len check (length(title) <= 180);
alter table announcements drop constraint if exists announcements_body_max_len;
alter table announcements add constraint announcements_body_max_len check (body is null or length(body) <= 5000);

create or replace function public.normalize_announcement_entry()
returns trigger as $$
begin
  new.title := left(btrim(coalesce(new.title, '')), 180);
  if new.title = '' then
    raise exception 'announcements.title cannot be empty';
  end if;

  if new.body is not null then
    new.body := left(new.body, 5000);
  end if;

  new.target := coalesce(new.target, 'all');
  if new.target not in ('all','teachers','students','parents') then
    new.target := 'all';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists announcements_normalize_trigger on announcements;
create trigger announcements_normalize_trigger
  before insert or update on announcements
  for each row execute procedure public.normalize_announcement_entry();

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

-- CALENDAR: PERSONAL EVENTS, REMINDERS, PREFERENCES
create table if not exists personal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  end_time time,
  all_day boolean not null default false,
  type text not null default 'personal' check (type in ('personal','study','meeting','deadline')),
  color text default '#3b82f6',
  location text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists personal_event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references personal_events(id) on delete cascade,
  remind_before_minutes integer not null check (remind_before_minutes in (5,10,15,30,60,120,1440)),
  channel text not null default 'in_app' check (channel in ('in_app','email')),
  created_at timestamptz not null default now(),
  unique(event_id, remind_before_minutes, channel)
);

create table if not exists calendar_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  default_view text not null default 'month' check (default_view in ('month','week','day')),
  week_starts_on text not null default 'monday' check (week_starts_on in ('sunday','monday')),
  show_tests boolean not null default true,
  show_assignments boolean not null default true,
  show_classes boolean not null default true,
  show_personal boolean not null default true,
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

create or replace function public.set_personal_events_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists personal_events_set_updated_at on personal_events;
create trigger personal_events_set_updated_at
  before update on personal_events
  for each row execute procedure public.set_personal_events_updated_at();

create or replace function public.set_calendar_preferences_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists calendar_preferences_set_updated_at on calendar_preferences;
create trigger calendar_preferences_set_updated_at
  before update on calendar_preferences
  for each row execute procedure public.set_calendar_preferences_updated_at();

-- NOTIFICATIONS
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  message text not null,
  type text default 'info',
  read boolean default false,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
drop policy if exists "notifications_select" on notifications;
create policy "notifications_select" on notifications for select using (auth.uid() = user_id);
drop policy if exists "notifications_insert" on notifications;
create policy "notifications_insert" on notifications for insert with check (auth.role() = 'authenticated');
drop policy if exists "notifications_update" on notifications;
create policy "notifications_update" on notifications for update using (auth.uid() = user_id);
drop policy if exists "notifications_delete" on notifications;
create policy "notifications_delete" on notifications for delete using (auth.uid() = user_id);
create index if not exists idx_notifications_user on notifications(user_id);

-- ACTIVITY LOG
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  type text default 'info',
  created_at timestamptz default now()
);

alter table activity_log add column if not exists actor_id uuid references profiles(id) on delete set null;
alter table activity_log add column if not exists metadata jsonb default '{}'::jsonb;
alter table activity_log drop constraint if exists activity_log_message_not_empty;
alter table activity_log add constraint activity_log_message_not_empty check (length(btrim(message)) > 0);
alter table activity_log drop constraint if exists activity_log_message_max_len;
alter table activity_log add constraint activity_log_message_max_len check (length(message) <= 500);
alter table activity_log drop constraint if exists activity_log_type_format;
alter table activity_log add constraint activity_log_type_format check (type ~ '^[a-z0-9_]{1,48}$');

create or replace function public.normalize_activity_log_entry()
returns trigger as $$
begin
  new.message := left(btrim(coalesce(new.message, '')), 500);
  if new.message = '' then
    raise exception 'activity_log.message cannot be empty';
  end if;

  new.type := lower(regexp_replace(coalesce(new.type, 'info'), '[^a-zA-Z0-9_]+', '_', 'g'));
  new.type := left(trim(both '_' from new.type), 48);
  if new.type = '' then
    new.type := 'info';
  end if;

  if new.metadata is null then
    new.metadata := '{}'::jsonb;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists activity_log_normalize_trigger on activity_log;
create trigger activity_log_normalize_trigger
  before insert or update on activity_log
  for each row execute procedure public.normalize_activity_log_entry();

-- FORUM POSTS
create table if not exists forum_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  author_id uuid references profiles(id) on delete cascade,
  author_name text,
  author_role text default 'student',
  likes uuid[] default '{}',
  bookmarks uuid[] default '{}',
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
  likes uuid[] default '{}',
  is_best_answer boolean default false,
  created_at timestamptz default now()
);

-- PLATFORM SETTINGS
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null
);

-- One-time reward guards
create table if not exists course_completion_rewards (
  student_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  awarded_at timestamptz default now(),
  primary key (student_id, course_id)
);

create table if not exists daily_xp_claims (
  student_id uuid references profiles(id) on delete cascade,
  claim_date date not null,
  xp_awarded integer not null default 0,
  created_at timestamptz default now(),
  primary key (student_id, claim_date)
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
alter table personal_events enable row level security;
alter table personal_event_reminders enable row level security;
alter table calendar_preferences enable row level security;
alter table activity_log enable row level security;
alter table forum_posts enable row level security;
alter table forum_comments enable row level security;
alter table platform_settings enable row level security;
alter table course_progress enable row level security;
alter table course_ratings enable row level security;
alter table course_completion_rewards enable row level security;
alter table daily_xp_claims enable row level security;

-- Migration: add bookmarks, best_answer_id, is_best_answer for existing databases
alter table forum_posts add column if not exists bookmarks uuid[] default '{}';
do $$
declare
  v_post_likes_type text;
  v_post_bookmarks_type text;
  v_comment_likes_type text;
begin
  select udt_name into v_post_likes_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'forum_posts' and column_name = 'likes';

  if v_post_likes_type = '_text' then
    alter table forum_posts add column if not exists likes_uuid uuid[] default '{}'::uuid[];
    update forum_posts
    set likes_uuid = coalesce(likes, '{}'::text[])::uuid[];
    alter table forum_posts drop column likes;
    alter table forum_posts rename column likes_uuid to likes;
  elsif v_post_likes_type is null then
    alter table forum_posts add column likes uuid[] default '{}'::uuid[];
  else
    alter table forum_posts alter column likes set default '{}'::uuid[];
  end if;

  select udt_name into v_post_bookmarks_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'forum_posts' and column_name = 'bookmarks';

  if v_post_bookmarks_type = '_text' then
    alter table forum_posts add column if not exists bookmarks_uuid uuid[] default '{}'::uuid[];
    update forum_posts
    set bookmarks_uuid = coalesce(bookmarks, '{}'::text[])::uuid[];
    alter table forum_posts drop column bookmarks;
    alter table forum_posts rename column bookmarks_uuid to bookmarks;
  elsif v_post_bookmarks_type is null then
    alter table forum_posts add column bookmarks uuid[] default '{}'::uuid[];
  else
    alter table forum_posts alter column bookmarks set default '{}'::uuid[];
  end if;

  select udt_name into v_comment_likes_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'forum_comments' and column_name = 'likes';

  if v_comment_likes_type = '_text' then
    alter table forum_comments add column if not exists likes_uuid uuid[] default '{}'::uuid[];
    update forum_comments
    set likes_uuid = coalesce(likes, '{}'::text[])::uuid[];
    alter table forum_comments drop column likes;
    alter table forum_comments rename column likes_uuid to likes;
  elsif v_comment_likes_type is null then
    alter table forum_comments add column likes uuid[] default '{}'::uuid[];
  else
    alter table forum_comments alter column likes set default '{}'::uuid[];
  end if;
end $$;
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
-- Admin: insert profiles for newly created users
drop policy if exists "profiles_insert_admin" on profiles;
create policy "profiles_insert_admin" on profiles for insert with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
-- Admin: update any profile (e.g. edit user from admin panel)
drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

-- Announcements
drop policy if exists "announcements_select" on announcements;
create policy "announcements_select" on announcements for select using (
  (
    auth.uid() = author_id
    or exists (
      select 1
      from profiles
      where profiles.id = auth.uid()
        and (
          profiles.role = 'admin'
          or target = 'all'
          or (profiles.role = 'teacher' and target = 'teachers')
          or (profiles.role = 'student' and target = 'students')
          or (profiles.role = 'parent' and target = 'parents')
        )
    )
  )
  and (
    expires_at is null
    or expires_at > now()
    or auth.uid() = author_id
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  )
);
drop policy if exists "announcements_insert" on announcements;
create policy "announcements_insert" on announcements for insert with check (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin','teacher')
  )
);
drop policy if exists "announcements_update" on announcements;
create policy "announcements_update" on announcements for update using (
  auth.uid() = author_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
) with check (
  auth.uid() = author_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
drop policy if exists "announcements_delete" on announcements;
create policy "announcements_delete" on announcements for delete using (
  auth.uid() = author_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

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

-- Course completion rewards (read own, insert own)
drop policy if exists "course_completion_rewards_select" on course_completion_rewards;
create policy "course_completion_rewards_select" on course_completion_rewards for select using (auth.uid() = student_id);
drop policy if exists "course_completion_rewards_insert" on course_completion_rewards;
create policy "course_completion_rewards_insert" on course_completion_rewards for insert with check (auth.uid() = student_id);

-- Daily XP claims (read own, insert own)
drop policy if exists "daily_xp_claims_select" on daily_xp_claims;
create policy "daily_xp_claims_select" on daily_xp_claims for select using (auth.uid() = student_id);
drop policy if exists "daily_xp_claims_insert" on daily_xp_claims;
create policy "daily_xp_claims_insert" on daily_xp_claims for insert with check (auth.uid() = student_id);

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

-- Calendar personal events
drop policy if exists "personal_events_select" on personal_events;
create policy "personal_events_select" on personal_events for select using (auth.uid() = user_id);
drop policy if exists "personal_events_insert" on personal_events;
create policy "personal_events_insert" on personal_events for insert with check (auth.uid() = user_id);
drop policy if exists "personal_events_update" on personal_events;
create policy "personal_events_update" on personal_events for update using (auth.uid() = user_id);
drop policy if exists "personal_events_delete" on personal_events;
create policy "personal_events_delete" on personal_events for delete using (auth.uid() = user_id);

-- Calendar reminders
drop policy if exists "personal_event_reminders_select" on personal_event_reminders;
create policy "personal_event_reminders_select" on personal_event_reminders for select using (
  exists (
    select 1 from personal_events
    where personal_events.id = personal_event_reminders.event_id
      and personal_events.user_id = auth.uid()
  )
);
drop policy if exists "personal_event_reminders_insert" on personal_event_reminders;
create policy "personal_event_reminders_insert" on personal_event_reminders for insert with check (
  exists (
    select 1 from personal_events
    where personal_events.id = personal_event_reminders.event_id
      and personal_events.user_id = auth.uid()
  )
);
drop policy if exists "personal_event_reminders_update" on personal_event_reminders;
create policy "personal_event_reminders_update" on personal_event_reminders for update using (
  exists (
    select 1 from personal_events
    where personal_events.id = personal_event_reminders.event_id
      and personal_events.user_id = auth.uid()
  )
);
drop policy if exists "personal_event_reminders_delete" on personal_event_reminders;
create policy "personal_event_reminders_delete" on personal_event_reminders for delete using (
  exists (
    select 1 from personal_events
    where personal_events.id = personal_event_reminders.event_id
      and personal_events.user_id = auth.uid()
  )
);

-- Calendar preferences
drop policy if exists "calendar_preferences_select" on calendar_preferences;
create policy "calendar_preferences_select" on calendar_preferences for select using (auth.uid() = user_id);
drop policy if exists "calendar_preferences_upsert" on calendar_preferences;
create policy "calendar_preferences_upsert" on calendar_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Activity log (QGX-003 fix: was public, now admin-only read)
drop policy if exists "activity_log_select" on activity_log;
create policy "activity_log_select" on activity_log for select using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);
drop policy if exists "activity_log_insert" on activity_log;
create policy "activity_log_insert" on activity_log for insert with check (
  auth.role() = 'authenticated'
  and coalesce(actor_id, auth.uid()) = auth.uid()
);

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
-- Toggle ON for: announcements, attempts, tests, activity_log

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
-- TRIGGER: Keep announcements.updated_at fresh
-- ============================================================
create or replace function public.set_announcements_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists announcements_set_updated_at on announcements;
create trigger announcements_set_updated_at
  before update on announcements
  for each row execute procedure public.set_announcements_updated_at();

-- ============================================================
-- RPC: Atomic toggle like on forum posts
-- ============================================================
drop function if exists public.toggle_forum_like(uuid, uuid);
create or replace function public.toggle_forum_like(post_id uuid, user_id uuid)
returns uuid[] as $$
declare
  current_likes uuid[];
begin
  select coalesce(likes, '{}'::uuid[]) into current_likes from forum_posts where id = post_id for update;
  if user_id = any(current_likes) then
    update forum_posts set likes = array_remove(current_likes, user_id) where id = post_id
      returning likes into current_likes;
  else
    update forum_posts set likes = array_append(current_likes, user_id) where id = post_id
      returning likes into current_likes;
  end if;
  return current_likes;
end;
$$ language plpgsql security definer;

grant execute on function public.toggle_forum_like(uuid, uuid) to authenticated;

-- ============================================================
-- RPC: Atomic toggle bookmark on forum posts
-- ============================================================
drop function if exists public.toggle_forum_bookmark(uuid, uuid);
create or replace function public.toggle_forum_bookmark(p_post_id uuid, p_user_id uuid)
returns uuid[] as $$
declare
  current_bookmarks uuid[];
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  select coalesce(bookmarks, '{}'::uuid[]) into current_bookmarks
  from forum_posts
  where id = p_post_id
  for update;

  if p_user_id = any(current_bookmarks) then
    update forum_posts
    set bookmarks = array_remove(current_bookmarks, p_user_id)
    where id = p_post_id
    returning bookmarks into current_bookmarks;
  else
    update forum_posts
    set bookmarks = array_append(current_bookmarks, p_user_id)
    where id = p_post_id
    returning bookmarks into current_bookmarks;
  end if;

  return coalesce(current_bookmarks, '{}'::uuid[]);
end;
$$ language plpgsql security definer;

grant execute on function public.toggle_forum_bookmark(uuid, uuid) to authenticated;

-- ============================================================
-- RPC: Toggle pin on forum posts (admin / teacher only)
-- ============================================================
create or replace function public.toggle_forum_pin(p_post_id uuid)
returns boolean as $$
declare
  caller_role text;
  new_pinned boolean;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role not in ('admin', 'teacher') then
    raise exception 'not authorized';
  end if;
  update forum_posts set pinned = not pinned where id = p_post_id returning pinned into new_pinned;
  return coalesce(new_pinned, false);
end;
$$ language plpgsql security definer;

grant execute on function public.toggle_forum_pin(uuid) to authenticated;

-- ============================================================
-- RPC: Admin delete forum post (admin / teacher only)
-- ============================================================
create or replace function public.admin_delete_forum_post(p_post_id uuid)
returns void as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role not in ('admin', 'teacher') then
    raise exception 'not authorized';
  end if;
  delete from forum_posts where id = p_post_id;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_delete_forum_post(uuid) to authenticated;

-- ============================================================
-- RPC: Admin delete forum comment (admin / teacher only)
-- ============================================================
create or replace function public.admin_delete_forum_comment(p_comment_id uuid)
returns void as $$
declare
  caller_role text;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role not in ('admin', 'teacher') then
    raise exception 'not authorized';
  end if;
  delete from forum_comments where id = p_comment_id;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_delete_forum_comment(uuid) to authenticated;

-- ============================================================
-- RPC: Atomic toggle like on forum comments
-- ============================================================
drop function if exists public.toggle_comment_like(uuid, uuid);
create or replace function public.toggle_comment_like(comment_id uuid, user_id uuid)
returns uuid[] as $$
declare
  current_likes uuid[];
begin
  select coalesce(likes, '{}'::uuid[]) into current_likes from forum_comments where id = comment_id for update;
  if user_id = any(current_likes) then
    update forum_comments set likes = array_remove(current_likes, user_id) where id = comment_id
      returning likes into current_likes;
  else
    update forum_comments set likes = array_append(current_likes, user_id) where id = comment_id
      returning likes into current_likes;
  end if;
  return current_likes;
end;
$$ language plpgsql security definer;

grant execute on function public.toggle_comment_like(uuid, uuid) to authenticated;

-- ============================================================
-- RPC: Increment view count atomically
-- ============================================================
create or replace function public.increment_view_count(p_post_id uuid)
returns void as $$
begin
  update forum_posts set view_count = view_count + 1 where id = p_post_id;
end;
$$ language plpgsql security definer;

grant execute on function public.increment_view_count(uuid) to authenticated;

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

grant execute on function public.atomic_xp_update(uuid, int, int, int) to authenticated;

-- ============================================================
-- RPC: Award course completion XP once per student/course
-- ============================================================
create or replace function public.award_course_completion_xp(
  p_user_id uuid,
  p_course_id uuid,
  p_xp_delta int
)
returns boolean as $$
declare
  inserted integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  if p_xp_delta > 500 then p_xp_delta := 500; end if;
  if p_xp_delta < 0 then p_xp_delta := 0; end if;

  insert into course_completion_rewards (student_id, course_id)
  values (p_user_id, p_course_id)
  on conflict do nothing;

  get diagnostics inserted = row_count;

  if inserted > 0 then
    update profiles
      set xp = greatest(0, coalesce(xp, 0) + p_xp_delta)
    where id = p_user_id;
    return true;
  end if;

  return false;
end;
$$ language plpgsql security definer;

grant execute on function public.award_course_completion_xp(uuid, uuid, int) to authenticated;

-- ============================================================
-- RPC: Claim daily login XP once per day (server-authoritative)
-- ============================================================
create or replace function public.claim_daily_login_xp(
  p_user_id uuid,
  p_claim_date date,
  p_xp_delta int
)
returns jsonb as $$
declare
  inserted integer;
  v_new_xp integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  if p_xp_delta > 500 then p_xp_delta := 500; end if;
  if p_xp_delta < 0 then p_xp_delta := 0; end if;

  insert into daily_xp_claims (student_id, claim_date, xp_awarded)
  values (p_user_id, p_claim_date, p_xp_delta)
  on conflict do nothing;

  get diagnostics inserted = row_count;

  if inserted > 0 then
    update profiles
      set xp = greatest(0, coalesce(xp, 0) + p_xp_delta)
    where id = p_user_id
    returning xp into v_new_xp;

    return jsonb_build_object('claimed', true, 'xp', coalesce(v_new_xp, 0));
  end if;

  select xp into v_new_xp from profiles where id = p_user_id;
  return jsonb_build_object('claimed', false, 'xp', coalesce(v_new_xp, 0));
end;
$$ language plpgsql security definer;

grant execute on function public.claim_daily_login_xp(uuid, date, int) to authenticated;

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
create index if not exists idx_course_files_course on course_files(course_id);
create index if not exists idx_submissions_assignment on submissions(assignment_id);
create index if not exists idx_submissions_student on submissions(student_id);
create index if not exists idx_forum_posts_author on forum_posts(author_id);
create index if not exists idx_forum_comments_post on forum_comments(post_id);
create index if not exists idx_course_progress_student on course_progress(student_id);
create index if not exists idx_personal_events_user_date on personal_events(user_id, event_date);
create index if not exists idx_personal_events_user_datetime on personal_events(user_id, event_date, start_time);
create index if not exists idx_personal_event_reminders_event on personal_event_reminders(event_id);
create index if not exists idx_activity_log_created on activity_log(created_at desc);
create index if not exists idx_activity_log_actor_created on activity_log(actor_id, created_at desc);
create index if not exists idx_activity_log_type_created on activity_log(type, created_at desc);
create index if not exists idx_daily_xp_claims_student_date on daily_xp_claims(student_id, claim_date desc);
create index if not exists idx_announcements_created_at on announcements(created_at desc);
create index if not exists idx_announcements_pinned_created on announcements(pinned desc, created_at desc);
create index if not exists idx_announcements_target_created on announcements(target, created_at desc);
create index if not exists idx_announcements_expires_at on announcements(expires_at);

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

-- Extend anti-cheat defaults for result/review control
alter table tests alter column anti_cheat set default '{
  "tabSwitch":false,
  "copyPaste":false,
  "randomQ":false,
  "randomOpts":false,
  "fullscreen":false,
  "timePerQ":0,
  "maxAttempts":1,
  "allowImmediateReview":false,
  "requireAllAnswered":false
}'::jsonb;

update tests
set anti_cheat = coalesce(anti_cheat, '{}'::jsonb)
  || jsonb_build_object(
    'allowImmediateReview', coalesce(anti_cheat->'allowImmediateReview', 'false'::jsonb),
    'requireAllAnswered', coalesce(anti_cheat->'requireAllAnswered', 'false'::jsonb)
  );

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

grant execute on function public.generate_qgx_id(text) to authenticated;

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

-- Re-apply messages policies after group upgrades so group chat is authorized correctly
drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages for select using (
  (group_id is null and (auth.uid() = sender_id or auth.uid() = receiver_id))
  or
  (group_id is not null and exists (
    select 1 from message_groups
    where message_groups.id = messages.group_id
      and auth.uid()::text = any(message_groups.member_ids)
  ))
);

drop policy if exists "messages_insert" on messages;
create policy "messages_insert" on messages for insert with check (
  auth.uid() = sender_id
  and (
    (group_id is null and receiver_id is not null)
    or
    (group_id is not null and exists (
      select 1 from message_groups
      where message_groups.id = messages.group_id
        and auth.uid()::text = any(message_groups.member_ids)
    ))
  )
);

-- QGX-001 fix: split update into sender vs receiver policies
drop policy if exists "messages_update" on messages;
drop policy if exists "messages_update_sender" on messages;
create policy "messages_update_sender" on messages for update using (
  auth.uid() = sender_id
);

drop policy if exists "messages_update_receiver" on messages;
create policy "messages_update_receiver" on messages for update using (
  (group_id is null and auth.uid() = receiver_id)
  or
  (group_id is not null and exists (
    select 1 from message_groups
    where message_groups.id = messages.group_id
      and auth.uid()::text = any(message_groups.member_ids)
  ))
);

-- Trigger: prevent non-senders from mutating message content
create or replace function public.protect_message_fields()
returns trigger as $$
begin
  if auth.uid() <> OLD.sender_id then
    NEW.body := OLD.body;
    NEW.deleted := OLD.deleted;
    NEW.edited_at := OLD.edited_at;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_message_fields_trigger on messages;
create trigger protect_message_fields_trigger
  before update on messages
  for each row execute procedure public.protect_message_fields();

create index if not exists idx_messages_group on messages(group_id);

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
-- QGX-002 fix: parents scoped to linked children only
drop policy if exists "report_comments_select" on report_comments;
create policy "report_comments_select" on report_comments for select using (
  auth.uid() = student_id or auth.uid() = teacher_id
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  or exists (
    select 1 from parent_students
    where parent_students.parent_id = auth.uid()
      and parent_students.student_id = report_comments.student_id
  )
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
  subject text,
  room_id text,
  room_url text,
  scheduled_at timestamptz not null,
  duration integer default 60,
  status text default 'scheduled' check (status in ('scheduled','live','ended')),
  created_at timestamptz default now()
);

alter table live_classes add column if not exists subject text;
alter table live_classes add column if not exists room_id text;

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

alter table quests drop constraint if exists quests_title_not_empty;
alter table quests add constraint quests_title_not_empty check (length(btrim(title)) > 0);
alter table quests drop constraint if exists quests_title_max_len;
alter table quests add constraint quests_title_max_len check (length(title) <= 180);
alter table quests drop constraint if exists quests_target_count_positive;
alter table quests add constraint quests_target_count_positive check (target_count >= 1);
alter table quests drop constraint if exists quests_xp_reward_positive;
alter table quests add constraint quests_xp_reward_positive check (xp_reward >= 1 and xp_reward <= 5000);

create or replace function public.normalize_quest_entry()
returns trigger as $$
begin
  new.title := left(btrim(coalesce(new.title, '')), 180);
  if new.title = '' then
    raise exception 'quests.title cannot be empty';
  end if;

  if new.description is not null then
    new.description := left(new.description, 1000);
  end if;

  if new.target_count is null or new.target_count < 1 then
    new.target_count := 1;
  end if;

  if new.xp_reward is null or new.xp_reward < 1 then
    new.xp_reward := 1;
  end if;

  if new.xp_reward > 5000 then
    new.xp_reward := 5000;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists quests_normalize_trigger on quests;
create trigger quests_normalize_trigger
  before insert or update on quests
  for each row execute procedure public.normalize_quest_entry();

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

-- QUEST AUTOMATION: Initialize progress for all students when a new quest is created
create or replace function public.init_quest_progress_for_all()
returns trigger as $$
begin
  insert into quest_progress (student_id, quest_id, progress, completed, claimed)
  select id, new.id, 0, false, false from profiles where role = 'student'
  on conflict (student_id, quest_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists quests_init_progress_trigger on quests;
create trigger quests_init_progress_trigger
  after insert on quests
  for each row execute procedure public.init_quest_progress_for_all();

-- Auto-increment quest_progress when test attempt is submitted
create or replace function public.update_quest_on_test_attempt()
returns trigger as $$
begin
  if new.score is not null and new.score >= 0 then
    update quest_progress
    set progress = progress + 1,
        completed = (progress + 1) >= (select target_count from quests where id = quest_progress.quest_id and target_type = 'test'),
        completed_at = case when (progress + 1) >= (select target_count from quests where id = quest_progress.quest_id and target_type = 'test') then now() else completed_at end
    where student_id = new.student_id
      and quest_id in (select id from quests where target_type = 'test' and active = true);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists quests_test_attempt_trigger on attempts;
create trigger quests_test_attempt_trigger
  after insert on attempts
  for each row execute procedure public.update_quest_on_test_attempt();

-- Auto-increment quest_progress when assignment is submitted
create or replace function public.update_quest_on_assignment_submit()
returns trigger as $$
begin
  if new.is_draft = false then
    update quest_progress
    set progress = progress + 1,
        completed = (progress + 1) >= (select target_count from quests where id = quest_progress.quest_id and target_type = 'course'),
        completed_at = case when (progress + 1) >= (select target_count from quests where id = quest_progress.quest_id and target_type = 'course') then now() else completed_at end
    where student_id = new.student_id
      and quest_id in (select id from quests where target_type = 'course' and active = true);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists quests_assignment_trigger on submissions;
create trigger quests_assignment_trigger
  after insert or update on submissions
  for each row execute procedure public.update_quest_on_assignment_submit();

-- Auto-increment quest_progress for forum posts (social quest)
create or replace function public.update_quest_on_forum_post()
returns trigger as $$
begin
  update quest_progress
  set progress = progress + 1,
      completed = (progress + 1) >= (select target_count from quests where id = quest_progress.quest_id and target_type = 'social'),
      completed_at = case when (progress + 1) >= (select target_count from quests where id = quest_progress.quest_id and target_type = 'social') then now() else completed_at end
  where student_id = new.author_id
    and quest_id in (select id from quests where target_type = 'social' and active = true);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists quests_forum_post_trigger on forum_posts;
create trigger quests_forum_post_trigger
  after insert on forum_posts
  for each row execute procedure public.update_quest_on_forum_post();

-- Auto-increment quest_progress on XP gain (via atomic_xp_update)
create or replace function public.update_quest_on_xp_gain()
returns trigger as $$
begin
  if new.xp > old.xp then
    update quest_progress
    set progress = progress + 1,
        completed = (progress + 1) >= (select target_count from quests where id = quest_progress.quest_id and target_type = 'xp'),
        completed_at = case when (progress + 1) >= (select target_count from quests where id = quest_progress.quest_id and target_type = 'xp') then now() else completed_at end
    where student_id = new.id
      and quest_id in (select id from quests where target_type = 'xp' and active = true);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists quests_xp_gain_trigger on profiles;
create trigger quests_xp_gain_trigger
  after update on profiles
  for each row execute procedure public.update_quest_on_xp_gain();

-- Performance indexes for quest queries
create index if not exists idx_quests_active_type on quests(active, type);
create index if not exists idx_quest_progress_student on quest_progress(student_id);
create index if not exists idx_quest_progress_quest on quest_progress(quest_id);
create index if not exists idx_quest_progress_student_quest on quest_progress(student_id, quest_id);
create index if not exists idx_quest_progress_completed on quest_progress(completed, completed_at);

-- ============================================================
-- PARENT-TEACHER MEETING SLOTS
-- ============================================================
create table if not exists meeting_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references profiles(id) on delete cascade,
  teacher_name text,
  date text not null,
  time text,
  start_time text,
  end_time text,
  duration integer default 15,
  booked_by uuid references profiles(id) on delete set null,
  booked_name text,
  parent_name text,
  student_id uuid references profiles(id) on delete set null,
  status text default 'available' check (status in ('available','booked','completed','cancelled')),
  created_at timestamptz default now()
);

alter table meeting_slots alter column time drop not null;
alter table meeting_slots add column if not exists start_time text;
alter table meeting_slots add column if not exists end_time text;
alter table meeting_slots add column if not exists parent_name text;

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
alter table collaboration_rooms add column if not exists subject text default '';
alter table collaboration_rooms add column if not exists created_by uuid references profiles(id);
alter table collaboration_rooms add column if not exists creator_name text;
alter table collaboration_rooms add column if not exists is_active boolean default true;
alter table collaboration_rooms add column if not exists created_at timestamptz default now();
update collaboration_rooms set is_active = true where is_active is null;
alter table collaboration_rooms enable row level security;
drop policy if exists "collab_rooms_read" on collaboration_rooms;
create policy "collab_rooms_read" on collaboration_rooms for select using (true);
drop policy if exists "collab_rooms_create" on collaboration_rooms;
create policy "collab_rooms_create" on collaboration_rooms for insert with check (auth.uid() = created_by);
drop policy if exists "collab_rooms_update" on collaboration_rooms;
create policy "collab_rooms_update" on collaboration_rooms for update using (
  auth.uid() = created_by
  or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
);

create table if not exists room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references collaboration_rooms(id) on delete cascade,
  user_id uuid references profiles(id),
  user_name text not null,
  content text not null,
  created_at timestamptz default now()
);
alter table room_messages add column if not exists room_id uuid references collaboration_rooms(id) on delete cascade;
alter table room_messages add column if not exists user_id uuid references profiles(id);
alter table room_messages add column if not exists user_name text;
alter table room_messages add column if not exists content text;
alter table room_messages add column if not exists created_at timestamptz default now();
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

-- Enable realtime for messaging
do $$ begin
  alter publication supabase_realtime add table messages;
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

grant execute on function public.increment_reputation(uuid, integer) to authenticated;

-- ============================================================
-- APPENDIX HOTFIXES (safe to run multiple times)
-- ============================================================

ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_target_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_target_check
  CHECK (target IN ('all', 'teachers', 'students', 'parents'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE TABLE IF NOT EXISTS plagiarism_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES assignments(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  student_a_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  student_b_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  submission_a_id uuid REFERENCES submissions(id) ON DELETE SET NULL,
  submission_b_id uuid REFERENCES submissions(id) ON DELETE SET NULL,
  similarity integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  shared_phrases jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE plagiarism_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plagiarism_flags_select" ON plagiarism_flags;
CREATE POLICY "plagiarism_flags_select" ON plagiarism_flags FOR SELECT USING (
  auth.uid() = teacher_id
  OR EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);
DROP POLICY IF EXISTS "plagiarism_flags_insert" ON plagiarism_flags;
CREATE POLICY "plagiarism_flags_insert" ON plagiarism_flags FOR INSERT WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "plagiarism_flags_update" ON plagiarism_flags;
CREATE POLICY "plagiarism_flags_update" ON plagiarism_flags FOR UPDATE USING (auth.uid() = teacher_id);
