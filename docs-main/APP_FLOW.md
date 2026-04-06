# APP_FLOW.md — QGX LMS Complete Navigation & Flow Specification

> **Source of truth:** Derived directly from middleware.ts, all four dashboard page.tsx files,
> auth/callback/route.ts, login/page.tsx, register/page.tsx, reset-password/page.tsx,
> forgot-password/page.tsx, and the full component tree. No step is inferred.

---

## TABLE OF CONTENTS

1. [Entry Points](#1-entry-points)
2. [Page Inventory](#2-page-inventory)
3. [URL Route Structure](#3-url-route-structure)
4. [User Flows — Step by Step](#4-user-flows--step-by-step)
   - 4.1 Unauthenticated Visitor
   - 4.2 New User Registration
   - 4.3 Login (Email)
   - 4.4 Login (QGX ID)
   - 4.5 Password Recovery
   - 4.6 Admin Full Journey
   - 4.7 Teacher Full Journey
   - 4.8 Student Full Journey
   - 4.9 Parent Full Journey
5. [Conditional Flows](#5-conditional-flows)
6. [Role-Based Flows](#6-role-based-flows)
7. [State Transitions](#7-state-transitions)
8. [Forbidden Flows](#8-forbidden-flows)
9. [API Route Flows](#9-api-route-flows)

---

## 1. ENTRY POINTS

Every possible starting point into the application:

| # | Entry Point | URL | Context |
|---|-------------|-----|---------|
| 1 | **Landing Page** | `/` | Public. No auth required. Default browser entry. |
| 2 | **Login Page** | `/login` | Public. Explicit navigation or redirect from middleware. |
| 3 | **Register Page** | `/register` | Public. Self-service account creation. |
| 4 | **Forgot Password** | `/forgot-password` | Public. Linked from login page. |
| 5 | **Reset Password** | `/reset-password` | Public (token-gated). Reached via email recovery link. |
| 6 | **Auth Callback** | `/auth/callback?code=X` | Server-side. Supabase email link handler. |
| 7 | **Deep Link — Login** | `/login?redirect=/dashboard/student` | Saved bookmark or middleware redirect. |
| 8 | **Deep Link — Expired Reset** | `/forgot-password?error=expired` | Auth callback failure redirect. |
| 9 | **Direct Dashboard URL** | `/dashboard/{role}` | Authenticated user bookmark or direct navigation. |
| 10 | **PWA Home Screen Launch** | `/` (standalone display mode) | Installed PWA shortcut, start_url = `/`. |
| 11 | **Admin Redirect to Create User** | `/dashboard/admin?tab=users&createUser=1` | Admin user visiting `/register` is redirected here. |

---

## 2. PAGE INVENTORY

### 2.1 Public Pages (No Authentication Required)

| Page | URL | Description |
|------|-----|-------------|
| Landing | `/` | Marketing home page with animated counters, feature highlights, demo credentials, links to login/register |
| Login | `/login` | Email or QGX ID + password sign-in |
| Register | `/register` | Self-registration for student / teacher / parent roles |
| Forgot Password | `/forgot-password` | Email submission for password reset |
| Reset Password | `/reset-password` | New password form, requires valid recovery token |
| Auth Callback | `/auth/callback` | Server route — code exchange, redirect handler |
| 404 Not Found | `/*` (unmatched) | `app/not-found.tsx` — shown for any unrecognised URL |
| Error Page | N/A | `app/error.tsx` — shown on unhandled client exception |
| Offline Fallback | `/offline.html` | Served by service worker when device is offline |

### 2.2 Admin Dashboard Tabs — `/dashboard/admin`

| Tab ID | Sidebar Label | Description |
|--------|---------------|-------------|
| `home` | Overview | Platform stats, recent activity, quick-access widgets, double XP control |
| `users` | Users | Paginated user list, search, filter, create, delete |
| `announcements` | Announcements | Create/edit/delete global announcements with targeting |
| `tests` | Tests | Platform-wide view of all tests via `AdminTestModule` |
| `courses` | Courses | Platform-wide course list overview |
| `assignments` | Assignments | Platform-wide assignment view |
| `attendance` | Attendance | Platform-wide attendance records |
| `forums` | Forums | Full forum access via `ForumModule` |
| `analytics` | Analytics | Aggregated platform analytics charts |
| `activity` | Activity Log | Full audit trail of all admin/user actions |
| `settings` | Settings | Platform settings (XP levels, grade weights, double XP toggle) |
| `batch` | Batch Create | CSV or multi-row user creation via `AdminBatchModule` |
| `calendar` | Calendar | Platform calendar via `CalendarModule` |
| `profile` | Profile | Admin's own profile, avatar, password change |

**Total Admin Tabs: 14**

### 2.3 Student Dashboard Tabs — `/dashboard/student`

| Tab ID | Section | Sidebar Label | Description |
|--------|---------|---------------|-------------|
| `home` | — | Overview | XP summary, announcement feed, today's schedule, quick stats |
| `tests` | Learning | Tests | Available tests/quizzes, attempt history via `StudentTestModule` |
| `courses` | Learning | Courses | Browse, enroll, track progress via `StudentCourseModule` |
| `assignments` | Learning | Assignments | View and submit assignments via `StudentAssignmentModule` |
| `attendance` | Learning | Attendance | Personal attendance calendar via `StudentAttendanceModule` |
| `grades` | Learning | Grades | Test scores, assignment grades, GPA via `StudentGradesModule` |
| `timetable` | Learning | Timetable | Weekly schedule, check-in for XP via `TimetableModule` |
| `xp` | Learning | XP Hub | Levels, badges, leaderboard, streaks via `XPEngine` |
| `forums` | Learning | Forums | Community discussion via `ForumModule` |
| `calendar` | Learning | Calendar | Personal academic calendar via `CalendarModule` |
| `live-classes` | Learning | Live Classes | Scheduled and active live video classes via `LiveClassModule` |
| `quests` | Learning | Quests | Daily/weekly/special quests, XP claim via `QuestModule` |
| `collab` | Learning | Study Rooms | Peer collaboration rooms via `CollaborationModule` |
| `ai-tutor` | Tools | AI Tutor | Course-scoped LLM chat via `AiTutorModule` |
| `code` | Tools | Code Lab | In-browser JS/Python/HTML playground via `CodePlaygroundModule` |
| `messaging` | Tools | Messages | DM and group chat via `MessagingModule` |
| `report-card` | Tools | Report Card | Term-based academic report via `ReportCardModule` |
| `my-analytics` | Tools | My Analytics | Personal performance charts via `StudentAnalyticsModule` |
| `certificates` | Tools | Certificates | Earned course certificates, download via `CertificateModule` |
| `profile` | Account | My Profile | Edit name, avatar, password via `ProfileTab` |

**Total Student Tabs: 20**

### 2.4 Teacher Dashboard Tabs — `/dashboard/teacher`

| Tab ID | Section | Sidebar Label | Description |
|--------|---------|---------------|-------------|
| `home` | — | Overview | Class stats, announcements, assignment summary, quests |
| `tests` | Teaching | Tests & Quizzes | Create/manage tests and quizzes, AI Q-gen via `TeacherTestModule` |
| `timetable` | Teaching | Timetable | Manage class schedule slots via `TimetableModule` |
| `courses` | Teaching | Courses | Create and manage course content via `TeacherCourseModule` |
| `assignments` | Teaching | Assignments | Create/grade assignments via `TeacherAssignmentModule` |
| `attendance` | Teaching | Attendance | Mark and view class attendance via `TeacherAttendanceModule` |
| `grades` | Teaching | Grades | Per-student grade book via `TeacherGradesModule` |
| `analytics` | Teaching | Analytics | Class performance analytics |
| `quests` | Teaching | Quests | View student quest progress |
| `calendar` | Teaching | Calendar | Teaching calendar via `CalendarModule` |
| `live-classes` | Teaching | Live Classes | Host/schedule live sessions via `LiveClassModule` |
| `announcements` | Teaching | Announcements | Create and manage announcements |
| `forums` | Teaching | Forums | Community forums via `ForumModule` |
| `plagiarism` | Tools | Plagiarism Check | Submission similarity scan via `PlagiarismModule` |
| `meetings` | Tools | Meetings | Offer and manage meeting slots via `MeetingSchedulerModule` |
| `pred-alerts` | Tools | Risk Alerts | At-risk student detection via `PredictiveAlertsModule` |
| `messaging` | Tools | Messages | DM and group chat via `MessagingModule` |
| `report-card` | Tools | Report Cards | Write term comments via `ReportCardModule` |
| `batch-grades` | Tools | Batch Grades | CSV bulk grade import via `TeacherBatchGradeModule` |
| `profile` | Account | My Profile | Edit profile, avatar, password via `ProfileTab` |

**Total Teacher Tabs: 20**

### 2.5 Parent Dashboard Tabs — `/dashboard/parent`

| Tab ID | Section | Sidebar Label | Description |
|--------|---------|---------------|-------------|
| `home` | — | Overview | Linked children selector, child's stats, announcements |
| `grades` | Monitor | Grades & Tests | Child's test attempts and assignment scores |
| `attendance` | Monitor | Attendance | Child's attendance calendar and rate |
| `timetable` | Monitor | Timetable | Child's weekly schedule (read-only) |
| `report` | Monitor | Report Card | Child's term report card via `ReportCardModule` |
| `excuses` | Communication | Absence Excuses | Submit absence excuses for child |
| `meetings` | Communication | Book Meeting | Book teacher meeting slot via `MeetingSchedulerModule` |
| `messaging` | Communication | Teacher Messages | DM teachers via `MessagingModule` |
| `alerts` | Communication | Academic Alerts | Risk-based alerts derived from child's data |
| `profile` | Account | My Profile | Edit profile, avatar, password via `ProfileTab` |

**Total Parent Tabs: 10**

**GRAND TOTAL: 8 public pages + 14 admin + 20 student + 20 teacher + 10 parent = 72 screens**

---

## 3. URL ROUTE STRUCTURE

```
/ ........................................................ Landing page
/login ................................................... Login form
/login?redirect=/dashboard/{role} ....................... Login with redirect
/login?reset=success ..................................... Login with reset success banner
/register ................................................ Self-registration form
/forgot-password ......................................... Password reset request
/forgot-password?error=expired .......................... Reset link expired state
/reset-password .......................................... New password form (token-gated)
/auth/callback?code={code} .............................. Supabase auth code exchange
/auth/callback?code={code}&next={safePath} .............. Auth callback with redirect target

/dashboard/admin ......................................... Admin dashboard SPA
/dashboard/admin?tab={tabId} ............................ Admin deep-link to tab (via searchParams)
/dashboard/admin?tab=users&createUser=1 .................. Admin redirected from /register

/dashboard/teacher ....................................... Teacher dashboard SPA
/dashboard/teacher?tab={tabId} .......................... Teacher deep-link to tab

/dashboard/student ....................................... Student dashboard SPA
/dashboard/student?tab={tabId} .......................... Student deep-link to tab

/dashboard/parent ........................................ Parent dashboard SPA
/dashboard/parent?tab={tabId} ........................... Parent deep-link to tab

/api/ai .................................................. POST — AI tutor / question generation
/api/submit-test ......................................... POST — Test submission
/api/batch-create-user ................................... POST — Create a user (admin only)
/api/delete-user ......................................... POST — Delete a user (admin only)
/api/quests .............................................. GET/POST — Quest management (admin only)

/manifest.json ........................................... PWA Web App Manifest
/offline.html ............................................ Service worker offline fallback
/sw.js ................................................... Service worker script
```

**Middleware matcher:** `/dashboard/:path*` — all dashboard routes protected.

---

## 4. USER FLOWS — STEP BY STEP

### 4.1 Unauthenticated Visitor

```
START: User opens browser → navigates to any URL

[A] URL = /
    → Landing page renders
    → User sees: QGX logo, animated stat counters, feature cards,
                 "Sign In" button → /login
                 "Register" button → /register

[B] URL = /dashboard/admin (or any /dashboard/* route)
    → Next.js middleware intercepts request
    → supabase.auth.getUser() returns null (no session)
    → Middleware redirects → /login?redirect=/dashboard/admin
    → Login page renders with redirect stored in ?redirect=

[C] URL = /login
    → Login page renders directly (no redirect param)

[D] URL = /register
    → Register page checks supabase.auth.getUser()
    → No user found → checkingAdmin = false → register form shows

[E] URL = /forgot-password
    → Forgot password page renders

[F] URL = /reset-password (no token)
    → Page renders
    → No PASSWORD_RECOVERY event fires (no valid token in URL hash)
    → Form does not show → user sees waiting/empty state
```

---

### 4.2 New User Registration

```
START: User on /register

STEP 1: Page load
    → supabase.auth.getUser() called
    → If admin is logged in → redirect to /dashboard/admin?tab=users&createUser=1
    → If no user → show registration form

STEP 2: User fills form
    Fields: name (required), email (required), password (required),
            role selector (student | teacher | parent), phone (optional)
    Note: "admin" is NOT a selectable role option

STEP 3: User clicks "Create Account" (form submit)
    → Client validates:
        □ name not empty?         → error "All fields required"
        □ email format valid?     → error "Invalid email format"
        □ password ≥ 8 chars?    → error "Password must be at least 8 characters"
        □ password has letter AND number? → error "Must contain at least one letter and one number"
    → If any fail → error shown inline, form stays

STEP 4: supabase.auth.signUp(email, password) called
    → CASE A: Email already registered
        → Supabase returns error
        → Error displayed on form
        → User stays on /register

    → CASE B: Email confirmation DISABLED (auto-confirm)
        → data.session exists
        → Proceed to STEP 5

    → CASE C: Email confirmation ENABLED
        → data.session is null
        → Notice: "Account created. Please confirm your email, then sign in."
        → User stays on /register; flow ends here until email confirmed

STEP 5: QGX ID generation (auto-confirm flow only)
    → Try: supabase.rpc('generate_qgx_id', { p_role: role })
    → If RPC fails → fallback client-side:
        prefix = ADM/TCH/STU/PAR (by role)
        count  = existing profiles for role + padding to 4 digits
        suffix = 4 random uppercase alphanumeric chars
        format = QGX-{PREFIX}{NNNN}-{RAND4}

STEP 6: Profile row created in `profiles` table
    Fields: id, name, email, role, phone, avatar (initials), qgx_id,
            xp=0, score=0, ghost_wins=0, joined=today

STEP 7: Activity logged + redirect
    → logActivity() called
    → router.push(`/dashboard/${role}`)
    → Dashboard loads for new user
```

---

### 4.3 Login — Email/Password

```
START: User on /login

STEP 1: Page evaluates ?redirect= parameter
    → If ?redirect= is present AND starts with "/dashboard/" → isSafeRedirect = true
    → If reset=success in params → green banner "Password updated!" shown

STEP 2: User enters email + password, clicks "Sign In" (or presses Enter)
    → Validation: both fields non-empty? → error "Enter email or QGX ID and password"

STEP 3: Input type detection
    → Does input start with "QGX-" (case-insensitive)?
        YES → goto LOGIN WITH QGX ID flow (4.4)
        NO  → treat as email, continue

STEP 4: supabase.auth.signInWithPassword({ email, password })
    → CASE A: Wrong password / non-existent email
        → error.message displayed on form
        → User stays on /login. No session created.

    → CASE B: Success
        → data.user available

STEP 5: supabase.from('profiles').select('role').eq('id', user.id)
    → Fetch role from profiles table

STEP 6: Determine redirect target
    → redirectPath valid AND role in redirectPath matches profile.role?
        YES → router.push(redirectPath)     [honors deep link]
        NO  → router.push(`/dashboard/${role}`)

STEP 7: Dashboard page loads
    → Role-specific dashboard renders
    → Data fetched in parallel (Promise.allSettled)
    → Tab defaults to 'home'
```

---

### 4.4 Login — QGX ID

```
START: User on /login, enters "QGX-STU0001-ABCD" in identifier field

STEP 1: Input starts with "QGX-" (after .toUpperCase())
    → supabase.from('profiles').select('email')
              .eq('qgx_id', input.toUpperCase())
    → CASE A: No profile found (QGX ID does not exist)
        → error "QGX ID not found"
        → User stays on /login. Loading stops.
    → CASE B: Profile found → loginEmail = profile.email

STEP 2: Continue with resolved email → same as Login steps 4–7 above
```

---

### 4.5 Password Recovery

```
PART A — Request reset email

START: User on /forgot-password (reachable via "Forgot password?" link on /login)

STEP 1: User enters email address, clicks "Send Reset Link"
    → supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/reset-password`
      })
    → Success shown regardless of whether email is registered (Supabase behavior)
    → Message: "Reset link sent. Check your inbox."
    → Input cleared

PART B — Auth callback (server-side)

START: User clicks reset link in email → browser opens /auth/callback?code=XXX

STEP 1: Route extracts ?code= and ?next= from URL
    → nextParam = ?next= value, default = '/reset-password'

STEP 2: Whitelist check
    SAFE_PATHS = ['/reset-password', '/dashboard/student', '/dashboard/teacher',
                  '/dashboard/parent', '/dashboard/admin', '/login']
    → next = SAFE_PATHS.includes(nextParam) ? nextParam : '/reset-password'

STEP 3: supabase.auth.exchangeCodeForSession(code)
    → CASE A: Success
        → Session established via cookie
        → Redirect → next (= '/reset-password')
    → CASE B: Code invalid or expired
        → Redirect → /forgot-password?error=expired
        → Page shows: "Link expired. Please request a new one."

PART C — Set new password

START: User on /reset-password with valid session from callback

STEP 1: Page listens for PASSWORD_RECOVERY auth event
    → Event fires → password form becomes visible
    → No event → form stays hidden (cannot set password without token)

STEP 2: User enters new password + confirm password
    → Validation:
        □ ≥ 8 characters?
        □ Contains ≥1 letter AND ≥1 number?
        □ Password === confirm password?
    → Any failure → inline error, form stays

STEP 3: supabase.auth.updateUser({ password: newPassword })
    → CASE A: Success
        → router.push('/login?reset=success')
        → Login page shows green banner "Password updated!"
    → CASE B: Failure
        → Error displayed inline
```

---

### 4.6 Admin Full Journey

```
START: Admin logs in → /dashboard/admin

─── DASHBOARD MOUNT ───────────────────────────────────────────────
STEP 1: supabase.auth.getUser()
    → No user → router.push('/login')
    → User found → fetch profile

STEP 2: profile.role !== 'admin'?
    → router.push(`/dashboard/${profile.role}`)
    (Role mismatch protection at page level in addition to middleware)

STEP 3: profile loaded → fetchAll() called
    Data fetched in parallel:
    - users (profiles, paginated)
    - announcements
    - tests
    - activity_log
    - all attempts
    - courses
    - assignments + submissions
    - attendance records
    - quests
    - platform_settings (double XP state, XP level thresholds)

STEP 4: Tab defaults to 'home'
    → Overview rendered: stats grid, recent activity, quick-action buttons

STEP 5: Deep link check
    → searchParams.get('tab') → if valid tabId → setTab(tabId)
    → searchParams.get('createUser') === '1' → open Create User modal

─── TAB: home ──────────────────────────────────────────────────────
STEP 1: Platform stats displayed:
    Total users, active tests, enrollments, live announcements
STEP 2: Double XP section
    → Admin clicks "Activate Double XP"
    → platform_settings row updated: double_xp_active=true, ends_at=now+3600000
    → XP timer countdown shown in all student dashboards
STEP 3: Recent activity list (last 10 entries)

─── TAB: users ─────────────────────────────────────────────────────
STEP 1: User list renders (PAGE_SIZE=20 per page)
STEP 2: Search (debounced 300ms) → filters by name/email
STEP 3: Filters: role dropdown, XP range, join date range
STEP 4: Sort: latest | oldest | xp_desc | xp_asc | name_az

CREATE USER:
STEP 5: Click "+ Create User" → modal opens
    Fields: name, email, role (admin|teacher|student|parent)
STEP 6: POST /api/batch-create-user { name, email, role }
    → Validation server-side: email format, role in whitelist
    → Success: new profile row + auth user created, QGX ID returned
    → Modal closes, user list refreshes

VIEW / EDIT USER:
STEP 7: Click user row → user modal opens
    Shows: profile details, join date, XP, QGX ID
    Admin can update: name, phone (via direct supabase update)

DELETE USER:
STEP 8: Admin clicks "Delete" on user row
    → Confirmation modal: "Are you sure?"
    → POST /api/delete-user { userId }
    → Guard: userId === admin's own ID? → 403 (blocked)
    → Guard: target is admin AND only 1 admin left? → 403 (blocked)
    → Success: user deleted from auth + profiles

─── TAB: announcements ─────────────────────────────────────────────
STEP 1: Announcement list rendered (all announcements)
STEP 2: "+ New Announcement" → modal
    Fields: title, body, target (all|teachers|students|parents),
            pinned (checkbox), expires_at (datetime)
STEP 3: supabase.from('announcements').insert(...)
    → Success: list refreshes
    → Realtime channel pushes update to recipients
STEP 4: Edit: click announcement → edit modal → supabase.update()
STEP 5: Delete: click delete button → confirmation → supabase.delete()

─── TAB: tests ─────────────────────────────────────────────────────
STEP 1: AdminTestModule renders all tests platform-wide
STEP 2: View test details, attempt counts
STEP 3: Delete test (admin only — full data deletion)

─── TAB: courses ────────────────────────────────────────────────────
STEP 1: All courses listed (platform-wide)
STEP 2: Admin can view, but course CRUD is teacher-owned

─── TAB: assignments ────────────────────────────────────────────────
STEP 1: All assignments platform-wide
STEP 2: Admin can view submissions

─── TAB: attendance ─────────────────────────────────────────────────
STEP 1: All attendance records platform-wide
STEP 2: Admin reviews excuse requests: approved → 'approved', rejected → 'rejected'

─── TAB: forums ─────────────────────────────────────────────────────
STEP 1: ForumModule (full access — admin can post, pin, delete any post)
STEP 2: Create post → flair, tags, markdown body, optional attachment
STEP 3: Pin post → pinned=true (appears at top of feed for all users)
STEP 4: Delete post or comment (any author)

─── TAB: analytics ──────────────────────────────────────────────────
STEP 1: Platform-wide performance charts
STEP 2: Test score distribution, enrollment trends, attendance rates
STEP 3: Filter by date range, subject

─── TAB: activity ───────────────────────────────────────────────────
STEP 1: Audit log of all admin actions (logActivity entries)
STEP 2: Search + filter by type, date, actor
STEP 3: Paginated (PAGE_SIZE=20)

─── TAB: settings ───────────────────────────────────────────────────
STEP 1: Platform settings loaded from platform_settings table
STEP 2: XP Level thresholds: admin can adjust tier XP values
STEP 3: Grade weights: tests%, assignments%, attendance%, participation%
STEP 4: Save → supabase.upsert() on platform_settings

─── TAB: batch ──────────────────────────────────────────────────────
STEP 1: AdminBatchModule renders
STEP 2: Admin fills multiple user rows (name, email, role per row)
STEP 3: Submit → each row → POST /api/batch-create-user
STEP 4: Per-row result shown: success (green) or error (red) with message

─── TAB: calendar ───────────────────────────────────────────────────
STEP 1: CalendarModule renders with admin's events
STEP 2: Month/week view toggle
STEP 3: Click date → event detail panel
STEP 4: Add personal event → title, date, note
STEP 5: Export → ICS file download

─── TAB: profile ────────────────────────────────────────────────────
STEP 1: ProfileTab renders admin's own profile
STEP 2: Edit: name, phone, avatar upload
STEP 3: Change password: old + new + confirm → supabase.auth.updateUser()
STEP 4: Avatar upload → Supabase Storage → URL saved to profile.avatar_url

─── LOGOUT ──────────────────────────────────────────────────────────
STEP 1: Click "Logout" in sidebar footer
STEP 2: supabase.auth.signOut()
    → Error → toast "Logout failed"
    → Success → router.replace('/login')
```

---

### 4.7 Teacher Full Journey

```
START: Teacher logs in → /dashboard/teacher

─── DASHBOARD MOUNT ───────────────────────────────────────────────
STEP 1: supabase.auth.getUser()
    → No user → router.push('/login')
STEP 2: profile.role !== 'teacher' → router.push(`/dashboard/${role}`)
STEP 3: profile loaded → fetchAll() — Promise.allSettled:
    - teacher's tests
    - teacher's courses (+ file counts)
    - teacher's assignments + submissions
    - all announcements
    - all students (profiles where role='student')
    - all parents
    - all attempts on teacher's tests
    - teacher's timetable slots
    - active quests
    - quest progress
STEP 4: Tab defaults to 'home'
    → Stats: total students, avg score, open assignments, live tests
    → Today's announcements feed (filtered: target='all' or target='teachers')

─── TAB: tests ──────────────────────────────────────────────────────
TeacherTestModule:

CREATE TEST:
STEP 1: "+ New Test" → form
    Fields: title, subject, type (test|quiz), duration (min), scheduled_date,
            scheduled_time, xp_reward (0–500), anti-cheat settings
STEP 2: Save → supabase.insert('tests', {...})
STEP 3: Add questions one by one:
    Type: MCQ | MSQ | TF | FIB | Match
    Fields per question: text, options, answer, marks, order_index
STEP 4: Optionally: "Generate with AI"
    → Upload PDF/PPT/image (max 5MB) or type prompt
    → POST /api/ai { file, role:'teacher' }
    → Response: JSON array of questions
    → Teacher reviews generated questions in preview panel
    → Tick to import individual questions into active test

EDIT TEST:
STEP 5: Click test → edit form → modify fields or questions → save

DELETE TEST:
STEP 6: Click delete → confirmation → cascades all attempts deleted

─── TAB: timetable ──────────────────────────────────────────────────
TimetableModule:
STEP 1: Weekly grid rendered (Mon–Sat)
STEP 2: "+ Add Slot" → form: subject, day, time (HH:MM validated), room
STEP 3: supabase.insert('timetable_slots', {teacher_id, ...})
STEP 4: Edit slot → update fields
STEP 5: Delete slot → confirmation → supabase.delete()

─── TAB: courses ────────────────────────────────────────────────────
TeacherCourseModule:

CREATE COURSE:
STEP 1: "+ New Course" → form: title, subject, description
STEP 2: Save → status = 'draft'
STEP 3: Upload files:
    → File picker → max 50MB per file
    → Fields: name, section (string), order_index
    → Supabase Storage upload → URL saved to course_files
STEP 4: Reorder files via drag-and-drop
STEP 5: Publish → status = 'published'
    → Course now visible to students for enrollment

MANAGE ENROLLED STUDENTS:
STEP 6: View enrollments list

DELETE COURSE:
STEP 7: Delete → confirmation → cascades: files, linked assignments deleted

─── TAB: assignments ────────────────────────────────────────────────
TeacherAssignmentModule:

CREATE ASSIGNMENT:
STEP 1: "+ New Assignment" → form:
    title, description, course_id, due_date (≥ today), priority, max_points,
    optional attachment
STEP 2: supabase.insert('assignments', {...})

GRADE SUBMISSIONS:
STEP 3: Click assignment → submissions list
STEP 4: Click student submission → read text_response or download file
STEP 5: Enter score (0–max_points) + feedback text → save
STEP 6: Export CSV: filename, student name, score, is_late, submitted_at

BATCH GRADE (via batch-grades tab):
→ Upload CSV (student_id, score, feedback) → bulk upsert grades

─── TAB: attendance ─────────────────────────────────────────────────
TeacherAttendanceModule:
STEP 1: Select subject + date
STEP 2: All students listed → mark each: present | absent | late | excused
STEP 3: Optional note per student
STEP 4: Save → supabase.upsert('attendance_records', [...])
STEP 5: Review excuse requests: click pending → approve/reject
    → Approved: attendance record updated to 'excused'
STEP 6: Export CSV of attendance for selected date range

─── TAB: grades ─────────────────────────────────────────────────────
TeacherGradesModule:
STEP 1: Per-student grade aggregation displayed
STEP 2: Filters: date range, subject, student search
STEP 3: Download CSV per student or per test

─── TAB: analytics ──────────────────────────────────────────────────
STEP 1: Class performance charts (teacher's tests only)
STEP 2: Score distribution, pass/fail rates, attempt counts
STEP 3: Student ranking within teacher's scope

─── TAB: quests ─────────────────────────────────────────────────────
STEP 1: View active quests (read-only for teacher)
STEP 2: View per-student quest progress

─── TAB: calendar ───────────────────────────────────────────────────
CalendarModule: same as admin (personal + academic events, ICS export)

─── TAB: live-classes ───────────────────────────────────────────────
LiveClassModule:

SCHEDULE:
STEP 1: "+ New Class" → form: title, course_id, subject, scheduled_at, duration
STEP 2: System generates Jitsi room_id (UUID) + room_url
STEP 3: Status = 'scheduled'

START CLASS:
STEP 4: Click "Go Live" → status = 'live'
    → Batch notification sent to enrolled students
    → room_url opens in new tab

END CLASS:
STEP 5: Click "End Class" → status = 'ended'

─── TAB: announcements ──────────────────────────────────────────────
STEP 1: Create announcement: title, body, target (students|parents|all), pinned
STEP 2: Filter + search own announcements
STEP 3: Edit own announcement → update
STEP 4: Delete own announcement

─── TAB: forums ─────────────────────────────────────────────────────
ForumModule (teacher can post, pin, delete own posts, mark best answers)

─── TAB: plagiarism ─────────────────────────────────────────────────
PlagiarismModule:
STEP 1: Select assignment from teacher's own list
STEP 2: Click "Scan"
    → Fetches up to 100 submissions
    → Client-side 4-gram similarity computed for all pairs
    → Pairs above threshold displayed
STEP 3: Adjust threshold slider (10%–90%, default 30%)
    → Results re-filtered immediately (no re-scan)
STEP 4: Results: pairs with % similarity, color-coded, shared phrases
STEP 5: Flag workflow: each pair shows status (open|reviewed|dismissed)
    → Click to change status

─── TAB: meetings ───────────────────────────────────────────────────
MeetingSchedulerModule (teacher view):
STEP 1: "+ Add Slot" → date (future), start_time, end_time, notes
STEP 2: Slot saved with status='available'
STEP 3: View booked appointments from parents

─── TAB: pred-alerts ────────────────────────────────────────────────
PredictiveAlertsModule:
STEP 1: Compute risk for all scoped students
    Risk score components applied:
    attendance <70% +30, 70-85% +15
    test avg <40% +30, 40-60% +15
    declining trend +15
    ≥3 missed assignments +20, 1-2 +10
    inactivity 14 days +10
STEP 2: Students sorted by risk score descending
STEP 3: Colour-coded: red (High ≥40), amber (Medium 20-39), green (Low <20)
STEP 4: Expand student → see individual risk flags with exact values + trend indicator
STEP 5: Click "Refresh" → full recompute

─── TAB: messaging ──────────────────────────────────────────────────
MessagingModule: DM and group chat (teacher ↔ student, teacher ↔ parent)

─── TAB: report-card ────────────────────────────────────────────────
ReportCardModule (teacher writes):
STEP 1: Select student + term (free-text, e.g. "Term 1 2026")
STEP 2: Write comment (free text)
STEP 3: Set conduct: excellent | good | satisfactory | needs_improvement | poor
STEP 4: Save → upsert to report_comments (one per student+term)

─── TAB: batch-grades ───────────────────────────────────────────────
TeacherBatchGradeModule:
STEP 1: Select assignment
STEP 2: Upload CSV: columns [student_id, score, feedback]
STEP 3: Preview parsed rows
STEP 4: Submit → bulk upsert grades to submissions table

─── TAB: profile ─────────────────────────────────────────────────────
ProfileTab: Edit name, phone, avatar upload, change password
```

---

### 4.8 Student Full Journey

```
START: Student logs in → /dashboard/student

─── DASHBOARD MOUNT ───────────────────────────────────────────────
STEP 1: supabase.auth.getUser()
    → No user → router.push('/login')
STEP 2: profile.role !== 'student' → router.push(`/dashboard/${role}`)
STEP 3: profile loaded → fetchAll() — Promise.allSettled:
    - available tests (non-teacher filter)
    - student's own attempts
    - all courses
    - enrolled course IDs
    - student's assignments + own submissions
    - timetable slots
    - announcements (target='all' or target='students')
    - all students (for leaderboard, collab)
    - all teachers (for messaging)
    - peer IDs (students in same courses)
    - double XP status from platform_settings
    - XP level thresholds from platform_settings
STEP 4: Offline detection: window.addEventListener('offline'/'online')
    → isOffline=true → orange banner: "△ You are offline"
STEP 5: Double XP detection:
    → doubleXP.active=true AND Date.now() < ends_at → yellow banner:
      "◈ DOUBLE XP HOUR ACTIVE — Earn 2× XP on all tests!"
STEP 6: Tab defaults to 'home'
STEP 7: Realtime channels subscribed:
    - announcements channel
    - messages channel (for DMs)

─── TAB: home ───────────────────────────────────────────────────────
STEP 1: Stats grid: current XP, level, streak, total tests
STEP 2: Today's timetable slots
STEP 3: Announcement feed (latest 5)
STEP 4: Due soon assignments (within 3 days)

─── TAB: tests ──────────────────────────────────────────────────────
StudentTestModule:

VIEW TESTS:
STEP 1: List of available tests
    → Shows: title, subject, questions count, duration, xp_reward, attempts
    → "Start" button disabled if attempts >= maxAttempts

TAKE TEST:
STEP 2: Click "Start" on a test
    → isExamMode = true → sidebar disabled (locked prop), nav items greyed out
    → Test interface renders with all questions loaded
    → If randomQ=true → questions in shuffled order
    → If fullscreen=true → document.documentElement.requestFullscreen()
    → If copyPaste=true → keydown listener blocks Ctrl+C, Ctrl+V, Ctrl+X
    → If tabSwitch=true → document.addEventListener('visibilitychange') → logs event
    → If timePerQ > 0 → per-question countdown timer starts

STEP 3: Student answers questions (MCQ radio, MSQ checkboxes, TF toggle, FIB text, Match dropdowns)
STEP 4: If requireAllAnswered=true → submit button inactive until all answered
STEP 5: Click "Submit"
    → If fullscreen active → document.exitFullscreen()
    → POST /api/submit-test { testId, answers: Map<questionId, answer> }

SERVER-SIDE (API):
    → Auth check: no user → 401
    → Role check: not student → 403
    → Test exists? → 404 if missing
    → Attempts check: attempts.length >= maxAttempts → 403 "Maximum attempts exceeded"
    → Deadline check: if scheduled → server computes deadline → if past → 403
    → Score computed per question type (see F-07 AC-07)
    → XP calculated: min(round(percent*xp_reward/100), 500) × (doubleXP ? 2 : 1)
    → atomic_xp_update RPC called (atomic XP persistence)
    → Ghost win check: percent > profile.score → ghost_wins++
    → Attempt row inserted
    → Response: { score, total, percent, xp_earned, badges_unlocked[] }

STEP 6: Results screen shown
    → isExamMode = false → sidebar re-enabled
    → Score, percentage, XP earned, new badges displayed
    → If allowImmediateReview=true → "Review Answers" button visible

─── TAB: courses ────────────────────────────────────────────────────
StudentCourseModule:

BROWSE:
STEP 1: All published courses listed
STEP 2: Filter by subject

ENROLL:
STEP 3: Click course → course detail
STEP 4: "Enroll" button (only if not already enrolled)
    → supabase.update('courses').eq('id', courseId).
         set enrolled = [...enrolled, studentId]

STUDY:
STEP 5: Click enrolled course → file list by section
STEP 6: Click file → open in-app preview (PDF viewer / image / video player)
         or download if type unsupported
STEP 7: Click "Mark Complete" → insert into course_progress (student_id, course_id, file_id)
STEP 8: When all files marked complete:
    → Certificate auto-issued:
        → Canvas 1200×850px PNG generated
        → Credential ID: QGX-XXXX-XXXX-XXXX-XXXX (base-32, no I/O/U/0/1)
        → QR code embedded (V2-L, encodes credential_id)
        → Saved to certificates table

RATE:
STEP 9: Click "Rate Course" → 1–5 star selector + optional review text
    → One rating per (student_id, course_id), upsert

UNENROLL:
STEP 10: "Unenroll" → confirm → removes student from enrolled[]

─── TAB: assignments ────────────────────────────────────────────────
StudentAssignmentModule:
STEP 1: Active assignments listed (not closed, not fully submitted)
STEP 2: Click assignment → detail view with description, due date, priority
STEP 3: Student writes text_response and/or uploads file (≤50MB)
STEP 4: "Save Draft" → is_draft=true, submission saved without finalizing
STEP 5: "Submit" → is_draft=false, submitted_at recorded
    → If Date.now() > due_date → is_late=true
STEP 6: Graded submission shows score and teacher feedback

─── TAB: attendance ─────────────────────────────────────────────────
StudentAttendanceModule:
STEP 1: Attendance calendar heatmap rendered
    → Each school day colored by status: present=green, absent=red,
      late=amber, excused=blue, no record=grey
STEP 2: Attendance rate displayed: (present+late+excused) / total × 100

─── TAB: grades ─────────────────────────────────────────────────────
StudentGradesModule:
STEP 1: All test attempts shown (score, %, date)
STEP 2: All assignment grades shown (score, feedback)
STEP 3: Computed weighted GPA displayed
STEP 4: Letter grade per category shown (A/B/C/D/F)
STEP 5: Export CSV of personal grades

─── TAB: timetable ──────────────────────────────────────────────────
TimetableModule (student view):
STEP 1: Weekly grid (Mon–Sat) with subject slots
STEP 2: Check-in button on today's slots
    → Click → supabase awards 10 XP
    → Can only claim once per slot per day (checked via attendance/xp table)

─── TAB: xp ─────────────────────────────────────────────────────────
XPEngine:
STEP 1: Current XP, level name, progress bar to next tier
STEP 2: Daily login bonus panel:
    → "Claim Daily XP" button
    → Shows: streak, today's bonus = 10 + min(streak×2, 40)
    → Click → supabase.rpc('claim_daily_login_xp')
    → Success → XP updated, streak incremented
    → Already claimed today → toast "Already claimed today"
STEP 3: Badge grid: 28 badges, locked/unlocked states
    → Unlocked badge shows name + unlock date
STEP 4: Activity heatmap: last 84 days color-coded by daily activity
STEP 5: XP Spark chart: last 14 days of daily XP
STEP 6: Leaderboard: sort by XP | Score | Ghost Wins
    → Top 3 in podium, rest paginated (PAGE_SIZE=20)
STEP 7: "QGX Wrapped" button → generates copyable summary text

─── TAB: forums ─────────────────────────────────────────────────────
ForumModule (student):
STEP 1: Feed shows posts sorted: hot | new | top
STEP 2: Search by title/tag
STEP 3: Filter by flair
STEP 4: Create post:
    → Title, body (markdown), flair, tags[], optional attachment (≤10MB)
    → Submit → supabase.insert('forum_posts')
STEP 5: Open post → view body (rendered markdown, XSS-safe)
STEP 6: Comment → text response
STEP 7: Like → toggle own user_id in post.likes[]
STEP 8: Bookmark → toggle own user_id in post.bookmarks[]
STEP 9: Edit own post → body updated, edited_at set
STEP 10: Delete own post or comment

─── TAB: calendar ───────────────────────────────────────────────────
CalendarModule: month/week views, academic events (tests, assignments,
live classes), personal events, ICS export

─── TAB: live-classes ───────────────────────────────────────────────
LiveClassModule (student):
STEP 1: List of scheduled/live classes
STEP 2: Status='live' → "Join" button enabled (green)
STEP 3: Click "Join" → room_url opens in new browser tab
STEP 4: Status='scheduled'/'ended' → "Join" button disabled

─── TAB: quests ─────────────────────────────────────────────────────
QuestModule:
STEP 1: Daily quests (3, deterministically seeded by today's date)
STEP 2: All active quests listed with progress bar
STEP 3: progress = target_count → "Claim" button active
STEP 4: Click "Claim" → POST /api/quests (claim action)
    → claimed=false → set claimed=true, award xp_reward
    → Already claimed → button disabled

─── TAB: collab ─────────────────────────────────────────────────────
CollaborationModule:
STEP 1: List of study rooms (groups of course peers)
STEP 2: Create room or join existing room
STEP 3: Real-time chat within room via messages table

─── TAB: ai-tutor ───────────────────────────────────────────────────
AiTutorModule:
STEP 1: Select enrolled course from dropdown (course title + subject as context)
STEP 2: Type question or attach file (PDF/PPT/image ≤5MB)
STEP 3: POST /api/ai { message, courseContext, file? }
    → Rate limit: 10/min. Exceeded → 429 toast
    → Streamed response displayed token-by-token
STEP 4: Conversation stored in ai_chats table (JSON array)
STEP 5: "New Chat" → new ai_chats row, conversation cleared

─── TAB: code ───────────────────────────────────────────────────────
CodePlaygroundModule:
STEP 1: Language selector: JavaScript | Python | HTML/CSS
STEP 2: Starter template loaded
STEP 3: Student writes code in editor
STEP 4: Ctrl+Enter (or "Run" button) → execute
    JS: Web Worker, 5s timeout → console output shown
    Python: built-in interpreter, 10k iteration limit → print output shown
    HTML: rendered in sandboxed iframe
STEP 5: Errors shown in red. "(no output)" if nothing printed.

─── TAB: messaging ──────────────────────────────────────────────────
MessagingModule:
STEP 1: Inbox: list of DM threads + group chats, unread count badges
STEP 2: Select thread → messages load
STEP 3: Realtime: new messages arrive without refresh
STEP 4: Actions per message: edit, soft-delete
STEP 5: Attachment: file upload (≤50MB) or voice note (MediaStream recording)
STEP 6: Mark as read on thread open

─── TAB: report-card ────────────────────────────────────────────────
ReportCardModule (student reads):
STEP 1: Term selector
STEP 2: Subject grades + overall GPA shown
STEP 3: Teacher comment + conduct rating shown
STEP 4: Print button → CSS @media print layout

─── TAB: my-analytics ───────────────────────────────────────────────
StudentAnalyticsModule:
STEP 1: Personal charts: test score trend (line), subject avg (bar),
        XP over time, submission rate
STEP 2: Filter by date range, subject

─── TAB: certificates ───────────────────────────────────────────────
CertificateModule:
STEP 1: Earned certificates listed (one per completed course)
STEP 2: "Download" → PNG file download
    → Canvas renders 1200×850px PNG with name, course, date, QR, credential_id

─── TAB: profile ─────────────────────────────────────────────────────
ProfileTab: Edit name, phone, avatar upload, change password

─── EXAM MODE (overlays all tabs) ───────────────────────────────────
During test-taking:
→ locked=true passed to DashboardLayout
→ All nav items: opacity 0.45, pointerEvents:'none'
→ Topbar shows "exam mode" label instead of tab name
→ Hamburger button disabled
→ Sidebar cannot be opened
→ Exit: only after test submission (isExamMode=false)
```

---

### 4.9 Parent Full Journey

```
START: Parent logs in → /dashboard/parent

─── DASHBOARD MOUNT ───────────────────────────────────────────────
STEP 1: supabase.auth.getUser()
    → No user → router.push('/login')
STEP 2: profile.role !== 'parent' → router.push(`/dashboard/${role}`)
STEP 3: loadLinkedStudents(profile):
    → Query parent_students where parent_id = profile.id
    → Fetch full profile rows for each student_id
    → linkedStudents[] populated
    → selectedStudent = linkedStudents[0] (first child auto-selected)
    → loadStudentData(selectedStudent)
STEP 4: loadStudentData(student):
    → Fetch: attempts, attendance, tests, assignments+submissions, timetable, excuses
STEP 5: Tab defaults to 'home'

─── HOME PAGE ───────────────────────────────────────────────────────
STEP 1: Student selector at top of every page (if >1 child linked)
    → Dropdown or button group with child names
    → Select different child → loadStudentData() for new selection
STEP 2: If NO children linked:
    → "Link a Student" CTA shown
    → QGX ID input + "Link" button displayed

LINK A CHILD:
STEP 3: Enter child's QGX ID
STEP 4: supabase.from('profiles').select('*').eq('qgx_id', code.toUpperCase())
    → Not found → setLinkError('Student not found')
    → Found:
        → Insert into parent_students (parent_id, student_id)
        → setLinkedStudents([...linkedStudents, student])
        → setSelectedStudent(student)
        → loadStudentData(student)

STEP 5: Stats overview for selected child:
    → Attendance rate, avg test score, active assignments

─── TAB: grades ─────────────────────────────────────────────────────
STEP 1: selectedStudent's test attempts listed (score, %, test title, date)
STEP 2: Assignment submissions (score, teacher feedback, is_late)
STEP 3: Computed GPA for child
    (read-only — no grading actions available to parent)

─── TAB: attendance ─────────────────────────────────────────────────
STEP 1: selectedStudent's attendance records shown
STEP 2: Calendar heatmap (same view as student's own view, read-only)
STEP 3: Attendance rate displayed

─── TAB: timetable ──────────────────────────────────────────────────
STEP 1: selectedStudent's timetable shown (read-only grid, no check-in)

─── TAB: report ─────────────────────────────────────────────────────
ReportCardModule (parent reads child's report):
STEP 1: Term selector
STEP 2: Child's term report card shown: subject grades, GPA, comment, conduct
STEP 3: Print layout available

─── TAB: excuses ────────────────────────────────────────────────────
STEP 1: Past excuses for selectedStudent listed (date, reason, status)
STEP 2: "+ New Excuse" form:
    Fields: child (from linkedStudents), date, reason
STEP 3: supabase.insert('absence_excuses', { parent_id, student_id, date, reason, status:'pending' })
STEP 4: Excuse status shown: pending | approved | rejected

─── TAB: meetings ───────────────────────────────────────────────────
MeetingSchedulerModule (parent view):
STEP 1: List of all teachers with available slots
STEP 2: Click teacher → available slots shown
STEP 3: Click slot → "Book" button
    → slot.status = 'booked', slot.parent_id = profile.id
STEP 4: Booked slot disappears from available list
STEP 5: "My Bookings" section shows confirmed appointments

─── TAB: messaging ──────────────────────────────────────────────────
MessagingModule (parent ↔ teacher only):
STEP 1: Load teacher list and DM threads
STEP 2: Send message to teacher
STEP 3: Realtime: new messages delivered

─── TAB: alerts ─────────────────────────────────────────────────────
STEP 1: Academic alerts computed from selectedStudent's data:
    → Low attendance (<70%) → alert generated
    → Low avg test score (<50%) → alert generated
    → Declining trend → alert generated
    → Missed assignments → alert generated
STEP 2: Alerts listed with type and message
STEP 3: No alert action available to parent (read-only)

─── TAB: profile ─────────────────────────────────────────────────────
ProfileTab: Edit own profile, avatar, password
```

---

## 5. CONDITIONAL FLOWS

### 5.1 Not Logged In — Any Protected Route

```
Trigger: Request hits /dashboard/:path*

Flow:
→ Middleware: supabase.auth.getUser() → user = null
→ Construct redirect URL: /login?redirect={req.nextUrl.pathname}
→ return NextResponse.redirect(redirectUrl)
→ User lands on /login
→ After successful login, if redirect is safe (/dashboard/*) AND role matches → redirect to saved URL
→ If redirect is invalid → /dashboard/{role}
```

### 5.2 Wrong Role — Dashboard URL Mismatch

```
Trigger: Student visits /dashboard/admin (or any role mismatch)

Flow:
→ Middleware: getUser() → user found
→ Fetch profile.role = 'student'
→ dashRole = 'admin' (from URL path)
→ profile.role !== dashRole
→ Redirect → /dashboard/student
→ Student dashboard loads correctly
```

### 5.3 Invalid Role in Database

```
Trigger: profile.role = 'superadmin' (not in VALID_ROLES)

Flow:
→ Middleware: !VALID_ROLES.includes(profile.role)
→ Redirect → /login
→ User cannot access any dashboard
```

### 5.4 Profile Fetch Fails in Middleware

```
Trigger: Supabase DB error during middleware profile fetch

Flow:
→ try/catch block catches error
→ Redirect → /login (fail-safe)
→ User sees login page, no dashboard access
```

### 5.5 Session Expires / Signs Out in Another Tab

```
Trigger: supabase.auth.onAuthStateChange event = 'SIGNED_OUT'

Flow (all dashboards):
→ onAuthStateChange listener fires
→ router.push('/login')
→ User redirected to login immediately
```

### 5.6 Auth Callback — Expired/Invalid Code

```
Trigger: User clicks old or already-used password reset link

Flow:
→ /auth/callback?code=XXX
→ exchangeCodeForSession(code) → error returned
→ Redirect → /forgot-password?error=expired
→ Page shows: "Link expired. Please request a new one."
→ User can re-submit their email for a new link
```

### 5.7 Test — Max Attempts Exceeded

```
Trigger: Student tries to start a test that has no remaining attempts

Flow (client-side):
→ attempts.filter(a => a.test_id === test.id).length >= test.anti_cheat.maxAttempts
→ "Start" button not rendered (test shows as completed)

Flow (server-side guard):
→ POST /api/submit-test
→ Server re-checks attempts count
→ attempts.length >= maxAttempts → 403 "Maximum attempts exceeded"
→ Client shows error toast
```

### 5.8 Test — Submission After Deadline

```
Trigger: Student submits after scheduled_date + duration

Flow:
→ POST /api/submit-test
→ Server computes deadline = new Date(scheduled_date + 'T' + scheduled_time) + duration_ms
→ Date.now() > deadline → 403 "Deadline passed"
→ Client shows error toast
→ No score recorded, no XP awarded
```

### 5.9 Admin Visits /register

```
Trigger: Logged-in admin navigates to /register

Flow:
→ supabase.auth.getUser() → user found
→ Profile fetch: role = 'admin'
→ router.replace('/dashboard/admin?tab=users&createUser=1')
→ Create User modal opens automatically
```

### 5.10 Student Offline

```
Trigger: navigator.onLine = false (offline event fired)

Flow:
→ isOffline = true → orange banner rendered in student dashboard
→ Service worker: navigation requests → serve /offline.html
→ /api/* and /auth/* bypass cache → fail gracefully
→ When navigator.onLine = true → isOffline = false → banner removed
```

### 5.11 Parent Has No Linked Children

```
Trigger: Parent logs in for first time with no parent_students rows

Flow:
→ loadLinkedStudents() → data = [] (empty)
→ Tab 'home' shows "Link a Student" with QGX ID input
→ All Monitor tabs show empty states with prompts
→ No data requests made (no studentId to query for)
```

### 5.12 Course Has No Files — Certificate Never Issued

```
Trigger: Teacher creates a course but uploads no files

Flow:
→ course_files = [] for this course
→ Student enrolls → sees 0% progress
→ Certificate check: total files = 0, completed files = 0
→ condition: completedFiles.length >= courseFiles.length AND courseFiles.length > 0
→ Certificate NOT issued (guard prevents empty-certificate award)
```

### 5.13 Double XP — Expired Mid-Session

```
Trigger: doubleXP.ends_at passes while student is on dashboard

Flow:
→ doubleXP.active=true AND Date.now() > ends_at
→ Banner condition: doubleXP.active && (!ends_at || Date.now() < ends_at)
→ Boolean evaluates to false → banner disappears
→ Next test submission: server reads platform_settings → active=false
→ XP calculated at 1× rate
```

### 5.14 QGX ID Login — Not Found

```
Trigger: User types "QGX-XXX-INVALID" in login

Flow:
→ Input.toUpperCase().startsWith('QGX-') → true
→ supabase.from('profiles').select('email').eq('qgx_id', 'QGX-XXX-INVALID')
→ data = null OR error
→ setError('QGX ID not found')
→ setLoading(false)
→ User stays on /login
```

### 5.15 File Upload Exceeds 50MB

```
Trigger: User selects file > 52,428,800 bytes

Flow:
→ Client-side check: file.size > MAX_FILE_SIZE
→ Toast: "File too large. Maximum 50MB."
→ File not uploaded, no API call made
```

---

## 6. ROLE-BASED FLOWS

### 6.1 Who Can Access What (Summary)

```
LANDING PAGE (/)                     → ALL (public)
/login                               → ALL (public)
/register                            → student, teacher, parent (admin redirected away)
/forgot-password, /reset-password    → ALL (public)

/dashboard/admin                     → admin ONLY (middleware + page guard)
/dashboard/teacher                   → teacher ONLY
/dashboard/student                   → student ONLY
/dashboard/parent                    → parent ONLY

/api/ai                              → teacher (Q-gen mode), student (tutor mode)
/api/submit-test                     → student ONLY
/api/batch-create-user               → admin ONLY (service role key used server-side)
/api/delete-user                     → admin ONLY
/api/quests (GET)                    → admin ONLY
/api/quests (POST claim)             → student ONLY
```

### 6.2 Feature Access Matrix by Role

```
FEATURE                          ADMIN   TEACHER  STUDENT  PARENT
────────────────────────────────────────────────────────────────────
Create users                      ✓
Delete users (guarded)            ✓
Batch create users                ✓
Global announcements              ✓        ✓
Create tests                               ✓
AI question generation                     ✓
Take tests / submit               
  answers                                           ✓
Create courses                             ✓
Enroll in courses                                   ✓
Rate courses                                        ✓
Create assignments                         ✓
Submit assignments                                  ✓
Grade submissions                          ✓
Mark attendance                            ✓
View own attendance                                 ✓
View child attendance                                        ✓
AI tutor chat                                       ✓
Plagiarism scan                            ✓
Risk alerts view                           ✓
Create quests                     ✓
Complete quests / earn XP                           ✓
Activate Double XP                ✓
Host live classes                          ✓
Join live classes                                   ✓
Write report card comments                 ✓
View own report card                                ✓
View child's report card                                     ✓
Send DMs                                   ✓        ✓        ✓
Post in forum                     ✓        ✓        ✓
Pin forum posts                   ✓        ✓
Submit absence excuses                                       ✓
Approve absence excuses           ✓        ✓
Book meetings (as parent)                                    ✓
Offer meeting slots (teacher)              ✓
Link children                                                ✓
Manage platform settings          ✓
View activity audit log           ✓
View platform analytics           ✓
Earn badges / XP / certificates                     ✓
Use code playground                                 ✓
Study rooms (collab)                                ✓
Export CSV (grades/attendance)    ✓        ✓        ✓
```

---

## 7. STATE TRANSITIONS

### 7.1 User Session States

```
[No Session]
    │  Login (email+password or QGX ID)
    ▼
[Authenticated] ─── role:admin    → /dashboard/admin
               └── role:teacher  → /dashboard/teacher
               └── role:student  → /dashboard/student
               └── role:parent   → /dashboard/parent
    │  supabase.auth.signOut()  OR  SIGNED_OUT event
    ▼
[No Session] → /login
```

### 7.2 Test / Assessment Lifecycle

```
[Draft] → Teacher creates test, saves without publishing
    │  Teacher adds questions, sets anti-cheat config
    ▼
[Published / Active]
    │  Student clicks "Start"
    ▼
[In Progress — Exam Mode] (isExamMode=true, sidebar locked)
    │  Student answers all questions
    │  Students clicks "Submit"
    ▼
[Submitted] → POST /api/submit-test → Attempt row inserted
    │  Results shown to student
    ▼
[Completed] (maxAttempts reached for this student)
    └  "Start" button no longer shown

[Active] → deadline passed
    └  Server returns 403 on any new submission
```

### 7.3 Assignment Lifecycle

```
[Active] → Teacher creates assignment with due_date in future
    │  Student opens, writes response
    ▼
[Draft Saved] (is_draft=true)
    │  Student clicks "Submit"
    ▼
[Submitted] (is_draft=false, submitted_at recorded)
    │  If Date.now() > due_date → is_late=true
    │  Teacher opens submission, enters score + feedback
    ▼
[Graded] (score and feedback visible to student)

[Active] → Teacher sets status='closed'
    ▼
[Closed] → No new submissions accepted
```

### 7.4 Course Lifecycle

```
[Draft] → Teacher creates course, uploads files
    │  Teacher clicks "Publish"
    ▼
[Published]
    │  Student enrolls
    ▼
[Enrolled — In Progress] (student marks files complete one by one)
    │  All files marked complete
    ▼
[Enrolled — Completed] → Certificate auto-issued (canvas PNG generated)
    │  Student rates course (optional)
    └  Re-download certificate available any time

[Published] → Teacher deletes course
    ▼
[Deleted] → Files deleted from Storage, course_progress deleted (cascade)
```

### 7.5 Live Class Lifecycle

```
[Scheduled] → Teacher creates class with future scheduled_at
    │  Teacher clicks "Go Live"
    ▼
[Live] → Batch notification sent to students
    │  Students can join via room_url (opens Jitsi)
    │  Teacher clicks "End Class"
    ▼
[Ended] → Join button disabled for students / room inaccessible

[Scheduled] → Teacher deletes class (before going live)
    ▼
[Deleted]
```

### 7.6 Absence Excuse Lifecycle

```
[Pending] → Parent submits excuse (date + reason + child)
    │  Teacher/admin opens excuse review
    ├─ Teacher clicks "Approve"
    ▼
    [Approved] → attendance record for that date updated to 'excused'
    └─ Teacher clicks "Reject"
    ▼
    [Rejected] → attendance record unchanged
```

### 7.7 Meeting Slot Lifecycle

```
[Available] → Teacher creates slot (date, time range)
    │  Parent browses and clicks "Book"
    ▼
[Booked] → parent_id recorded on slot
    Slot hidden from other parents' available lists

Teacher deletes slot (while Available):
    ▼
[Deleted]
```

### 7.8 Plagiarism Flag Lifecycle

```
[Open] → Pair detected above threshold by scan
    │  Teacher clicks "Mark Reviewed"
    ▼
    [Reviewed]
    └─ Teacher clicks "Dismiss"
    ▼
    [Dismissed] → hidden from active list (or filtered out)
```

### 7.9 Quest Lifecycle

```
[Inactive] → Admin creates quest with active=false
    │  Admin toggles active=true
    ▼
[Active] → visible to students
    │  Student's progress tracked automatically
    │  progress >= target_count
    ▼
[Completable] → "Claim XP" button enabled for student
    │  Student clicks "Claim"
    ▼
[Claimed] → XP awarded, claimed=true → button disabled permanently

[Active] → Admin toggles active=false
    ▼
[Inactive] → hidden from student view
```

### 7.10 XP Level Transition

```
[Level N]
    │  XP crosses next tier threshold
    ▼
[Level N+1] → Level-up celebration modal triggered with confetti
    │  Toast shown: "You reached Level [N+1]!"
    └  Progress bar resets relative to new tier range

Tiers: L1(0) → L2(500) → L3(1500) → L4(3000) → L5(5000) → L6(8000) → L7(∞)
```

### 7.11 PWA / Service Worker Lifecycle

```
[No SW] → First load
    │  layout.tsx registers /sw.js via navigator.serviceWorker.register
    ▼
[SW Installing] → Caches static assets under cache name 'qgx-v4'
    │  skipWaiting() called → immediate activation
    ▼
[SW Active] → clients.claim()
    │  Network-first for navigation; stale-while-revalidate for assets
    │  /api/* and /auth/* → network-only (bypass cache)
    │  Device goes offline
    ▼
[Offline] → Navigation request → serve /offline.html from cache
    │  Device comes back online
    ▼
[SW Active — Online]

[New SW deployed] → Old SW in background, new SW installs
    │  Old cache names purged on activate
    ▼
[New SW Active]
```

---

## 8. FORBIDDEN FLOWS

The following transitions must NEVER occur. They are prevented by middleware, API guards, server-side role checks, and client-side guards.

### 8.1 Authentication Violations

```
FORBIDDEN-01: An unauthenticated user accesses any /dashboard/* route.
  PREVENTED BY: Middleware checks getUser() → null → redirect /login

FORBIDDEN-02: A user accesses a dashboard for a different role.
  Example: student visits /dashboard/admin.
  PREVENTED BY: Middleware: profile.role !== dashRole → redirect to correct role

FORBIDDEN-03: A user with an invalid role value (not in VALID_ROLES) accesses any dashboard.
  PREVENTED BY: Middleware: VALID_ROLES check → redirect /login

FORBIDDEN-04: A user bypasses the redirect parameter to access any non-/dashboard/ URL.
  PREVENTED BY: isSafeRedirect() requires path.startsWith('/dashboard/')
```

### 8.2 Registration Violations

```
FORBIDDEN-05: Admin self-registers via /register.
  PREVENTED BY: /register page checks if logged user is admin → redirect to
                /dashboard/admin?tab=users&createUser=1

FORBIDDEN-06: A user self-registers with role='admin'.
  PREVENTED BY: Role selector on /register does NOT include 'admin' option.
                Server-side (batch-create-user API) validates role whitelist.
```

### 8.3 User Management Violations

```
FORBIDDEN-07: Admin deletes their own account via the admin panel.
  PREVENTED BY: /api/delete-user: userId === currentUserId → 403

FORBIDDEN-08: Deleting the last remaining admin account.
  PREVENTED BY: /api/delete-user: target is admin AND admin count ≤ 1 → 403
```

### 8.4 Test / Assessment Violations

```
FORBIDDEN-09: A non-student submits test answers.
  PREVENTED BY: POST /api/submit-test: profile.role !== 'student' → 403

FORBIDDEN-10: A student submits more attempts than maxAttempts.
  PREVENTED BY: Server re-checks attempt count before scoring → 403

FORBIDDEN-11: A student submits after the test deadline.
  PREVENTED BY: Server computes deadline, checks Date.now() → 403

FORBIDDEN-12: XP is applied without atomicity (causing race condition on concurrent submissions).
  PREVENTED BY: Server uses atomic_xp_update RPC (DB-level atomicity)

FORBIDDEN-13: Tab navigation occurs while a student is in Exam Mode.
  PREVENTED BY: locked=true prop disables all nav items (pointerEvents:'none')
```

### 8.5 Content & Data Violations

```
FORBIDDEN-14: JavaScript is executed via forum post body (XSS).
  PREVENTED BY: HTML entities escaped before rendering; only https:// URLs
                rendered as links; javascript: URIs blocked

FORBIDDEN-15: Open redirect via ?redirect= or ?next= parameter.
  PREVENTED BY: /login: isSafeRedirect() checks for /dashboard/ prefix
                /auth/callback: SAFE_PATHS whitelist exact match

FORBIDDEN-16: Student views another student's private data (grades, submissions).
  PREVENTED BY: Supabase RLS on all tables (enforced at DB level); client
                queries always filtered by student's own ID

FORBIDDEN-17: Parent views data for students they are not linked to.
  PREVENTED BY: RLS on profiles; loadStudentData() only called with
                IDs from parent_students where parent_id = own ID

FORBIDDEN-18: Teacher creates or modifies another teacher's tests/courses.
  PREVENTED BY: INSERT/UPDATE operations include teacher_id = own ID;
                RLS enforces ownership

FORBIDDEN-19: Student earns XP twice from the same daily login.
  PREVENTED BY: claim_daily_login_xp RPC checks date; returns error if
                already claimed today → toast shown, no XP applied

FORBIDDEN-20: Student claims quest XP twice.
  PREVENTED BY: quest_progress.claimed=true check before award;
                button disabled client-side after first claim
```

### 8.6 API Security Violations

```
FORBIDDEN-21: Unauthenticated call to /api/ai, /api/submit-test,
              /api/batch-create-user, /api/delete-user, /api/quests.
  PREVENTED BY: All API routes call supabase.auth.getUser() server-side;
                no valid session → 401

FORBIDDEN-22: Non-admin calls /api/batch-create-user or /api/delete-user.
  PREVENTED BY: API re-fetches profile.role server-side using service role key;
                role !== 'admin' → 403

FORBIDDEN-23: AI API receives files >5MB.
  PREVENTED BY: Client-side check + server-side size validation → 400

FORBIDDEN-24: Any user exceeds 10 AI requests/minute.
  PREVENTED BY: In-memory rate limiter (Map<userId, {count, resetAt}>) → 429

FORBIDDEN-25: Password reset link redirects to external URL.
  PREVENTED BY: /auth/callback SAFE_PATHS whitelist; any unlisted ?next= → /reset-password
```

---

## 9. API ROUTE FLOWS

### 9.1 POST /api/ai

```
REQUEST: multipart/form-data { message?, file?, role:'teacher'|'student' }

STEP 1: supabase.auth.getUser() → no user → 401
STEP 2: Rate limit check (10/min per userId)
         → exceeded → 429 "Rate limit exceeded. Retry after Ns."
STEP 3: If file present:
         → file.size > 5MB → 400 "File too large"
         → Unsupported type → 400
         → Extract text content from PDF/PPT/image
STEP 4: Determine mode:
         → role='teacher' → question generation prompt
         → role='student'  → AI tutor prompt with course context
STEP 5: POST to Groq API (streaming)
STEP 6: For question generation: parse JSON array from response
         → Extract between first '[' and last ']'
         → Invalid JSON → 500 "Failed to parse questions"
STEP 7: Return: generated questions array (teacher) OR streamed response (student)
```

### 9.2 POST /api/submit-test

```
REQUEST: JSON { testId: string, answers: Record<questionId, answer> }

STEP 1: supabase.auth.getUser() → no user → 401
STEP 2: profile.role !== 'student' → 403 "Access denied"
STEP 3: Fetch test by testId → not found → 404
STEP 4: Fetch attempts for this student+test
         → attempts.length >= test.anti_cheat.maxAttempts → 403 "Maximum attempts exceeded"
STEP 5: Deadline check (if test.scheduled_date exists)
         → compute deadline = scheduledStart + duration
         → Date.now() > deadline → 403 "Deadline passed"
STEP 6: Score each question:
         MCQ: answers[q.id] === q.answer → q.marks
         MSQ: sorted arrays deep-equal → q.marks else 0
         TF:  answers[q.id] === q.answer (boolean check) → q.marks
         FIB: answers[q.id].trim().toLowerCase() === q.answer.trim().toLowerCase() → q.marks
         Match: all pairs match (trimmed, lowercase) → q.marks else 0
STEP 7: total = sum of all q.marks
         score = sum of earned marks
         percent = score/total * 100
STEP 8: xp_earned = Math.min(Math.round(percent / 100 * test.xp_reward), 500)
         If doubleXP active: xp_earned * 2 (hard cap: 1000 during 2×)
STEP 9: supabase.rpc('atomic_xp_update', { user_id, xp_to_add })
         → Updates profile.xp atomically (no race condition)
STEP 10: Ghost win check:
          percent > profile.score → profile.ghost_wins++, profile.score = percent
STEP 11: Insert into attempts: { student_id, test_id, score, total, percent,
          xp_earned, answer_map, submitted_at }
STEP 12: Return: { score, total, percent, xp_earned, passed, badges_unlocked }
```

### 9.3 POST /api/batch-create-user

```
REQUEST: JSON { name: string, email: string, role: string }

STEP 1: supabase.auth.getUser() → no user → 401
STEP 2: Fetch profile.role using SERVICE ROLE KEY
         → role !== 'admin' → 403
STEP 3: Validate email format → invalid → 400 "Invalid email"
STEP 4: Validate role in ['admin','teacher','student','parent'] → invalid → 400

STEP 5: supabase (service role).auth.admin.createUser({ email, password: generated,
          email_confirm: true, user_metadata: { name, role } })
         → Error (email taken) → 400 with error message

STEP 6: Generate QGX ID via RPC generate_qgx_id(p_role)
STEP 7: Insert into profiles: { id, name, email, role, qgx_id, avatar, joined }
STEP 8: Return: { success: true, qgx_id, userId }
```

### 9.4 POST /api/delete-user

```
REQUEST: JSON { userId: string }

STEP 1: supabase.auth.getUser() → no user → 401
STEP 2: Fetch caller's profile.role using SERVICE ROLE KEY
         → role !== 'admin' → 403

STEP 3: Guard: userId === caller.id → 403 "Cannot delete your own account"
STEP 4: Fetch target profile.role
         → role === 'admin' → count all admins
         → adminCount <= 1 → 403 "Cannot delete the last administrator"

STEP 5: supabase (service role).auth.admin.deleteUser(userId)
         → Cascades: profiles row deleted (FK cascade)
STEP 6: Return: { success: true }
```

### 9.5 GET /api/quests

```
REQUEST: No body

STEP 1: supabase.auth.getUser() → no user → 401
STEP 2: Fetch profile.role → role !== 'admin' → 403
STEP 3: supabase.from('quests').select('*').order('created_at', desc)
STEP 4: Return: Quest[]
```

### 9.6 POST /api/quests

```
REQUEST: JSON { title, description?, type, target_type, target_count, xp_reward, active }

STEP 1: supabase.auth.getUser() → no user → 401
STEP 2: Fetch profile.role
STEP 3: If admin → CRUD operations (create/update/delete quests)
         If student + action='claim' → quest XP claim flow
STEP 4 (admin create): validate title 1-180 chars, type in enum, xp_reward 1-5000
         → failure → 400 with message
         → success → insert quest row
STEP 4 (student claim): fetch quest_progress, verify completed=true, claimed=false
         → award xp_reward → set claimed=true
STEP 5: Return: { success: true, quest? }
```

### 9.7 GET /auth/callback

```
REQUEST: ?code={code}&next={safePath}

STEP 1: Extract code and next from searchParams
STEP 2: next validation: SAFE_PATHS whitelist check
         Unlisted → next = '/reset-password'
STEP 3: code present?
         → supabase.auth.exchangeCodeForSession(code)
             Success → set session cookies → redirect to `next`
             Failure → redirect to /forgot-password?error=expired
         → No code → redirect to /forgot-password?error=expired
```

---

*End of APP_FLOW.md*
*Total: 8 public pages · 14 admin tabs · 20 student tabs · 20 teacher tabs · 10 parent tabs*
*Total screens: 72 · API routes: 6 · State machines: 11 · Forbidden flows: 25*
