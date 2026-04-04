# PROJECT CHECKLIST MATRIX

Status legend:
- PASS: verified by executed command or code-path evidence
- FAIL: verified defect
- MANUAL REQUIRED: requires interactive runtime/session/browser validation
- NOT TESTABLE HERE: requires external system state (production Supabase/Vercel/real email)

## 1) Authentication Handles

| Area | Role | Feature | Test Case | Status | Notes | Evidence |
|---|---|---|---|---|---|---|
| Auth | All | Login with email | Valid email + password routes to role dashboard | MANUAL REQUIRED | Logic exists; interactive flow needed | app/login/page.tsx |
| Auth | All | Login with QGX ID | QGX ID resolves to email then sign-in | MANUAL REQUIRED | Resolution path implemented | app/login/page.tsx |
| Auth | All | Invalid credentials | Error message displayed and no redirect | MANUAL REQUIRED | Error handling implemented | app/login/page.tsx |
| Auth | All | Safe redirect handling | redirect param only allows /dashboard/* path | PASS | Open redirect mitigated | app/login/page.tsx |
| Auth | Student/Teacher/Parent | Register | Create account + profile enrichment + role redirect | MANUAL REQUIRED | Depends on Supabase auth config | app/register/page.tsx |
| Auth | Admin | Register availability | Admin is intentionally not self-registrable via UI | PASS | Role dropdown excludes admin | app/register/page.tsx |
| Auth | All | Forgot password | Email reset request dispatch | MANUAL REQUIRED | Needs real email provider | app/forgot-password/page.tsx |
| Auth | All | Reset password | Recovery token processing + password update | MANUAL REQUIRED | Needs valid recovery link | app/reset-password/page.tsx |
| Auth | All | Auth callback exchange | code exchange and safe redirect | PASS | Fallback on error implemented | app/auth/callback/route.ts |
| Auth | All | Dashboard route guard | /dashboard/:role blocked unless authenticated + role match | PASS | middleware enforces role | middleware.ts |

## 2) Dashboard and Sidebar Coverage

### Student Sidebar

| Area | Role | Feature | Test Case | Status | Notes | Evidence |
|---|---|---|---|---|---|---|
| Sidebar | Student | Overview | Loads stats + announcements | MANUAL REQUIRED | Data and UI wiring present | app/dashboard/student/page.tsx |
| Sidebar | Student | Tests | Attempt flow + scoring submit | MANUAL REQUIRED | API route and module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Courses | Enrollment + materials flow | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Assignments | Submit text/file and status tracking | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Attendance | Student attendance visibility | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Grades | Grade aggregation view | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Timetable | Timetable + check-in path | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | XP Hub | XP engine and tiers | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Forums | Posts/comments interactions | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Calendar | Combined events visualization | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Live Classes | Live class join flow | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Quests | Quest progress and claim | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Study Rooms | Room create/join/chat | MANUAL REQUIRED | Realtime + RLS dependent | app/dashboard/student/page.tsx |
| Sidebar | Student | AI Tutor | Prompt and file-assisted replies | MANUAL REQUIRED | AI API and model path wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Code Lab | Playground interactions | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Messages | DM + group chat + attachments/voice | MANUAL REQUIRED | Realtime/RLS dependent | app/dashboard/student/page.tsx |
| Sidebar | Student | Report Card | Student report card view | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | My Analytics | Analytics chart and export | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Certificates | Certificate generation/verify | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | Notifications | Notification center + mark read | MANUAL REQUIRED | Module wired | app/dashboard/student/page.tsx |
| Sidebar | Student | My Profile | Profile edit and logout | MANUAL REQUIRED | Shared profile tab | app/dashboard/student/page.tsx |

### Teacher Sidebar

| Area | Role | Feature | Test Case | Status | Notes | Evidence |
|---|---|---|---|---|---|---|
| Sidebar | Teacher | Overview | Summary cards and quick health | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Tests & Quizzes | Create/edit/schedule and attempt analytics | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Timetable | Slot CRUD and class metadata | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Courses | Course CRUD + materials | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Assignments | Assignment CRUD + grading | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Attendance | Mark and manage attendance | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Grades | Grade rollup and class insights | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Analytics | Per-test insights and pass rates | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Quests | Teacher quest management/read | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Calendar | Calendar aggregation | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Live Classes | Live class scheduling and status | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Announcements | Targeted publish flow | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Forums | Forum moderation/participation | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Plagiarism Check | Flag review and status update | MANUAL REQUIRED | RLS dependent | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Meetings | Parent meeting slots | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Risk Alerts | At-risk analytics flow | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Messages | DM/group flows | MANUAL REQUIRED | Realtime/RLS dependent | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Report Cards | Commenting/report generation | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Batch Grades | Bulk grading workflow | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | Notifications | Notification center | MANUAL REQUIRED | Wired | app/dashboard/teacher/page.tsx |
| Sidebar | Teacher | My Profile | Profile and logout | MANUAL REQUIRED | Shared profile tab | app/dashboard/teacher/page.tsx |

### Admin Sidebar

| Area | Role | Feature | Test Case | Status | Notes | Evidence |
|---|---|---|---|---|---|---|
| Sidebar | Admin | Overview | KPI cards + activity snapshot | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Users | Search/edit/delete user flows | MANUAL REQUIRED | API + modal flows | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Announcements | Publish/delete announcement | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Tests | Global tests view | MANUAL REQUIRED | Module wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Courses | Global courses oversight | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Assignments | Global assignment oversight | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Attendance | Global attendance metrics | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Forums | Forum moderation snapshot | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Analytics | Aggregate analytics | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Activity Log | Activity pagination/export | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Settings | Double XP and platform settings | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Notifications | Notification center | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Batch Create | Batch user create endpoint | MANUAL REQUIRED | API dependency | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Calendar | Calendar view | MANUAL REQUIRED | Wired | app/dashboard/admin/page.tsx |
| Sidebar | Admin | Profile | Profile and logout | MANUAL REQUIRED | Shared profile tab | app/dashboard/admin/page.tsx |

### Parent Sidebar

| Area | Role | Feature | Test Case | Status | Notes | Evidence |
|---|---|---|---|---|---|---|
| Sidebar | Parent | Overview | Linked child summary and announcements | MANUAL REQUIRED | Wired | app/dashboard/parent/page.tsx |
| Sidebar | Parent | Grades & Tests | Child grades and attempts | MANUAL REQUIRED | Wired | app/dashboard/parent/page.tsx |
| Sidebar | Parent | Attendance | Attendance history and rate | MANUAL REQUIRED | Wired | app/dashboard/parent/page.tsx |
| Sidebar | Parent | Timetable | Child timetable view | MANUAL REQUIRED | Subject-filtered | app/dashboard/parent/page.tsx |
| Sidebar | Parent | Report Card | Parent report card module | MANUAL REQUIRED | Wired | app/dashboard/parent/page.tsx |
| Sidebar | Parent | Absence Excuses | Submit and track excuses | MANUAL REQUIRED | Wired | app/dashboard/parent/page.tsx |
| Sidebar | Parent | Book Meeting | Teacher slot booking | MANUAL REQUIRED | Wired | app/dashboard/parent/page.tsx |
| Sidebar | Parent | Teacher Messages | Parent-teacher messaging | MANUAL REQUIRED | Plus full messaging module | app/dashboard/parent/page.tsx |
| Sidebar | Parent | Academic Alerts | Derived alerts visibility | MANUAL REQUIRED | Client-side derivation | app/dashboard/parent/page.tsx |
| Sidebar | Parent | Notifications | Notification center | MANUAL REQUIRED | Wired | app/dashboard/parent/page.tsx |
| Sidebar | Parent | My Profile | Profile and logout | MANUAL REQUIRED | Shared profile tab | app/dashboard/parent/page.tsx |

## 3) Core Buttons and Actions

| Area | Role | Feature | Test Case | Status | Notes | Evidence |
|---|---|---|---|---|---|---|
| Actions | All | Logout button | Session clears and redirects to login | MANUAL REQUIRED | Shared layout action | components/layout/DashboardLayout.tsx |
| Actions | All | Theme toggle | Switches and persists theme | MANUAL REQUIRED | Shared topbar action | components/layout/DashboardLayout.tsx |
| Actions | Student/Teacher | Messaging send | Text + attachment + voice send flows | MANUAL REQUIRED | Realtime and storage dependent | components/modules/MessagingModule.tsx |
| Actions | Student/Teacher | Messaging edit/delete | Edit own message/delete own message | MANUAL REQUIRED | RLS currently flagged FAIL in defect log | components/modules/MessagingModule.tsx |
| Actions | All | Notifications read state | Mark read and unread counts update | MANUAL REQUIRED | Realtime dependent | components/modules/NotificationsModule.tsx |
| Actions | Student | Submit test | API scoring + xp + attempt record | PASS | Command + route evidence; runtime still needed | app/api/submit-test/route.ts |
| Actions | Admin | Batch create user | Create auth user + profile + reset link | MANUAL REQUIRED | Service role required | app/api/batch-create-user/route.ts |
| Actions | Admin | Delete user | Delete auth user by admin endpoint | MANUAL REQUIRED | Service role required | app/api/delete-user/route.ts |
| Actions | Parent | Link child | Link by QGX ID | FAIL | Security model risk flagged | app/dashboard/parent/page.tsx |
| Actions | Teacher/Student | Study room create | Create/join/chat/archive flows | MANUAL REQUIRED | Realtime + RLS dependent | components/modules/CollaborationModule.tsx |

## 4) Ideology Review (Sidebar Item Purpose Coherence)

| Area | Role | Feature | Test Case | Status | Notes | Evidence |
|---|---|---|---|---|---|---|
| Ideology | Student | Learning + Tools split | Feature grouping clarity | PASS | Sections map to education workflow | app/dashboard/student/page.tsx |
| Ideology | Teacher | Teaching + Tools split | Feature grouping clarity | PASS | Operationally coherent | app/dashboard/teacher/page.tsx |
| Ideology | Admin | Governance-oriented menu | Feature grouping clarity | PASS | Admin function-first structure | app/dashboard/admin/page.tsx |
| Ideology | Parent | Monitor + Communication split | Feature grouping clarity | PASS | Parent-centered mental model | app/dashboard/parent/page.tsx |
| Ideology | All | Cross-role message semantics | Consistent icon/label expectations | MANUAL REQUIRED | Needs UX walkthrough for confusion points | app/dashboard/* |
| Ideology | All | Policy-model alignment | Sidebar promises vs RLS realities | FAIL | Several policy mismatches from defect log | db-single-run.sql |

## 5) Automated Gate Results

| Area | Role | Feature | Test Case | Status | Notes | Evidence |
|---|---|---|---|---|---|---|
| CI Gate | All | Lint | npm run lint | PASS (with warnings) | 14 warnings, no blocking errors | package.json |
| CI Gate | All | Build | npm run build | PASS | Production build succeeds | package.json |
| CI Gate | All | Tests | npm test -- --runInBand | PASS | 64/64 tests pass | __tests__/ |
