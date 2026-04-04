# MASTER BUILD PLAN

## ALL COMPLETE

[x] #020 — Forum upgrade: post editing, nested replies, bookmarks wiring, best answer save ✅
[x] #021 — Course sections: wire section/order_index fields to UI with drag-reorder ✅

## COMPLETE — PHASE 3 (FIXES.txt #30-52)
[x] #030 — Email format and password strength validation on register page ✅
[x] #031 — Date validation — assignment due_date cannot be in the past (create + edit) ✅
[x] #032 — Time format validation for timetable slots (HH:MM) ✅
[x] #033 — Announcement target validation (must be 'all', 'teachers', or 'students') ✅
[x] #034 — Env var validation in lib/supabase.ts — throw if missing ✅
[x] #035 — XP/score field validation — server-side clamping in atomic_xp_update RPC ✅
[x] #036 — storage_path column on course_files ✅
[x] #037 — size column on course_files ✅
[x] #038 — Answer type runtime validation in TeacherTestModule ✅
[x] #039 — Test ID generation uses crypto.randomUUID() ✅
[x] #040 — Batch notifications via pushNotificationBatch ✅
[x] #041 — Pagination on admin user list ✅
[x] #042 — Pagination on activity log ✅
[x] #043 — Debounce on admin search input ✅
[x] #044 — Course data caching with useRef ✅
[x] #045 — Lazy-load questions on test open only ✅
[x] #046 — Loading states for AI inject and course open (spinner) ✅
[x] #047 — Toast notifications after operations ✅
[x] #048 — Timer format shows "X min YY sec" ✅
[x] #049 — Offline detection + localStorage auto-save in tests ✅
[x] #050 — Dead DEMO code removed from login page ✅
[x] #051 — Migrated to @supabase/ssr ✅
[x] #052 — ESLint configuration added ✅

## COMPLETE — PHASE 2
[x] #016 — Enrollment DELETE RLS verified existing (audit false positive) ✅
[x] #017 — Match scoring verified working (audit false positive) ✅
[x] #018 — ON DELETE CASCADE on teacher FK (course_files, assignments) ✅
[x] #019 — FK constraint on forum_posts.best_answer_id ✅
[x] #022 — Logout error handling fixed ✅
[x] #023 — Messaging / DMs: MessagingModule with realtime, threads, unread counts ✅
[x] #024 — Report Cards: ReportCardModule with term filter, print support ✅
[x] #025 — Parent Portal: full dashboard with student linking, grades/attendance/timetable views ✅
[x] #026 — Student Analytics Dashboard: trend chart, distribution, CSV export, moving average ✅
[x] #027 — Certificate Generation: canvas-based, DB storage, re-download ✅
[x] #028 — Batch Operations: AdminBatchModule (CSV import) + TeacherBatchGradeModule ✅
[x] #029 — Calendar Integration: month/week views, event dots, day detail panel ✅
[x] #030 — Mobile PWA: manifest.json, service worker, layout meta tags, next.config headers ✅
[x] — API route /api/batch-create-user (admin-only user creation) ✅
[x] — All new modules wired to student/teacher/admin dashboards ✅
[x] — CSS for messaging, calendar, analytics chart modules ✅
[x] — ProfileTab parent role fix ✅
[x] — Build passes clean (17 pages, 0 errors) ✅

## COMPLETE — PHASE 1
[x] #001 — Remove dead code: unused visHandlerRef, unused Icon/Modal imports in student dashboard ✅
[x] #002 — Remove stale comments in teacher dashboard ✅
[x] #003 — Add offline banner UI to student dashboard using existing isOffline state ✅
[x] #004 — Add error handling to teacher dashboard fetchAll (try-catch) ✅
[x] #005 — Memoize teacher analytics tab calculations with useMemo ✅
[x] #006 — Add Notifications Center page (dedicated tab in all 3 dashboards with read/unread, filters, mark-all-read) ✅
[x] #007 — Add admin course management (view all courses, delete) ✅
[x] #008 — Add admin assignment oversight (view all assignments and submissions) ✅
[x] #009 — Add admin attendance overview (platform-wide attendance stats, by-subject breakdown) ✅
[x] #010 — Add admin grades overview (platform-wide grade distribution, student rankings) ✅
[x] #011 — Build Settings tab for admin (platform name, announcement defaults, feature flags, double XP duration) ✅
[x] #012 — Add theme persistence (localStorage + system preference detection) ✅
[x] #013 — Add mobile responsive sidebar (hamburger menu toggle for <768px with overlay) ✅
[x] #014 — Add CSV export utility and wire to grades, attendance, and analytics ✅
[x] #015 — Fix announcement target filtering (notifications now respect all/teachers/students target) ✅
