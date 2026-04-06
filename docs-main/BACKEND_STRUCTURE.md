# BACKEND_STRUCTURE.md — QGX LMS Backend Reference

> **Source of truth:** Derived directly from supabase-schema.sql, all API routes,
> middleware.ts, lib/actions.ts, lib/constants.ts, and types/index.ts.
> Every table, field, endpoint, and policy listed here maps 1:1 to code.

---

## TABLE OF CONTENTS

1. [Architecture](#1-architecture)
2. [Database Schema](#2-database-schema)
3. [API Endpoints](#3-api-endpoints)
4. [Business Logic](#4-business-logic)
5. [Error Handling](#5-error-handling)
6. [Security](#6-security)

---

## 1. ARCHITECTURE

### 1.1 Folder Structure

```
qgx-nextjs/
├── app/
│   ├── api/                        ← Server-side API routes (Next.js Route Handlers)
│   │   ├── ai/route.ts             ← AI tutor + question generation (POST)
│   │   ├── batch-create-user/      ← Admin user creation (POST)
│   │   ├── delete-user/            ← Admin user deletion (POST)
│   │   ├── quests/route.ts         ← Quest management (GET/POST/PATCH/DELETE)
│   │   └── submit-test/route.ts    ← Test grading + XP award (POST)
│   ├── auth/
│   │   └── callback/route.ts       ← OAuth / email link code exchange (GET)
│   ├── dashboard/                  ← Client-side dashboard SPAs per role
│   │   ├── admin/page.tsx
│   │   ├── student/page.tsx
│   │   ├── teacher/page.tsx
│   │   └── parent/page.tsx
│   └── ...                         ← Public pages (login, register, etc.)
├── lib/
│   ├── actions.ts                  ← Server-callable helpers (logActivity, pushNotification)
│   ├── constants.ts                ← Shared backend constants
│   ├── supabase.ts                 ← Client-side Supabase singleton
│   └── utils.ts                   ← Shared utility functions
├── middleware.ts                   ← Next.js edge middleware (auth + role guard)
├── types/index.ts                  ← Full TypeScript type definitions
└── supabase-schema.sql             ← Complete Postgres schema with RLS, RPCs, triggers
```

### 1.2 Layer Separation

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (Browser)                                           │
│  Next.js 'use client' components — dashboard pages         │
│  Supabase JS SDK (anon key, cookie-based session)           │
│  Direct Supabase queries (SELECT/INSERT/UPDATE/DELETE)      │
│  Governed by Row Level Security on every table              │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼────────────────────────────────────┐
│  EDGE MIDDLEWARE  (middleware.ts)                           │
│  Route: /dashboard/:path*                                   │
│  Session validation → role check → redirect logic          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  API ROUTE HANDLERS  (Node.js runtime)                      │
│  /api/ai, /api/submit-test, /api/batch-create-user,         │
│  /api/delete-user, /api/quests, /auth/callback              │
│  Re-validate session + role on every request                │
│  Use service role key only for privileged admin ops         │
└────────────────────────┬────────────────────────────────────┘
                         │ Supabase SDK
┌────────────────────────▼────────────────────────────────────┐
│  SUPABASE (Postgres + Auth + Storage + Realtime)            │
│  Row Level Security on all 28 tables                        │
│  RPC functions for atomic operations                        │
│  Triggers for derived data (comment_count, quest progress)  │
│  Storage bucket: course-files (public read, auth upload)    │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Runtime Environments

| Layer | Runtime | Notes |
|-------|---------|-------|
| Middleware | Edge (default) | Cookie-based auth, cannot use Node APIs |
| `app/api/ai/route.ts` | Node.js (forced) | Requires pdf-parse (fs/Buffer) |
| All other API routes | Node.js | Default |
| Auth callback | Node.js | Server-side code exchange |
| Dashboard pages | Client (browser) | `'use client'` components |

---

## 2. DATABASE SCHEMA

**Host:** Supabase Postgres  
**Auth:** Supabase Auth (auth.users) with sessions via HTTP-only cookies (@supabase/ssr)  
**Total tables:** 28  
**All tables:** RLS enabled

---

### 2.1 profiles

Extends `auth.users`. Created automatically via trigger on signup.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK, FK → auth.users (cascade) | Supabase user ID |
| `name` | `text` | NOT NULL | Display name |
| `email` | `text` | NOT NULL | User email |
| `role` | `text` | NOT NULL, CHECK (admin\|teacher\|student\|parent) | User role |
| `avatar` | `text` | DEFAULT '??' | Initials or avatar URL |
| `avatar_url` | `text` | — | Full storage URL (set on upload) |
| `phone` | `text` | — | Optional phone number |
| `bio` | `text` | — | Optional bio |
| `subject` | `text` | — | Teacher's subject |
| `grade` | `text` | — | Student's grade/class |
| `qgx_id` | `text` | UNIQUE | Platform identifier (e.g. QGX-S0001-ABCD) |
| `xp` | `integer` | DEFAULT 0 | Total experience points |
| `score` | `integer` | DEFAULT 0 | Best test score (0–100) |
| `ghost_wins` | `integer` | DEFAULT 0 | Times student beat own ghost score |
| `badges` | `text[]` | DEFAULT '{}' | Array of earned badge IDs |
| `reputation` | `integer` | DEFAULT 0 | Forum reputation score |
| `joined` | `date` | DEFAULT now() | Account creation date |
| `theme` | `text` | CHECK (dark\|light), DEFAULT 'dark' | UI preference |

**RLS Policies:**  
- `SELECT`: any authenticated user  
- `INSERT`: only own row (`auth.uid() = id`)  
- `UPDATE`: only own row; role field immutable (cannot self-promote)

**Trigger:** `on_auth_user_created` → `handle_new_user()` auto-creates profile from `raw_user_meta_data`.

---

### 2.2 announcements

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK DEFAULT gen_random_uuid() | |
| `title` | `text` | NOT NULL | Announcement title |
| `body` | `text` | — | Body content |
| `author_id` | `uuid` | FK → profiles (set null on delete) | |
| `author_name` | `text` | — | Denormalized author name |
| `role` | `text` | — | Author's role at creation time |
| `target` | `text` | DEFAULT 'all', CHECK (all\|teachers\|students) | Audience |
| `pinned` | `boolean` | DEFAULT false | Pinned to top |
| `created_at` | `timestamptz` | DEFAULT now() | |

**RLS Policies:** SELECT: public. INSERT: authenticated. DELETE: own row only.

---

### 2.3 tests

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `text` | PK | Teacher-defined test ID |
| `title` | `text` | NOT NULL | |
| `subject` | `text` | — | Subject area |
| `teacher_id` | `uuid` | FK → profiles (cascade) | Owning teacher |
| `teacher_name` | `text` | — | Denormalized |
| `scheduled_date` | `date` | — | Test date |
| `scheduled_time` | `time` | — | Start time |
| `duration` | `integer` | DEFAULT 60 | Minutes |
| `status` | `text` | DEFAULT 'scheduled' | scheduled \| active \| locked |
| `total_marks` | `integer` | DEFAULT 0 | Computed total |
| `type` | `text` | CHECK (test\|quiz) | |
| `anti_cheat` | `jsonb` | DEFAULT config | See AntiCheat config below |
| `xp_reward` | `integer` | DEFAULT 100 | Max XP for full marks |
| `created_at` | `timestamptz` | DEFAULT now() | |

**AntiCheat JSONB schema:**
```json
{
  "tabSwitch": false,
  "copyPaste": false,
  "randomQ": false,
  "randomOpts": false,
  "fullscreen": false,
  "timePerQ": 0,
  "maxAttempts": 1,
  "allowImmediateReview": false,
  "requireAllAnswered": false
}
```

**RLS Policies:** SELECT: public. INSERT: authenticated. UPDATE/DELETE: own tests only.

---

### 2.4 questions

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `test_id` | `text` | FK → tests (cascade) | |
| `type` | `text` | NOT NULL, CHECK (mcq\|msq\|tf\|fib\|match) | |
| `text` | `text` | NOT NULL | Question body |
| `options` | `jsonb` | — | Array of option strings (mcq/msq) |
| `answer` | `jsonb` | — | Authoritative answer (type-dependent) |
| `marks` | `integer` | DEFAULT 1 | Points for correct answer |
| `order_index` | `integer` | DEFAULT 0 | Display order |

**Answer JSONB types by question type:**

| type | answer format |
|------|---------------|
| `mcq` | `number` (0–3 index) |
| `msq` | `number[]` (array of indices) |
| `tf` | `boolean` |
| `fib` | `string` (case-insensitive match) |
| `match` | `[{ left: string, right: string }]` |

**RLS Policies:** SELECT: test's teacher or admin only (students never see answers directly). INSERT/DELETE: test's teacher only.

---

### 2.5 attempts

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `test_id` | `text` | FK → tests (cascade) | |
| `score` | `integer` | DEFAULT 0 | Raw marks earned |
| `total` | `integer` | DEFAULT 0 | Total marks available |
| `percent` | `integer` | DEFAULT 0 | Score as percentage |
| `answer_map` | `jsonb` | DEFAULT '{}' | Student's answers (question_id → answer) |
| `xp_earned` | `integer` | DEFAULT 0 | XP awarded for this attempt |
| `attempt_number` | `integer` | DEFAULT 1 | Sequential attempt count per student/test |
| `submitted_at` | `timestamptz` | DEFAULT now() | |

**Note:** Unique constraint `(student_id, test_id)` was removed to allow multiple attempts.  
**Indexes:** `idx_attempts_student` (student_id), `idx_attempts_test` (test_id)  
**RLS Policies:** SELECT: own rows + test's teacher + admin + parent (via parent_students). INSERT: own rows only.

---

### 2.6 courses

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `title` | `text` | NOT NULL | |
| `subject` | `text` | — | |
| `teacher_id` | `uuid` | FK → profiles (cascade) | |
| `teacher_name` | `text` | — | Denormalized |
| `description` | `text` | — | |
| `status` | `text` | DEFAULT 'published', CHECK (draft\|published) | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**RLS Policies:** SELECT: public. INSERT: authenticated. UPDATE: owner teacher. DELETE: owner teacher or admin.

---

### 2.7 course_files

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `course_id` | `uuid` | FK → courses (cascade) | |
| `name` | `text` | NOT NULL | File display name |
| `storage_path` | `text` | — | Supabase Storage path |
| `type` | `text` | — | MIME type or category |
| `url` | `text` | — | Public download URL |
| `size` | `bigint` | — | File size in bytes |
| `section` | `text` | — | Course section label |
| `order_index` | `integer` | DEFAULT 0 | Drag-and-drop order |
| `teacher_id` | `uuid` | FK → profiles (cascade) | |
| `uploaded_at` | `timestamptz` | DEFAULT now() | |

**Storage:** Bucket `course-files` (public read, auth upload, owner delete).  
**Indexes:** `idx_course_files_course`

---

### 2.8 enrollments

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `student_id` | `uuid` | PK part, FK → profiles (cascade) | |
| `course_id` | `uuid` | PK part, FK → courses (cascade) | |

**Indexes:** `idx_enrollments_student`, `idx_enrollments_course`

---

### 2.9 course_progress

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `course_id` | `uuid` | FK → courses (cascade) | |
| `file_id` | `uuid` | FK → course_files (cascade) | |
| `completed_at` | `timestamptz` | DEFAULT now() | |
| — | UNIQUE | (student_id, file_id) | One completion per file |

**Indexes:** `idx_course_progress_student`

---

### 2.10 course_ratings

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `student_name` | `text` | — | Denormalized |
| `course_id` | `uuid` | FK → courses (cascade) | |
| `rating` | `integer` | NOT NULL, CHECK (1–5) | |
| `review` | `text` | — | Optional text review |
| `created_at` | `timestamptz` | DEFAULT now() | |
| — | UNIQUE | (student_id, course_id) | One rating per student per course |

---

### 2.11 assignments

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `title` | `text` | NOT NULL | |
| `description` | `text` | — | |
| `course_id` | `uuid` | FK → courses (cascade) | |
| `teacher_id` | `uuid` | FK → profiles (cascade) | |
| `teacher_name` | `text` | — | Denormalized |
| `due_date` | `date` | — | |
| `attachment_url` | `text` | — | Teacher's attachment |
| `attachment_name` | `text` | — | |
| `priority` | `text` | DEFAULT 'medium', CHECK (low\|medium\|high\|critical) | |
| `max_points` | `integer` | DEFAULT 100 | |
| `status` | `text` | DEFAULT 'active', CHECK (active\|closed) | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**RLS Policies:** SELECT: public. INSERT: authenticated. UPDATE/DELETE: own assignments (teacher).

---

### 2.12 submissions

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `assignment_id` | `uuid` | FK → assignments (cascade) | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `file_name` | `text` | — | Uploaded file name |
| `file_url` | `text` | — | Uploaded file URL |
| `text_response` | `text` | — | Written response |
| `feedback` | `text` | — | Teacher feedback |
| `grade` | `text` | — | Letter grade |
| `score` | `integer` | — | Numeric grade |
| `is_draft` | `boolean` | DEFAULT false | Saved draft, not submitted |
| `is_late` | `boolean` | DEFAULT false | Past due_date |
| `submitted_at` | `timestamptz` | DEFAULT now() | |
| — | UNIQUE | (assignment_id, student_id) | |

**Indexes:** `idx_submissions_assignment`, `idx_submissions_student`  
**RLS Policies:** SELECT: own submissions + assignment's teacher. INSERT: own rows. UPDATE: own (student) + assignment's teacher (for grading).

---

### 2.13 timetable

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `subject` | `text` | — | |
| `teacher_id` | `uuid` | FK → profiles | |
| `teacher_name` | `text` | — | Denormalized |
| `day` | `text` | CHECK (Monday–Saturday) | |
| `time` | `text` | — | HH:MM format |
| `room` | `text` | — | Room number/name |

**RLS Policies:** SELECT: public. INSERT: authenticated. UPDATE/DELETE: own slots (teacher_id).

---

### 2.14 attendance

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `student_name` | `text` | — | Denormalized |
| `teacher_id` | `uuid` | FK → profiles (cascade) | |
| `subject` | `text` | — | |
| `date` | `date` | NOT NULL | |
| `status` | `text` | NOT NULL, CHECK (present\|absent\|late\|excused) | |
| `note` | `text` | — | Optional note |
| `created_at` | `timestamptz` | DEFAULT now() | |
| — | UNIQUE | (student_id, teacher_id, subject, date) | One record per day |

**Indexes:** `idx_attendance_student`, `idx_attendance_teacher`, `idx_attendance_date`  
**RLS Policies:** SELECT: own records (student) + own created records (teacher) + all (admin) + linked child (parent via parent_students). INSERT/UPDATE/DELETE: teacher only.

---

### 2.15 notifications

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → profiles (cascade) | |
| `message` | `text` | NOT NULL | |
| `type` | `text` | DEFAULT 'info' | |
| `read` | `boolean` | DEFAULT false | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Indexes:** `idx_notifications_user`  
**RLS Policies:** SELECT/UPDATE: own rows. INSERT: authenticated.

---

### 2.16 activity_log

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `message` | `text` | NOT NULL | Sanitized log message (max 500 chars) |
| `type` | `text` | DEFAULT 'info' | Normalized slug (max 48 chars) |
| `actor_id` | `uuid` | — | User who triggered the action |
| `metadata` | `jsonb` | — | Optional structured data |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Indexes:** `idx_activity_log_created`  
**RLS Policies:** SELECT: public. INSERT: authenticated.

---

### 2.17 forum_posts

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `title` | `text` | NOT NULL | |
| `body` | `text` | — | Markdown content |
| `author_id` | `uuid` | FK → profiles (cascade) | |
| `author_name` | `text` | — | Denormalized |
| `author_role` | `text` | DEFAULT 'student' | |
| `likes` | `uuid[]` | DEFAULT '{}' | Array of user IDs who liked |
| `bookmarks` | `uuid[]` | DEFAULT '{}' | Array of user IDs who bookmarked |
| `flair` | `text` | CHECK (question\|discussion\|announcement\|resource\|help\|showcase) | |
| `tags` | `text[]` | DEFAULT '{}' | |
| `attachment_url` | `text` | — | |
| `attachment_name` | `text` | — | |
| `attachment_type` | `text` | — | |
| `comment_count` | `integer` | DEFAULT 0 | Maintained by trigger |
| `view_count` | `integer` | DEFAULT 0 | Incremented via RPC |
| `pinned` | `boolean` | DEFAULT false | |
| `best_answer_id` | `uuid` | FK → forum_comments (set null on delete) | |
| `edited_at` | `timestamptz` | — | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Indexes:** `idx_forum_posts_author`  
**Trigger:** `forum_comment_count_trigger` → `update_comment_count()` auto-increments/decrements `comment_count`.

---

### 2.18 forum_comments

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `post_id` | `uuid` | FK → forum_posts (cascade) | |
| `parent_id` | `uuid` | FK → forum_comments (cascade) | Threaded replies |
| `author_id` | `uuid` | FK → profiles (cascade) | |
| `author_name` | `text` | — | |
| `author_role` | `text` | DEFAULT 'student' | |
| `body` | `text` | NOT NULL | |
| `likes` | `uuid[]` | DEFAULT '{}' | |
| `is_best_answer` | `boolean` | DEFAULT false | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Indexes:** `idx_forum_comments_post`

---

### 2.19 messages

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `sender_id` | `uuid` | FK → profiles (cascade) | |
| `receiver_id` | `uuid` | FK → profiles (cascade) | NULL for group messages |
| `body` | `text` | NOT NULL | |
| `read` | `boolean` | DEFAULT false | |
| `attachment_url` | `text` | — | |
| `attachment_name` | `text` | — | |
| `attachment_type` | `text` | — | |
| `edited_at` | `timestamptz` | — | Set on edit |
| `deleted` | `boolean` | DEFAULT false | Soft delete |
| `group_id` | `uuid` | FK → message_groups | NULL for DMs |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Indexes:** `idx_messages_sender`, `idx_messages_receiver`, `idx_messages_created`, `idx_messages_group`

---

### 2.20 message_groups

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `name` | `text` | NOT NULL | |
| `created_by` | `uuid` | FK → profiles (set null) | |
| `member_ids` | `text[]` | DEFAULT '{}' | Array of UUID strings |
| `created_at` | `timestamptz` | DEFAULT now() | |

**RLS Policies:** SELECT: member (`auth.uid()::text = any(member_ids)`). INSERT: creator. UPDATE: creator.

---

### 2.21 certificates

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `course_id` | `uuid` | FK → courses (cascade) | |
| `student_name` | `text` | — | Denormalized for certificate render |
| `course_title` | `text` | — | Denormalized |
| `credential_id` | `text` | UNIQUE | Verification code |
| `verified` | `boolean` | DEFAULT true | |
| `issued_at` | `timestamptz` | DEFAULT now() | |
| — | UNIQUE | (student_id, course_id) | One cert per course |

**Indexes:** `idx_certificates_student`

---

### 2.22 parent_students

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `parent_id` | `uuid` | PK part, FK → profiles (cascade) | |
| `student_id` | `uuid` | PK part, FK → profiles (cascade) | |

**RLS Policies:** SELECT: parent or linked student. INSERT: parent only. DELETE: parent only.

---

### 2.23 report_comments

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `teacher_id` | `uuid` | FK → profiles (set null) | |
| `teacher_name` | `text` | — | Denormalized |
| `term` | `text` | — | e.g. "Term 1 2026" |
| `comment` | `text` | — | Free text |
| `conduct` | `text` | CHECK (excellent\|good\|satisfactory\|needs_improvement\|poor) | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**RLS Policies:** SELECT: own student + own teacher + admin + parent. INSERT: admin or teacher only.

---

### 2.24 grade_weights

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `tests_weight` | `integer` | DEFAULT 40 | % weight |
| `assignments_weight` | `integer` | DEFAULT 30 | % weight |
| `attendance_weight` | `integer` | DEFAULT 10 | % weight |
| `participation_weight` | `integer` | DEFAULT 20 | % weight |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**RLS Policies:** SELECT: public. ALL: admin only.

---

### 2.25 absence_excuses

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `parent_id` | `uuid` | FK → profiles (cascade) | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `date` | `text` | NOT NULL | Date of absence |
| `reason` | `text` | NOT NULL | |
| `status` | `text` | DEFAULT 'pending', CHECK (pending\|approved\|rejected) | |
| `reviewed_by` | `uuid` | FK → profiles (set null) | Admin or teacher |
| `created_at` | `timestamptz` | DEFAULT now() | |

**RLS Policies:** SELECT: parent + student + admin + teacher. INSERT: parent only. UPDATE: admin or teacher only.

---

### 2.26 ai_chats

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `course_id` | `uuid` | FK → courses (cascade) | Scopes context |
| `messages` | `jsonb` | DEFAULT '[]' | `[{role, content, timestamp}]` |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**RLS Policies:** ALL: own rows only.

---

### 2.27 live_classes

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `title` | `text` | NOT NULL | |
| `teacher_id` | `uuid` | FK → profiles (cascade) | |
| `teacher_name` | `text` | — | |
| `course_id` | `uuid` | FK → courses (set null) | |
| `subject` | `text` | — | |
| `room_id` | `text` | — | Jitsi UUID |
| `room_url` | `text` | — | Full Jitsi URL |
| `scheduled_at` | `timestamptz` | NOT NULL | |
| `duration` | `integer` | DEFAULT 60 | Minutes |
| `status` | `text` | DEFAULT 'scheduled', CHECK (scheduled\|live\|ended) | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**RLS Policies:** SELECT: public. INSERT: admin or teacher. UPDATE: own class (teacher_id).

---

### 2.28 quests

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `title` | `text` | NOT NULL | |
| `description` | `text` | — | |
| `type` | `text` | DEFAULT 'daily', CHECK (daily\|weekly\|special) | |
| `target_type` | `text` | NOT NULL, CHECK (test\|course\|streak\|social\|achievement\|xp) | |
| `target_count` | `integer` | DEFAULT 1 | Required completions |
| `xp_reward` | `integer` | DEFAULT 50 | XP awarded on claim |
| `active` | `boolean` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Trigger:** `quests_init_progress_trigger` → `init_quest_progress_for_all()` creates `quest_progress` rows for all students when a new quest is inserted.

---

### 2.29 quest_progress

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `student_id` | `uuid` | FK → profiles (cascade) | |
| `quest_id` | `uuid` | FK → quests (cascade) | |
| `progress` | `integer` | DEFAULT 0 | Current count |
| `completed` | `boolean` | DEFAULT false | progress >= target_count |
| `claimed` | `boolean` | DEFAULT false | XP has been claimed |
| `completed_at` | `timestamptz` | — | When completed |
| — | UNIQUE | (student_id, quest_id) | |

**Indexes:** `idx_quest_progress_student`, `idx_quest_progress_quest`, `idx_quest_progress_student_quest`, `idx_quest_progress_completed`  
**Triggers:** Progress auto-incremented by:  
- `quests_test_attempt_trigger` (on attempts INSERT → target_type='test')  
- `quests_assignment_trigger` (on submissions INSERT/UPDATE → target_type='course')  
- `quests_forum_post_trigger` (on forum_posts INSERT → target_type='social')  
- `quests_xp_gain_trigger` (on profiles UPDATE where xp increased → target_type='xp')

---

### 2.30 meeting_slots

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `teacher_id` | `uuid` | FK → profiles (cascade) | |
| `teacher_name` | `text` | — | |
| `date` | `text` | NOT NULL | Date string |
| `start_time` | `text` | — | HH:MM |
| `end_time` | `text` | — | HH:MM |
| `time` | `text` | — | Legacy single time field |
| `duration` | `integer` | DEFAULT 15 | Minutes |
| `booked_by` | `uuid` | FK → profiles (set null) | Parent who booked |
| `booked_name` | `text` | — | |
| `parent_name` | `text` | — | |
| `student_id` | `uuid` | FK → profiles (set null) | Child for the meeting |
| `status` | `text` | DEFAULT 'available', CHECK (available\|booked\|completed\|cancelled) | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 2.31 platform_settings

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `key` | `text` | PK | Setting identifier |
| `value` | `jsonb` | NOT NULL | Setting value |

**Seeded keys:**

| key | default value | description |
|-----|---------------|-------------|
| `double_xp` | `{"active":false,"ends_at":null}` | Double XP toggle |
| `xp_levels` | `[7 level objects]` | XP tier thresholds |
| `checkin_xp` | `10` | XP per timetable check-in |
| `max_xp_per_test` | `500` | XP cap per test submission |

**RLS Policies:** SELECT: public. UPDATE/INSERT: admin only.

---

### 2.32 collaboration_rooms

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `name` | `text` | NOT NULL | Room display name |
| `subject` | `text` | DEFAULT '' | |
| `created_by` | `uuid` | FK → profiles | |
| `creator_name` | `text` | NOT NULL | |
| `is_active` | `boolean` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 2.33 room_messages

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `room_id` | `uuid` | FK → collaboration_rooms (cascade) | |
| `user_id` | `uuid` | FK → profiles | |
| `user_name` | `text` | NOT NULL | |
| `content` | `text` | NOT NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Realtime:** `room_messages` added to `supabase_realtime` publication.

---

### 2.34 Database RPCs

| Function | Parameters | Returns | Purpose |
|----------|------------|---------|---------|
| `generate_qgx_id(p_role text)` | role | `text` | Atomic QGX ID generation with sequential numbering |
| `atomic_xp_update(p_user_id, p_xp_delta, p_best_score, p_ghost_win_increment)` | uuid, int, int, int | void | Race-condition-safe XP increment; clamps delta to ±500 |
| `toggle_forum_like(post_id, user_id)` | uuid, uuid | `uuid[]` | Atomic toggle of like on a forum post |
| `toggle_comment_like(comment_id, user_id)` | uuid, uuid | `uuid[]` | Atomic toggle of like on a comment |
| `toggle_forum_bookmark(p_post_id, p_user_id)` | uuid, uuid | `uuid[]` | Atomic toggle bookmark; validates `auth.uid() = p_user_id` |
| `toggle_forum_pin(p_post_id)` | uuid | `boolean` | Toggle pin; requires admin or teacher role |
| `admin_delete_forum_post(p_post_id)` | uuid | void | Delete any post; requires admin or teacher role |
| `admin_delete_forum_comment(p_comment_id)` | uuid | void | Delete any comment; requires admin or teacher role |
| `increment_view_count(p_post_id)` | uuid | void | Thread-safe view count increment |
| `increment_reputation(target_user, delta)` | uuid, integer | void | Forum reputation update; clamps to ≥ 0 |

---

## 3. API ENDPOINTS

All API routes are under `/app/api/`. Every route handler:
1. Reads session from HTTP-only cookie via `@supabase/ssr`
2. Calls `supabase.auth.getUser()` — server-validated, not from client token
3. Fetches profile to verify role
4. Returns structured JSON errors on failure

---

### 3.1 POST /api/ai

**Purpose:** AI question generation (teacher) and AI tutor chat (student)  
**Runtime:** Node.js (forced — requires pdf-parse, jszip)  
**Auth:** Required (authenticated, role-specific)

#### Mode: Question Generation (teacher)

**Request body:**
```json
{
  "mode": "generate",
  "topic": "string (required)",
  "subject": "string (required)",
  "count": "number (1-20)",
  "type": "mcq | msq | tf | fib",
  "difficulty": "easy | medium | hard",
  "file": {
    "data": "base64 string (max 7MB encoded ~5MB decoded)",
    "type": "pdf | ppt | image",
    "mimeType": "string (for image)"
  }
}
```

**Response 200:**
```json
{
  "questions": [
    {
      "text": "string",
      "type": "mcq | msq | tf | fib",
      "options": ["string"] /* mcq/msq only */,
      "answer": "number | number[] | boolean | string",
      "marks": "number"
    }
  ]
}
```

**Auth:** Authenticated + role = `teacher`

#### Mode: Tutor Chat (student)

**Request body:**
```json
{
  "mode": "tutor",
  "message": "string (max 2000 chars)",
  "courseContext": "string",
  "history": [{ "role": "user | assistant", "content": "string" }],
  "file": {
    "data": "base64 string",
    "type": "pdf | ppt | image",
    "mimeType": "string"
  }
}
```

**Response 200:**
```json
{
  "reply": "string"
}
```

**Auth:** Authenticated + role = `student`

**Rate limit:** 10 requests/minute per user (in-memory sliding window)  
**Error responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 401 | Unauthorized | No session |
| 403 | Forbidden | Wrong role for mode |
| 400 | Invalid message | Missing/empty/too-long message without file |
| 400 | File too large | File base64 > 7MB (~5MB decoded) |
| 400 | Could not read PDF/PPT | Parse error |
| 429 | Too many requests | Rate limit exceeded |
| 500 | AI service not configured | GROQ_API_KEY missing |

---

### 3.2 POST /api/submit-test

**Purpose:** Server-side test grading, XP calculation, attempt recording  
**Auth:** Required (student only)

**Request body:**
```json
{
  "test_id": "string (required)",
  "answer_map": {
    "question-uuid": "number | boolean | string | number[] | { [left]: right }"
  },
  "is_double_xp": "boolean (optional)"
}
```

**Response 200:**
```json
{
  "score": "number",
  "total": "number",
  "percent": "number",
  "xpEarned": "number",
  "isDoubleXP": "boolean",
  "ghostMsg": "string",
  "ghostBonus": "number",
  "newXP": "number",
  "date": "YYYY-MM-DD"
}
```

**Processing steps (server-side):**
1. Validate session + role=student
2. Verify enrollment: student must be enrolled in a course matching test's subject or teacher
3. Fetch test + questions server-side (authoritative answers never sent to client)
4. Check test status (locked → 403)
5. Check deadline: `scheduled_date + scheduled_time + duration + 5min grace`
6. Check max attempts (`anti_cheat.maxAttempts`)
7. Grade all question types server-side
8. Compare against previous best (ghost score)
9. Compute XP: scaled by percent, increment only (improvement rewarded), doubled if `is_double_xp`, capped at `MAX_XP_PER_TEST=500`
10. Insert attempt row
11. Atomic XP update via `atomic_xp_update` RPC (with fallback to direct update)
12. Log to `activity_log` (non-blocking)

**Error responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 401 | Unauthorized | No session |
| 403 | Forbidden: students only | Not a student |
| 400 | Missing test_id or answer_map | Invalid body |
| 404 | Test not found | Bad test_id |
| 403 | Not enrolled in any course | No enrollments |
| 403 | Test not assigned to enrolled courses | Access control |
| 403 | Test is locked | status=locked |
| 403 | Test deadline has passed | Past scheduled window |
| 403 | Maximum attempts reached | Exceeded maxAttempts |
| 500 | Could not verify enrollment | DB error |

---

### 3.3 POST /api/batch-create-user

**Purpose:** Admin creates a new user account (auth + profile + QGX ID + reset link)  
**Auth:** Required (admin only) + SUPABASE_SERVICE_ROLE_KEY for admin operations

**Request body:**
```json
{
  "name": "string (required)",
  "email": "string (required, valid email format)",
  "role": "admin | teacher | student | parent (required)"
}
```

**Response 201:**
```json
{
  "user": { "id": "uuid", "email": "string" },
  "qgxId": "string",
  "resetLink": "string (password setup link)"
}
```

**Processing steps:**
1. Validate session + role=admin
2. Validate name, email, role fields and types
3. Check email regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
4. Use service role client (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS
5. Create auth user (`email_confirm: true`)
6. Generate QGX ID via `generate_qgx_id` RPC (fallback: manual generation)
7. Upsert profile row via admin client
8. Log to `activity_log`
9. Generate password recovery link for new user

**Error responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 401 | Unauthorized | No session |
| 403 | Forbidden: admins only | Not admin |
| 400 | Missing required fields | name/email/role absent |
| 400 | Invalid field types | Non-string fields |
| 400 | Invalid role | Not in allowed list |
| 400 | Invalid email format | Regex fail |
| 400 | (Supabase error) | Email already registered |
| 500 | Service role key not configured | Env var missing |
| 500 | Profile setup failed | DB upsert error |

---

### 3.4 POST /api/delete-user

**Purpose:** Admin deletes a user account from both auth and profiles  
**Auth:** Required (admin only) + SUPABASE_SERVICE_ROLE_KEY

**Request body:**
```json
{
  "userId": "string (UUID, required)"
}
```

**Response 200:**
```json
{
  "success": true
}
```

**Processing steps:**
1. Validate session + role=admin
2. Validate `userId` is non-empty string
3. Prevent self-deletion (`userId === caller.id`)
4. Fetch target profile role
5. If target is admin: count remaining admins; block if last admin
6. Use service role client to call `auth.admin.deleteUser(userId)` (cascades to profiles via FK)

**Error responses:**

| Status | Error | Condition |
|--------|-------|-----------|
| 401 | Unauthorized | No session |
| 403 | Forbidden: admins only | Not admin |
| 400 | Missing userId | Field absent |
| 400 | Cannot delete your own account | Self-delete |
| 403 | Cannot delete the last admin account | Last admin guard |
| 500 | Service role key not configured | Env var missing |

---

### 3.5 GET /api/quests

**Purpose:** List all quests (admin dashboard)  
**Auth:** Required (admin only)

**Response 200:**
```json
{
  "quests": [
    {
      "id": "uuid",
      "title": "string",
      "description": "string | null",
      "type": "daily | weekly | special",
      "target_type": "test | course | streak | social | achievement | xp",
      "target_count": "number",
      "xp_reward": "number",
      "active": "boolean",
      "created_at": "timestamptz"
    }
  ]
}
```

---

### 3.6 POST /api/quests

**Purpose:** Create a new quest  
**Auth:** Required (admin only)

**Request body:**
```json
{
  "title": "string (1-180 chars, required)",
  "description": "string (optional, max 1000 chars)",
  "type": "daily | weekly | special (required)",
  "target_type": "test | course | streak | social | achievement | xp (required)",
  "target_count": "number (1-1000, required)",
  "xp_reward": "number (1-5000, required)",
  "active": "boolean (optional, default true)"
}
```

**Response 201:**
```json
{
  "quest": { /* full quest object */ }
}
```

**Side effect:** Triggers `quests_init_progress_trigger` which creates `quest_progress` rows for all existing students.

---

### 3.7 PATCH /api/quests

**Purpose:** Update an existing quest  
**Auth:** Required (admin only)

**Request body:**
```json
{
  "id": "uuid (required)",
  "title": "string (optional)",
  "description": "string (optional)",
  "type": "daily | weekly | special (optional)",
  "target_type": "string (optional)",
  "target_count": "number (optional)",
  "xp_reward": "number (optional)",
  "active": "boolean (optional)"
}
```

**Response 200:**
```json
{
  "quest": { /* updated quest object */ }
}
```

---

### 3.8 DELETE /api/quests?id={uuid}

**Purpose:** Delete a quest  
**Auth:** Required (admin only)

**Query param:** `?id=uuid`

**Response 200:**
```json
{
  "success": true
}
```

---

### 3.9 GET /auth/callback?code={code}&next={path}

**Purpose:** Exchange Supabase auth code for session (email confirmation / password reset)  
**Auth:** None (public, code-gated)

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `code` | Yes | One-time Supabase auth code |
| `next` | No | Redirect path after exchange (default `/reset-password`) |

**Safe redirect whitelist:**
```
/reset-password
/dashboard/student
/dashboard/teacher
/dashboard/parent
/dashboard/admin
/login
```

**Response:** HTTP 302 redirect  
- Success → redirects to `next`  
- Failure → redirects to `/forgot-password?error=expired`

---

## 4. BUSINESS LOGIC

### 4.1 Authentication & Session Management

- Sessions stored in HTTP-only cookies via `@supabase/ssr`
- Session is server-validated on every API request via `supabase.auth.getUser()` (not decoded from JWT client-side)
- Middleware validates session + role on every `/dashboard/*` navigation
- `onAuthStateChange` in dashboard pages catches `SIGNED_OUT` → redirect to `/login`
- QGX ID login: resolves QGX ID → email → standard signInWithPassword flow

### 4.2 Test Grading Logic

```
score = Σ marks_per_correct_question

Scoring per type:
  MCQ:   answer_map[q.id] === q.answer (exact number index)
  MSQ:   sorted(answer_map[q.id]) === sorted(q.answer) (all correct or none)
  TF:    answer_map[q.id] === q.answer (boolean strict)
  FIB:   answer_map[q.id].trim().toLowerCase() === q.answer.toLowerCase()
  Match: every pair's right value matches case-insensitively

percent = Math.round((score / total) * 100)
```

### 4.3 XP Calculation

```
testXPReward = test.xp_reward (default 100)
prevXPBase   = Math.round(testXPReward × (prevBestPercent / 100))
baseXP       = Math.round(testXPReward × (percent / 100))
deltaXP      = Math.max(0, baseXP - prevXPBase)   ← only improvements rewarded
xpEarned     = is_double_xp ? deltaXP × 2 : deltaXP
xpEarned     = Math.max(0, Math.min(xpEarned, MAX_XP_PER_TEST))  ← cap at 500
ghostBonus   = percent > prevBestPercent ? 50 : 0
xpEarned    += ghostBonus
```

XP is written atomically via `atomic_xp_update` RPC (clamps delta ±500, never negative).

### 4.4 QGX ID Generation

```
prefix = { admin: 'A', teacher: 'T', parent: 'P', student: 'S' }[role]
count  = SELECT COUNT(*) + 1 FROM profiles WHERE role = p_role
suffix = upper(substring(gen_random_uuid()::text, 1, 8))
qgx_id = 'QGX-' || prefix || lpad(count, 4, '0') || suffix
```

Generated atomically via RPC `generate_qgx_id`. Client-side fallback uses `crypto.randomUUID().slice(0,4).toUpperCase()`.

### 4.5 Quest Progress Automation

Triggers maintain `quest_progress.progress` automatically:

| Trigger table | Event | target_type updated |
|---------------|-------|---------------------|
| `attempts` | INSERT | `test` |
| `submissions` | INSERT or UPDATE | `course` |
| `forum_posts` | INSERT | `social` |
| `profiles` | UPDATE (xp increased) | `xp` |

When progress ≥ target_count: `completed = true`, `completed_at = now()`.  
XP claim: POST /api/quests with action=claim (student) → sets `claimed = true`, calls `atomic_xp_update`.

### 4.6 Certificate Issuance

```
courseFiles = SELECT * FROM course_files WHERE course_id = X
completedFiles = SELECT * FROM course_progress WHERE student_id = Y AND course_id = X
eligible = completedFiles.length >= courseFiles.length AND courseFiles.length > 0
→ If eligible: INSERT INTO certificates (...) ON CONFLICT DO NOTHING
```

Guard prevents issuing certificates for courses with zero files.

### 4.7 Double XP

- Admin sets `platform_settings.double_xp = { active: true, ends_at: ISO_STRING }` 
- Duration: `DOUBLE_XP_DURATION_MS = 3_600_000` (1 hour)
- Student dashboard reads `ends_at` on mount; shows banner while `Date.now() < ends_at`
- API route: reads `is_double_xp` flag from request body; trusts it only if server-side `platform_settings` also has `active=true` (client cannot spoof without server confirmation)
- Banner auto-hides client-side when timer expires

### 4.8 Plagiarism Detection

- Teacher selects assignment → fetches up to 100 text submissions
- Client-side pairwise Jaccard similarity on tokenized words
- Threshold adjustable: 10%–90% (default 30%)
- Results: pairs above threshold, color-coded, matched phrases highlighted
- Flag workflow: each pair gets `status = open | reviewed | dismissed` (stored in plagiarism_flags or local state)

### 4.9 Predictive Risk Alerts

Risk score computed client-side from student data:

```
Components (each adds to risk score):
  attendance < 80%        → +20
  avg test score < 50%    → +15
  overdue assignments > 0 → +10
  no logins in 7 days     → +5
  inactivity 14 days      → +10

Thresholds:
  High:   score ≥ 40 (red)
  Medium: score 20-39 (amber)
  Low:    score < 20 (green)
```

### 4.10 Activity Logging

`logActivity(message, type)` in `lib/actions.ts`:
- Sanitizes message: trim + collapse whitespace, truncate to 500 chars
- Sanitizes type: lowercase, replace non-alphanumeric with `_`, trim leading/trailing `_`, truncate to 48 chars, fallback to `'info'`
- Inserts to `activity_log` with `actor_id` from current session

---

## 5. ERROR HANDLING

### 5.1 Standard API Error Response Format

All API routes return JSON with this shape on error:

```json
{
  "error": "Human-readable error message"
}
```

HTTP status codes used:

| Status | Meaning | When Used |
|--------|---------|-----------|
| 400 | Bad Request | Missing/invalid fields, validation failure |
| 401 | Unauthorized | No valid session |
| 403 | Forbidden | Valid session but insufficient role or access denied |
| 404 | Not Found | Resource does not exist |
| 429 | Too Many Requests | Rate limit exceeded (AI endpoint) |
| 500 | Internal Server Error | DB error, missing env vars, unexpected failures |

### 5.2 Middleware Error Handling

```
Profile fetch fails (DB error)
  → catch block → redirect to /login (fail-safe)

profile.role not in VALID_ROLES
  → redirect to /login

profile.role !== dashRole in URL
  → redirect to /dashboard/{actual_role}
```

### 5.3 Auth Callback Error Handling

```
Code exchange fails (expired/invalid code)
  → redirect to /forgot-password?error=expired
```

### 5.4 Client-Side Error Handling (Dashboards)

- `onAuthStateChange(SIGNED_OUT)` → `router.push('/login')`
- Supabase query errors → toast notification
- Logout fail → toast "Logout failed"
- File size > MAX_FILE_SIZE (50MB) → toast, no upload attempted
- AI rate limit 429 → toast with message

### 5.5 Non-Critical Failures

Operations logged as fire-and-forget (do not block response):
- `activity_log` inserts in API routes (`.then(null, err => console.error(...))`)
- Notification pushes after user creation

### 5.6 Database Error Fallbacks

`submit-test`: If `atomic_xp_update` RPC fails, falls back to direct `profiles.update()` with client-side computed values.

`batch-create-user`: If `generate_qgx_id` RPC fails, falls back to client-side QGX ID generation formula.

---

## 6. SECURITY

### 6.1 Authentication Checks

Every server-side endpoint performs this sequence before any data access:

```typescript
// Step 1: Validate session from cookie (server-validated, not JWT decode)
const { data: { user } } = await supabase.auth.getUser()
if (!user) return 401 Unauthorized

// Step 2: Fetch role from DB (cannot be spoofed via client)
const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id)
if (!profile || profile.role !== requiredRole) return 403 Forbidden
```

### 6.2 Row Level Security

All 28 tables have RLS enabled. Key policies:

| Protection | Implementation |
|------------|----------------|
| Students see own attempts only | `attempts` SELECT: `auth.uid() = student_id` |
| Questions never exposed to students | `questions` SELECT: owner teacher or admin only |
| Submissions visible to own student + teacher | `submissions` SELECT: both parties |
| Profiles self-update only | `profiles` UPDATE: `auth.uid() = id` |
| Role immutability | `profiles` UPDATE WITH CHECK: `role = existing_role` |
| Platform settings admin-only | `platform_settings` UPDATE: admin role check in RLS |
| Parent access scoped to linked children | RLS joins on `parent_students` |
| Group message access | `messages` SELECT: membership in `message_groups` |

### 6.3 Service Role Key Usage

`SUPABASE_SERVICE_ROLE_KEY` is used **only** in:
- `POST /api/batch-create-user` — to create auth users (`auth.admin.createUser`)
- `POST /api/delete-user` — to delete auth users (`auth.admin.deleteUser`)

Both endpoints:
1. Verify caller is authenticated admin via anon key first
2. Only then instantiate the service client
3. Never expose the service key to the client

### 6.4 Input Validation

| Location | Validation |
|----------|------------|
| `/api/batch-create-user` | name/email/role required + typed; email regex; role whitelist |
| `/api/delete-user` | userId non-empty string; self-delete guard; last-admin guard |
| `/api/quests POST` | title 1–180 chars; type/target_type enum check; target_count 1–1000; xp_reward 1–5000 |
| `/api/ai` | message max 2000 chars or file required; file base64 max 7MB; mode-specific role check |
| `/api/submit-test` | test_id and answer_map required; enrollment verified; deadline enforced; attempt limit enforced |
| Middleware | Redirect target from `?redirect=` param validated: must start with `/dashboard/` |
| Auth callback | `?next=` param validated against SAFE_PATHS whitelist (prevents open redirect) |
| Activity log | Message sanitized (500 char limit); type slug-normalized (48 char limit) |

### 6.5 Rate Limiting

| Endpoint | Limit | Strategy |
|----------|-------|----------|
| `POST /api/ai` | 10 req/min per user | In-memory sliding window (`Map<userId, timestamp[]>`) |

**Known limitation:** In-memory rate limiter resets on serverless cold starts. Not production-safe for multi-instance deployments. Recommend Redis or Upstash for production.

All other endpoints have no explicit rate limiting beyond Supabase platform limits.

### 6.6 XSS / Injection Protection

| Risk | Mitigation |
|------|-----------|
| Forum post bodies | Rendered as markdown with XSS-safe renderer (sanitizes `<script>`, inline JS) |
| Activity log | Message sanitized: collapse whitespace, truncate — no HTML |
| Code playground (JS) | Executed in Web Worker with 5s timeout |
| Code playground (Python) | Executed via Pyodide (WASM sandbox) |
| Code playground (HTML) | Rendered in sandboxed `<iframe>` |
| AI prompt injection | API validates `message.length <= 2000`; model context is instructional, not executable |
| Forum attachment | URL stored, not executed |

### 6.7 Open Redirect Prevention

Two locations that accept URL parameters have whitelists:

1. **Middleware** (`?redirect=`):  
   ```typescript
   const isSafeRedirect = (path: string) =>
     path.startsWith('/') &&
     !path.startsWith('//') &&
     path.startsWith('/dashboard/')
   ```

2. **Auth callback** (`?next=`):  
   ```typescript
   const SAFE_PATHS = ['/reset-password', '/dashboard/student', '/dashboard/teacher',
                       '/dashboard/parent', '/dashboard/admin', '/login']
   const next = SAFE_PATHS.includes(nextParam) ? nextParam : '/reset-password'
   ```

### 6.8 CSRF Protection

Next.js App Router API routes use cookie-based session validation via `@supabase/ssr`. Cookies are HTTP-only and SameSite, providing native CSRF protection for same-origin requests. Form submissions use `application/json` bodies via fetch, requiring explicit JavaScript execution (not exploitable via HTML form-based CSRF).

### 6.9 File Upload Security

| Check | Value | Enforced at |
|-------|-------|-------------|
| Max file size (general) | 50 MB (`MAX_FILE_SIZE`) | Client-side pre-check before upload |
| Max AI file size | 5 MB (~7MB base64) | Server-side in `/api/ai` |
| Storage RLS (delete) | Owner only | `storage.foldername(name)[1] = auth.uid()` |
| Storage upload | Authenticated users only | `auth.role() = 'authenticated'` |

### 6.10 Environment Variables Required

| Variable | Used by | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | All routes, middleware, client | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All routes, middleware, client | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | batch-create-user, delete-user | Yes (admin ops) |
| `GROQ_API_KEY` | /api/ai | Yes (AI features only) |

Aliases accepted for service key: `SUPABASE_SERVICE_KEY`, `SERVICE_ROLE_KEY`.

---

*Last updated: April 6, 2026 — derived from source at HEAD.*
