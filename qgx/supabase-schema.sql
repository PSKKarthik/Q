-- ============================================================
-- QGX DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- PROFILES (extends Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  role text not null check (role in ('admin','teacher','student')),
  avatar text default '??',
  phone text,
  bio text,
  subject text,
  grade text,
  qgx_id text unique,
  xp integer default 0,
  score integer default 0,
  ghost_wins integer default 0,
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
  type text check (type in ('pdf','video','image','doc')),
  url text,
  teacher_id uuid references profiles(id),
  uploaded_at timestamptz default now()
);

-- ENROLLMENTS
create table if not exists enrollments (
  student_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  primary key (student_id, course_id)
);

-- ASSIGNMENTS
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  course_id uuid references courses(id) on delete cascade,
  teacher_id uuid references profiles(id),
  teacher_name text,
  due_date date,
  created_at timestamptz default now()
);

-- SUBMISSIONS
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  file_name text,
  grade text,
  submitted_at timestamptz default now(),
  unique(assignment_id, student_id)
);

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

-- PLATFORM SETTINGS
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null
);
insert into platform_settings (key, value) 
  values ('double_xp', '{"active":false,"ends_at":null}')
  on conflict (key) do nothing;

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
alter table platform_settings enable row level security;

-- Profiles
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Announcements
create policy "announcements_select" on announcements for select using (true);
create policy "announcements_insert" on announcements for insert with check (auth.role() = 'authenticated');
create policy "announcements_delete" on announcements for delete using (auth.uid() = author_id);

-- Tests
create policy "tests_select" on tests for select using (true);
create policy "tests_insert" on tests for insert with check (auth.role() = 'authenticated');
create policy "tests_update" on tests for update using (auth.uid() = teacher_id);
create policy "tests_delete" on tests for delete using (auth.uid() = teacher_id);

-- Questions
create policy "questions_select" on questions for select using (true);
create policy "questions_insert" on questions for insert with check (auth.role() = 'authenticated');
create policy "questions_delete" on questions for delete using (auth.role() = 'authenticated');

-- Attempts
create policy "attempts_select" on attempts for select using (auth.uid() = student_id);
create policy "attempts_insert" on attempts for insert with check (auth.uid() = student_id);
create policy "attempts_select_teacher" on attempts for select using (
  exists (select 1 from tests where tests.id = attempts.test_id and tests.teacher_id = auth.uid())
);

-- Courses
create policy "courses_select" on courses for select using (true);
create policy "courses_insert" on courses for insert with check (auth.role() = 'authenticated');
create policy "courses_update" on courses for update using (auth.uid() = teacher_id);

-- Course files
create policy "course_files_select" on course_files for select using (true);
create policy "course_files_insert" on course_files for insert with check (auth.role() = 'authenticated');
create policy "course_files_delete" on course_files for delete using (auth.uid() = teacher_id);

-- Enrollments
create policy "enrollments_select" on enrollments for select using (true);
create policy "enrollments_insert" on enrollments for insert with check (auth.role() = 'authenticated');

-- Assignments
create policy "assignments_select" on assignments for select using (true);
create policy "assignments_insert" on assignments for insert with check (auth.role() = 'authenticated');

-- Submissions
create policy "submissions_select" on submissions for select using (
  auth.uid() = student_id or
  exists (select 1 from assignments where assignments.id = submissions.assignment_id and assignments.teacher_id = auth.uid())
);
create policy "submissions_insert" on submissions for insert with check (auth.uid() = student_id);

-- Timetable
create policy "timetable_select" on timetable for select using (true);
create policy "timetable_insert" on timetable for insert with check (auth.role() = 'authenticated');

-- Notifications
create policy "notifications_select" on notifications for select using (auth.uid() = user_id);
create policy "notifications_insert" on notifications for insert with check (auth.role() = 'authenticated');
create policy "notifications_update" on notifications for update using (auth.uid() = user_id);

-- Activity log
create policy "activity_log_select" on activity_log for select using (true);
create policy "activity_log_insert" on activity_log for insert with check (auth.role() = 'authenticated');

-- Platform settings
create policy "platform_settings_select" on platform_settings for select using (true);
create policy "platform_settings_update" on platform_settings for update using (auth.role() = 'authenticated');

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
