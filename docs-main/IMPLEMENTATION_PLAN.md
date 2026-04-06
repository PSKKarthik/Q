# IMPLEMENTATION_PLAN.md — QGX LMS Build Sequence

> **Scope:** Complete build sequence from empty folder to production-ready QGX LMS.
> Every step is atomic, references exact files, and is independently executable.
> Steps within a phase are executed in order. Cross-phase dependencies are noted.

---

## TABLE OF CONTENTS

- [Phase 1: Setup](#phase-1-setup)
- [Phase 2: Core Backend](#phase-2-core-backend)
- [Phase 3: Core Frontend](#phase-3-core-frontend)
- [Phase 4: Integration](#phase-4-integration)
- [Phase 5: Testing](#phase-5-testing)

---

## PHASE 1: SETUP

> Establishes the project scaffold, toolchain, environment, and the database before any feature code is written.

---

### 1.1 — Create Next.js project

**Action:** Scaffold the project using the official Next.js CLI with App Router and TypeScript.

```bash
npx create-next-app@14.2.5 qgx-nextjs \
  --typescript \
  --eslint \
  --tailwind=false \
  --app \
  --src-dir=false \
  --import-alias="@/*"
cd qgx-nextjs
```

**Files created:** `package.json`, `tsconfig.json`, `next.config.js`, `app/layout.tsx`, `app/page.tsx`, `.eslintrc.json`

---

### 1.2 — Install production dependencies

**Action:** Install all runtime packages needed by the application.

```bash
npm install \
  @supabase/supabase-js@^2.45.0 \
  @supabase/ssr@^0.10.0 \
  pdf-parse@^1.1.1 \
  jszip@^3.10.1
```

**Files updated:** `package.json`, `package-lock.json`

---

### 1.3 — Install development dependencies

**Action:** Install testing, linting, and type-definition packages.

```bash
npm install -D \
  jest@^30.3.0 \
  jest-environment-jsdom@^30.3.0 \
  ts-jest@^29.4.9 \
  @testing-library/react@^16.3.2 \
  @testing-library/jest-dom@^6.9.1 \
  @types/jest@^30.0.0 \
  @types/pdf-parse@^1.1.5 \
  @playwright/test@^1.59.1 \
  dotenv@^17.4.0
```

**Files updated:** `package.json`, `package-lock.json`

---

### 1.4 — Configure TypeScript

**Action:** Replace the default `tsconfig.json` with strict settings and path alias.

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

### 1.5 — Configure Next.js

**Action:** Replace default `next.config.js` with settings for Node runtime packages, image domains, security headers, and service worker.

**File:** `next.config.js`

Key settings:
- `serverComponentsExternalPackages: ['pdf-parse', 'jszip']` — Node-only packages excluded from edge bundling
- `images.domains` — Supabase storage domain
- `headers()` — `/sw.js` no-cache, global `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`
- `poweredByHeader: false`

---

### 1.6 — Configure ESLint

**Action:** Update `.eslintrc.json` to use `next/core-web-vitals` ruleset.

**File:** `.eslintrc.json`

```json
{
  "extends": "next/core-web-vitals"
}
```

---

### 1.7 — Create environment variable files

**Action:** Create `.env.local` for development secrets and `.env.test` for Playwright test credentials.

**File:** `.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GROQ_API_KEY=your-groq-api-key
```

**File:** `.env.test`
```
TEST_ADMIN_EMAIL=admin@qgx.demo
TEST_ADMIN_PASSWORD=QGX@admin2024
TEST_TEACHER_EMAIL=teacher1@qgx.demo
TEST_TEACHER_PASSWORD=QGX@teacher2024
TEST_STUDENT_EMAIL=student1@qgx.demo
TEST_STUDENT_PASSWORD=QGX@student2024
TEST_PARENT_EMAIL=parent1@qgx.demo
TEST_PARENT_PASSWORD=QGX@parent2024
```

**File:** `.gitignore` — add `.env.local`, `.env.test`, `playwright/.auth/`

---

### 1.8 — Configure Jest

**Action:** Create Jest configuration that resolves `@/` alias and ignores e2e tests.

**File:** `jest.config.js`

```js
const nextJest = require('next/jest')
const createJestConfig = nextJest({ dir: './' })
const customJestConfig = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/e2e/'],
}
module.exports = createJestConfig(customJestConfig)
```

**File:** `jest.setup.ts`

```ts
import '@testing-library/jest-dom'
```

---

### 1.9 — Configure Playwright

**Action:** Create `playwright.config.ts` with 5 test projects: chromium (public), setup, and 4 authenticated role projects.

**File:** `playwright.config.ts`

Key settings:
- `testDir: './e2e'`
- `baseURL: 'http://localhost:3000'`
- `reporter: 'html'`
- `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`
- Project `setup` runs `auth.setup.ts`, saves storage states to `playwright/.auth/{role}.json`
- Projects `student-auth`, `teacher-auth`, `admin-auth`, `parent-auth` depend on `setup`
- Uses `dotenv.config({ path: '.env.test' })` to load test credentials

---

### 1.10 — Add npm scripts

**Action:** Add all required commands to `package.json` `scripts` block.

**File:** `package.json` — `scripts` section:

```json
{
  "dev":      "next dev",
  "build":    "next build",
  "start":    "next start",
  "lint":     "next lint",
  "seed":     "node scripts/seed.mjs",
  "test":     "jest --verbose",
  "test:e2e": "npx playwright test",
  "test:e2e:ui": "npx playwright test --ui"
}
```

---

### 1.11 — Create Supabase project

**Action:** In Supabase Dashboard, create a new project. Copy the Project URL and anon key into `.env.local`. Copy the service role key into `.env.local`.

**No files created.** External action — Supabase dashboard only.

---

### 1.12 — Run database schema

**Action:** Open Supabase SQL Editor and execute `supabase-schema.sql` in full.

**File:** `supabase-schema.sql` (create this file — see BACKEND_STRUCTURE.md §2 for full schema)

This creates all 28+ tables, RLS policies, triggers, RPCs, indexes, and storage bucket in a single idempotent SQL run.

**Verification:** In Supabase Table Editor, confirm tables `profiles`, `tests`, `courses`, `assignments`, `attempts`, `quests`, `messages`, `certificates`, etc. are present.

---

### 1.13 — Enable Supabase Realtime

**Action:** In Supabase Dashboard → Database → Replication, enable Realtime for tables:

```
announcements
notifications
attempts
tests
activity_log
room_messages
```

**No files created.** Supabase dashboard action.

---

### 1.14 — Seed demo accounts

**Action:** Create and run the seed script to populate 10 demo accounts (1 admin, 2 teachers, 5 students, 2 parents).

**File:** `scripts/seed.mjs`

Script must:
- Create each user via `supabase.auth.admin.createUser()` using service role key
- Insert matching profile row with QGX ID, role, XP=0
- Insert `parent_students` rows linking parent1 → student1, student2 and parent2 → student3, student4
- Use `on conflict do nothing` to be idempotent

```bash
npm run seed
```

**Verification:** In Supabase Auth, confirm 10 users exist. In `profiles` table, confirm all rows have `qgx_id`.

---

### 1.15 — Create TypeScript types file

**Action:** Create the central type definitions file used by all modules.

**File:** `types/index.ts`

Define interfaces for: `Profile`, `Role`, `Test`, `AntiCheat`, `Question`, `Attempt`, `Course`, `CourseFile`, `CourseProgress`, `CourseRating`, `Assignment`, `Submission`, `TimetableSlot`, `AttendanceRecord`, `AttendanceStatus`, `Notification`, `ActivityLog`, `ForumPost`, `ForumComment`, `ForumFlair`, `Message`, `MessageGroup`, `Certificate`, `ParentStudent`, `ReportComment`, `GradeWeights`, `AbsenceExcuse`, `AiChat`, `LiveClass`, `Quest`, `QuestProgress`, `MeetingSlot`.

---

### 1.16 — Create shared constants file

**Action:** Create the constants file referenced by both client and server code.

**File:** `lib/constants.ts`

```ts
export const DEFAULT_ANTICHEAT: AntiCheat = { tabSwitch:false, copyPaste:false, randomQ:false, randomOpts:false, fullscreen:false, timePerQ:0, maxAttempts:1 }
export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
export const PAGE_SIZE = 20
export const MAX_XP_PER_TEST = 500
export const DOUBLE_XP_DURATION_MS = 3_600_000
export const DEBOUNCE_MS = 300
export const NOTIFICATION_LIMIT = 10
export const MAX_FILE_SIZE = 50 * 1024 * 1024
```

---

### 1.17 — Create pdf-parse type declaration

**Action:** Create the ambient type declaration for `pdf-parse` which lacks official `@types`.

**File:** `pdf-parse.d.ts`

```ts
declare module 'pdf-parse/lib/pdf-parse.js' {
  function pdfParse(buffer: Buffer): Promise<{ text: string }>
  export default pdfParse
}
```

---

### 1.18 — Create Vercel deployment config

**Action:** Create `vercel.json` declaring the framework.

**File:** `vercel.json`

```json
{ "framework": "nextjs" }
```

---

### 1.19 — Verify Phase 1

**Action:** Run the following to confirm setup is clean before writing feature code.

```bash
npm run build    # Must exit 0 with no TS errors
npm run lint     # Must exit 0 with 0 errors
npm test         # No tests yet — must exit 0
```

---

## PHASE 2: CORE BACKEND

> Implements all server-side code: the Supabase client singleton, middleware, auth callback, and all five API route handlers.

---

### 2.1 — Create Supabase browser client singleton

**Action:** Create the client-side Supabase singleton used by all dashboard components.

**File:** `lib/supabase.ts`

```ts
import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createBrowserClient(url, key, {
  auth: { flowType: 'implicit' },
})
```

---

### 2.2 — Create shared utility functions

**Action:** Create `lib/utils.ts` with functions used across multiple modules.

**File:** `lib/utils.ts`

Functions to implement:
- `cn(...classes: string[])` — conditional className joining
- `formatDate(iso: string): string` — locale-aware date formatting
- `formatBytes(bytes: number): string` — human-readable file size
- `truncate(str: string, maxLen: number): string` — safe string truncation
- `debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T` — debounce with cleanup ref
- `isSafeRedirect(path: string): boolean` — validates redirect target starts with `/dashboard/` and is not `//`

---

### 2.3 — Create activity log and notification helpers

**Action:** Create `lib/actions.ts` with server-callable helper functions.

**File:** `lib/actions.ts`

Functions to implement:
- `sanitizeActivityMessage(message: string): string` — trim, collapse whitespace, slice to 500
- `sanitizeActivityType(type: string): string` — lowercase, replace non-alphanumeric with `_`, slice to 48, fallback to `'info'`
- `logActivity(message: string, type: string): Promise<{ error: string | null }>` — inserts to `activity_log`, sets `actor_id` from current session
- `pushNotificationBatch(userIds: string[], message: string, type: string): Promise<{ error: string | null; failedCount: number }>` — bulk inserts notifications

---

### 2.4 — Create theme provider

**Action:** Create the theme context and hook for dark/light mode switching.

**File:** `lib/theme.tsx`

Implements:
- `ThemeProvider` component: reads `profile.theme` preference, applies `.light-theme` class to `<html>`, saves on toggle
- `useTheme()` hook: returns `{ theme, toggleTheme }`

---

### 2.5 — Create toast notification system

**Action:** Create a lightweight toast utility for client-side feedback.

**File:** `lib/toast.tsx`

Implements:
- `ToastProvider` — renders toast container
- `useToast()` hook — returns `{ success, error, info }` trigger functions
- Auto-dismiss after 3000ms
- Stacks up to 5 simultaneous toasts

---

### 2.6 — Create avatar utility

**Action:** Create utility for generating initials-based avatars.

**File:** `lib/avatar.ts`

Functions to implement:
- `getInitials(name: string): string` — takes first letter of first two words, uppercase
- `getAvatarColor(role: Role): string` — returns CSS color variable per role

---

### 2.7 — Create Next.js middleware

**Action:** Implement the route guard that protects all `/dashboard/*` paths.

**File:** `middleware.ts`

Logic (in order):
1. Create `createServerClient` from `@supabase/ssr` using request cookies
2. Call `supabase.auth.getUser()`
3. If no user → redirect to `/login?redirect={pathname}`
4. Extract `dashRole` from `pathname.split('/')[2]`
5. Fetch `profile.role` from `profiles` table
6. If profile missing or role not in `VALID_ROLES = ['admin','teacher','student','parent']` → redirect to `/login`
7. If `profile.role !== dashRole` → redirect to `/dashboard/${profile.role}`
8. Wrap steps 4–7 in try/catch: on error → redirect to `/login`
9. Return `NextResponse.next()` with refreshed cookies

**Export:**
```ts
export const config = { matcher: ['/dashboard/:path*'] }
```

---

### 2.8 — Create auth callback route

**Action:** Implement the server-side Supabase code-exchange route for email links.

**File:** `app/auth/callback/route.ts`

Logic:
1. Extract `code` and `next` from URL search params
2. Define `SAFE_PATHS` whitelist: `['/reset-password', '/dashboard/student', '/dashboard/teacher', '/dashboard/parent', '/dashboard/admin', '/login']`
3. Validate `next` against whitelist; default to `'/reset-password'` if not whitelisted
4. If `code` present: call `supabase.auth.exchangeCodeForSession(code)`
5. On success: redirect to `next`
6. On failure or no code: redirect to `/forgot-password?error=expired`

---

### 2.9 — Create POST /api/submit-test route

**Action:** Implement server-side test grading, XP calculation, and attempt recording.

**File:** `app/api/submit-test/route.ts`

Set `export const runtime = 'nodejs'` is NOT needed (default Node.js).

Logic (in order):
1. Validate session (`getUser()`) → 401 if missing
2. Fetch profile, verify `role === 'student'` → 403 if not
3. Parse body: `{ test_id, answer_map, is_double_xp }`
4. Validate `test_id` and `answer_map` present → 400
5. Fetch test + questions server-side
6. Verify enrollment: check `enrollments` + `courses` to confirm test is accessible
7. Check `test.status !== 'locked'` → 403
8. Check deadline: `scheduled_date + scheduled_time + duration + 5min grace` → 403
9. Check `attemptCount < anti_cheat.maxAttempts` → 403
10. Score all questions (MCQ/MSQ/TF/FIB/Match) — see BACKEND_STRUCTURE.md §4.2
11. Compute XP — see BACKEND_STRUCTURE.md §4.3
12. Insert attempt row; fallback to upsert if insert fails
13. Call `atomic_xp_update` RPC; fallback to direct update if RPC unavailable
14. Fire-and-forget `activity_log` insert
15. Return `{ score, total, percent, xpEarned, isDoubleXP, ghostMsg, ghostBonus, newXP, date }`

---

### 2.10 — Create POST /api/batch-create-user route

**Action:** Implement admin-only user creation using the service role key.

**File:** `app/api/batch-create-user/route.ts`

Logic (in order):
1. Validate `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars → 500
2. Validate session → 401
3. Fetch profile, verify `role === 'admin'` → 403
4. Parse body: `{ name, email, role }`
5. Validate all three fields are non-empty strings → 400
6. Validate `role` in `['admin','teacher','student','parent']` → 400
7. Validate email with regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` → 400
8. Check `SUPABASE_SERVICE_ROLE_KEY` env var (accept aliases) → 500
9. Create `adminClient` using service role key
10. Generate secure temp password: `crypto.randomUUID().slice(0,8) + 'Aa1!'`
11. Call `adminClient.auth.admin.createUser({ email, password, email_confirm:true, user_metadata:{name,role} })`
12. Generate QGX ID via `generate_qgx_id` RPC; fallback to manual formula
13. Upsert profile row via `adminClient`
14. Insert to `activity_log`
15. Generate password reset link via `adminClient.auth.admin.generateLink({ type:'recovery', email })`
16. Return `{ user: { id, email }, qgxId, resetLink }`

---

### 2.11 — Create POST /api/delete-user route

**Action:** Implement admin-only user deletion with last-admin guard.

**File:** `app/api/delete-user/route.ts`

Logic (in order):
1. Validate env vars → 500
2. Validate session → 401
3. Fetch profile, verify `role === 'admin'` → 403
4. Parse body: `{ userId }`
5. Validate `userId` is non-empty string → 400
6. Prevent self-deletion (`userId === user.id`) → 400
7. Fetch target profile role
8. If target role is `'admin'`: count admin profiles; block if count ≤ 1 → 403
9. Create `adminClient` with service role key
10. Call `adminClient.auth.admin.deleteUser(userId)` (cascades to `profiles` via FK)
11. Return `{ success: true }`

---

### 2.12 — Create GET/POST/PATCH/DELETE /api/quests route

**Action:** Implement the full quest management API (admin only).

**File:** `app/api/quests/route.ts`

**GET:** Auth → admin check → `SELECT * FROM quests ORDER BY created_at DESC` → return `{ quests }`

**POST:** Auth → admin check → validate fields (title 1–180, type enum, target_type enum, target_count 1–1000, xp_reward 1–5000) → insert → return `{ quest }` 201

**PATCH:** Auth → admin check → validate `id` present → build partial update object → update → return `{ quest }`

**DELETE:** Auth → admin check → extract `?id=` from URL → delete → return `{ success: true }`

---

### 2.13 — Create POST /api/ai route

**Action:** Implement AI question generation (teacher) and AI tutor chat (student).

**File:** `app/api/ai/route.ts`

Set `export const runtime = 'nodejs'` (required for pdf-parse / jszip).

**In-memory rate limiter (module scope):**
```ts
const rateMap = new Map<string, number[]>()
function isRateLimited(userId: string): boolean { /* sliding window 10/60s */ }
```

**Question validator:**
```ts
function validateQuestion(q: any, type: string): boolean { /* type-specific structure check */ }
```

**Mode: `generate` (teacher only):**
1. Auth → role=teacher → 403 otherwise
2. Rate limit check → 429
3. Parse body: `{ topic, subject, count, type, difficulty, file? }`
4. If `file`: validate base64 size ≤ 7MB; parse PDF/PPT via `pdf-parse`/`jszip`; image → vision mode
5. Build Groq prompt for question generation
6. Call Groq API (`GROQ_API_KEY`)
7. Parse JSON from response; validate each question via `validateQuestion()`
8. Return `{ questions }`

**Mode: `tutor` (student only):**
1. Auth → role=student → 403 otherwise
2. Rate limit check → 429
3. Parse body: `{ message, courseContext, history, file? }`
4. Validate `message.length ≤ 2000` (or file provided)
5. If `file`: process same as above
6. Build Groq chat completion with `courseContext` as system prompt
7. Return `{ reply }`

---

### 2.14 — Verify Phase 2

**Action:** Run build to confirm all API routes and middleware compile and no TS errors exist.

```bash
npm run build     # Must exit 0
npm run lint      # 0 errors (warnings acceptable)
```

Manually test with curl or browser:
- `GET /api/quests` without auth → should return 401

---

## PHASE 3: CORE FRONTEND

> Implements all pages, layouts, UI primitives, and the 25 feature modules. All components use the `'use client'` directive and the singleton Supabase client from `lib/supabase.ts`.

---

### 3.1 — Create global CSS

**Action:** Replace the default `globals.css` with the complete QGX design system.

**File:** `app/globals.css`

Must define:
- Google Fonts import: Bebas Neue, DM Mono, DM Sans
- CSS variables: `--bg`, `--fg`, `--fg-dim`, `--fg-muted`, `--border`, `--border-hover`, `--card`, `--card-hover`, `--danger`, `--success`, `--warn`, `--mono`, `--sans`, `--display`
- `.light-theme` overrides for all variables
- Base reset (`*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }`)
- Scrollbar styles
- Keyframe animations: `fadeUp`, `scan`, `pulse`, `spin`
- Animation utility classes: `.fade-up`, `.fade-up-1` through `.fade-up-4`

---

### 3.2 — Create root layout

**Action:** Implement the root Next.js app layout with theme and toast providers.

**File:** `app/layout.tsx`

Must:
- Import `globals.css`
- Wrap children in `ThemeProvider` (from `lib/theme.tsx`)
- Wrap children in `ToastProvider` (from `lib/toast.tsx`)
- Set `<html lang="en">` and `<body>` with font class
- NOT import or reference Supabase directly (avoids SSR errors)
- Export `metadata`: `{ title: 'QGX', description: '...' }`

---

### 3.3 — Create PWA assets

**Action:** Create the Web App Manifest (PWA) and service worker.

**File:** `public/manifest.json`

```json
{
  "name": "QGX Learning Platform",
  "short_name": "QGX",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**File:** `public/sw.js`

Implements:
- Cache name: `qgx-v4`
- `install` event: pre-cache shell assets (`/`, `/offline.html`)
- `fetch` event: network-first for API/auth routes, cache-first for static assets
- Fall through to `/offline.html` for navigation requests when offline

**File:** `public/offline.html` — Offline fallback page with QGX branding

**File:** `public/icons/icon-192.png`, `public/icons/icon-512.png` — App icons (must be created/exported from design tool)

---

### 3.4 — Create landing page

**Action:** Implement the public marketing home page.

**File:** `app/page.tsx`

Must include:
- Animated hero with QGX logo
- Feature highlights grid
- Animated stat counters (students, teachers, tests)
- Demo credentials section (for development/demo)
- CTA buttons: "Sign In" → `/login`, "Get Started" → `/register`
- PWA install prompt (deferred `BeforeInstallPromptEvent`)
- Register service worker on mount

---

### 3.5 — Create error and not-found pages

**Action:** Create the global error boundary and 404 page.

**File:** `app/error.tsx` — `'use client'` component, receives `{ error, reset }` props, renders error message with retry button

**File:** `app/not-found.tsx` — Static 404 page with QGX branding and link back to `/`

---

### 3.6 — Create Login page

**Action:** Implement `/login` with email + QGX ID support.

**File:** `app/login/page.tsx`

Logic:
1. On mount: check `?reset=success` → show green banner
2. Evaluate `?redirect=` param: store if `isSafeRedirect()` returns true
3. Input type detection: `identifier.toUpperCase().startsWith('QGX-')` → QGX ID flow
4. QGX ID flow: `SELECT email FROM profiles WHERE qgx_id = identifier`
5. `supabase.auth.signInWithPassword({ email, password })`
6. On success: fetch `profile.role`; redirect to safe redirect or `/dashboard/${role}`

Fields: identifier (email or QGX ID), password, submit button, "Forgot password?" link

---

### 3.7 — Create Register page

**Action:** Implement `/register` with admin redirect guard.

**File:** `app/register/page.tsx`

Logic:
1. On mount: `supabase.auth.getUser()` → if admin → `router.replace('/dashboard/admin?tab=users&createUser=1')`
2. Role selector: `student | teacher | parent` (no `admin` option)
3. Client-side validation: email regex, password ≥8 chars + ≥1 letter + ≥1 number, name non-empty
4. `supabase.auth.signUp({ email, password, options: { data: { name, role } } })`
5. Generate QGX ID via `generate_qgx_id` RPC; fallback to formula
6. `supabase.from('profiles').insert({ id, name, email, role, avatar, qgx_id, ... })`
7. On email-confirm-disabled: redirect to `/dashboard/${role}`
8. On email-confirm-enabled: show "Check your email" message

---

### 3.8 — Create Forgot Password page

**Action:** Implement `/forgot-password`.

**File:** `app/forgot-password/page.tsx`

Logic:
1. Check `?error=expired` param → show "Link expired" message
2. Email input form
3. `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/auth/callback?next=/reset-password' })`
4. On submit: show "Check your email" confirmation; clear input

---

### 3.9 — Create Reset Password page

**Action:** Implement `/reset-password`.

**File:** `app/reset-password/page.tsx`

Logic:
1. `supabase.auth.onAuthStateChange` listener — wait for `PASSWORD_RECOVERY` event
2. Until event fires: show "Waiting for verification..." (form hidden)
3. After event: show password form
4. Validate: new password ≥8 chars + ≥1 letter + ≥1 number; confirm matches
5. `supabase.auth.updateUser({ password })`
6. On success: `router.replace('/login?reset=success')`

---

### 3.10 — Create UI primitive: Icon

**Action:** Create the icon component wrapping SVG paths.

**File:** `components/ui/Icon.tsx`

Implements a lookup of named SVG icon paths (home, users, tests, calendar, etc.) rendered in a `<svg>` wrapper.

---

### 3.11 — Create UI primitive: Modal

**Action:** Create the accessible modal dialog component.

**File:** `components/ui/Modal.tsx`

Must:
- Render into a React portal (`document.getElementById('modal-root')`)
- Accept `{ isOpen, onClose, title, children, size? }` props
- Trap focus within modal while open
- Close on `Escape` keypress and backdrop click
- Apply `aria-modal="true"`, `role="dialog"`, `aria-labelledby`

---

### 3.12 — Create UI primitive: Pagination

**Action:** Create the pagination control used by all list views.

**File:** `components/ui/Pagination.tsx`

Props: `{ total: number, page: number, pageSize: number, onChange: (page: number) => void }`

Renders: previous button, page numbers (windowed), next button; disabled states at bounds.

---

### 3.13 — Create UI primitive: StatGrid

**Action:** Create the stats summary grid used in dashboard home tabs.

**File:** `components/ui/StatGrid.tsx`

Props: `{ stats: { label: string, value: string | number, icon?: string }[] }`

---

### 3.14 — Create UI primitive: PageHeader

**Action:** Create the page/tab header component.

**File:** `components/ui/PageHeader.tsx`

Props: `{ title: string, subtitle?: string, actions?: React.ReactNode }`

---

### 3.15 — Create UI primitive: SectionLabel

**Action:** Create the sidebar section divider label.

**File:** `components/ui/SectionLabel.tsx`

Props: `{ label: string }` — renders uppercase dimmed text with a horizontal rule.

---

### 3.16 — Create UI primitive: DashboardSkeleton

**Action:** Create the loading skeleton shown during dashboard data fetch.

**File:** `components/ui/DashboardSkeleton.tsx`

Renders animated pulse placeholders for sidebar + content area.

---

### 3.17 — Create UI primitive: AnnouncementCard

**Action:** Create the announcement card component.

**File:** `components/ui/AnnouncementCard.tsx`

Props: `{ announcement: Announcement, onDelete?: () => void, onPin?: () => void }`

---

### 3.18 — Create UI primitive: ProfileModal

**Action:** Create the user profile view/edit modal.

**File:** `components/ui/ProfileModal.tsx`

Displays: avatar, name, email, role, QGX ID, XP, joined date. Admin view includes edit fields.

---

### 3.19 — Create UI primitive: ProfileTab

**Action:** Create the profile tab used inside all 4 dashboards.

**File:** `components/ui/ProfileTab.tsx`

Features: edit name/phone, avatar upload to Supabase Storage, change password via `supabase.auth.updateUser()`.

---

### 3.20 — Create layout: NotificationBell

**Action:** Create the notification bell with unread count badge.

**File:** `components/layout/NotificationBell.tsx`

Features:
- Fetches unread notifications (limit `NOTIFICATION_LIMIT=10`)
- Realtime subscription to `notifications` table
- Dropdown list of recent notifications
- Mark-as-read on click
- Unread count badge (red dot)

---

### 3.21 — Create layout: DashboardLayout

**Action:** Create the shared dashboard shell with sidebar navigation.

**File:** `components/layout/DashboardLayout.tsx`

Props: `{ profile: Profile, navItems: NavItem[], activeTab: string, onTabChange: (tab: string) => void, locked?: boolean, children: React.ReactNode }`

Features:
- Sidebar: QGX logo, `navItems` map with `SectionLabel` dividers for sections, avatar + role badge, logout button
- Topbar: tab title (or "exam mode" when `locked=true`), hamburger toggle, `NotificationBell`, theme toggle
- `locked=true`: nav items opacity 0.45, `pointerEvents:'none'`, hamburger disabled
- Role badge colors: admin=`--danger`, teacher=`--warn`, student=`--success`, parent=`--fg-dim`
- `supabase.auth.signOut()` on logout; on success → `router.replace('/login')`
- Mobile: `sidebarOpen` state, hamburger toggles

---

### 3.22 — Create Admin dashboard page

**Action:** Implement the admin role SPA entry point.

**File:** `app/dashboard/admin/page.tsx`

Features:
- Auth guard on mount: no user → `/login`; role ≠ admin → `/dashboard/${role}`
- `fetchAll()` using `Promise.allSettled`: profiles, tests, courses, assignments, attendance, announcements, activity_log, platform_settings
- Read `?tab=` and `?createUser=1` from `searchParams` on mount
- 14 nav tabs: home, users, announcements, tests, courses, assignments, attendance, forums, analytics, activity, settings, batch, calendar, profile
- Each tab renders the corresponding module or UI component
- Realtime subscriptions: announcements channel

---

### 3.23 — Create Teacher dashboard page

**Action:** Implement the teacher role SPA entry point.

**File:** `app/dashboard/teacher/page.tsx`

Features:
- Auth guard + role=teacher guard
- `fetchAll()` using `Promise.allSettled`: teacher's tests, courses, assignments, attendance records, enrollments, timetable, quest_progress
- 20 nav tabs across 3 sections (Teaching, Tools, Account)
- Realtime: announcements channel, messages channel

---

### 3.24 — Create Student dashboard page

**Action:** Implement the student role SPA entry point.

**File:** `app/dashboard/student/page.tsx`

Features:
- Auth guard + role=student guard
- `fetchAll()` using `Promise.allSettled`: tests, enrollments, assignments+submissions, attendance, attempts, grades, timetable, xp levels from platform_settings, double_xp setting
- `window.addEventListener('offline'/'online')` → `isOffline` state → orange banner
- Double XP banner: `doubleXP.active && Date.now() < ends_at`
- `isExamMode` state: set true on test start, false after submission — passed as `locked` to `DashboardLayout`
- 20 nav tabs across 3 sections (Learning, Tools, Account)
- Realtime: announcements, messages channels

---

### 3.25 — Create Parent dashboard page

**Action:** Implement the parent role SPA entry point.

**File:** `app/dashboard/parent/page.tsx`

Features:
- Auth guard + role=parent guard
- `loadLinkedStudents(profile)`: query `parent_students` where `parent_id = profile.id`, resolve student profiles
- `selectedStudent` state: default to first linked child
- `loadStudentData(student)`: fetch attempts, attendance, assignments+submissions, timetable, excuses
- If no linked students: show "Link a Student" CTA with QGX ID input
- Link student: `SELECT * FROM profiles WHERE qgx_id = code.toUpperCase()`
- Child selector rendered on every tab when `linkedStudents.length > 1`
- 10 nav tabs across 3 sections (Monitor, Communication, Account)

---

### 3.26 — Create TeacherTestModule

**Action:** Implement the teacher test management module.

**File:** `components/modules/TeacherTestModule.tsx`

Features:
- List teacher's own tests with status, question count, attempt count
- Create test: form (title, subject, type, duration, scheduled_date, scheduled_time, anti_cheat config, xp_reward)
- Add questions: MCQ/MSQ/TF/FIB/Match question forms; each with marks field
- "Generate with AI": file upload or prompt → POST `/api/ai` with `mode:'generate'`; import individual AI questions
- Edit test: populate existing data
- Delete test: confirmation modal; cascade deletes questions + attempts

---

### 3.27 — Create AdminTestModule

**Action:** Implement the admin platform-wide test viewer.

**File:** `components/modules/AdminTestModule.tsx`

Features: Table of all tests across all teachers; view test details; admin-only delete.

---

### 3.28 — Create TestModule (StudentTestModule)

**Action:** Implement the student test-taking module.

**File:** `components/modules/TestModule.tsx`

Features:
- List available tests; "Start" button disabled when `attempts >= maxAttempts`
- On Start: `isExamMode = true` (passed up via callback)
- Anti-cheat: `tabSwitch` detection (`visibilitychange` event), `copyPaste` block (`paste` event), `fullscreen` request (`requestFullscreen()`), per-question countdown (`timePerQ > 0`)
- Stale-closure-safe submission: use `useRef` for answers, not state directly
- Question types: MCQ radio, MSQ checkbox, TF toggle, FIB text input, Match dropdown pairs
- `requireAllAnswered`: disable submit if any question unanswered
- Submit: POST `/api/submit-test`; display results screen with score, percent, XP earned, ghost message
- On completion: `isExamMode = false` (callback)

---

### 3.29 — Create CourseModule (student + teacher views)

**Action:** Implement the course browsing/enrollment (student) and creation/management (teacher) module.

**File:** `components/modules/CourseModule.tsx`

Student features:
- Browse published courses; filter by subject
- Enroll (insert to `enrollments`)
- View enrolled course files by section; mark file complete (insert to `course_progress`)
- Certificate auto-issued when all files completed (guard: `courseFiles.length > 0`)
- Rate course (1–5 stars + optional review)
- Unenroll (delete from `enrollments`)

Teacher features:
- Create course (title, subject, description); status=draft
- Upload files (≤50MB each, validated client-side); Supabase Storage upload
- Reorder files via drag-and-drop (update `order_index`)
- Publish → status=published
- Manage enrollments list
- Delete course (confirmation)

---

### 3.30 — Create AssignmentModule (student + teacher views)

**Action:** Implement assignment creation (teacher) and submission (student).

**File:** `components/modules/AssignmentModule.tsx`

Teacher features: Create (title, description, course_id, due_date, priority, max_points, optional attachment); grade submissions (score 0–max_points + feedback); export CSV.

Student features: List active assignments; view detail; write text response + optional file upload (≤50MB); save draft; submit; view graded feedback.

Late detection: `is_late = Date.now() > new Date(due_date).getTime()`

---

### 3.31 — Create AttendanceModule (student + teacher views)

**Action:** Implement attendance marking (teacher) and attendance viewing (student).

**File:** `components/modules/AttendanceModule.tsx`

Teacher features: Select subject + date; mark each student present/absent/late/excused with optional note; upsert to `attendance`; review and action excuse requests; export CSV.

Student features: Calendar heatmap of own attendance records; attendance rate summary.

---

### 3.32 — Create GradesModule (student + teacher views)

**Action:** Implement the grade book.

**File:** `components/modules/GradesModule.tsx`

Teacher features: Per-student aggregated grades from attempts + submissions; filter by subject/date; export CSV.

Student features: All test attempts (score, %, date); all assignment grades; computed weighted GPA using `grade_weights`; letter grade display; export CSV.

---

### 3.33 — Create TimetableModule (student + teacher views)

**Action:** Implement weekly timetable.

**File:** `components/modules/TimetableModule.tsx`

Teacher features: Weekly grid (Mon–Sat); add/edit/delete time slots (subject, day, HH:MM time validation, room).

Student features: Read-only weekly grid; check-in button on today's slots (awards `checkin_xp` XP, one per slot per day).

---

### 3.34 — Create XPEngine module

**Action:** Implement the gamification XP hub.

**File:** `components/modules/XPEngine.tsx`

Features:
- Current XP, level name (from `xp_levels` platform_settings), progress bar to next tier
- Daily login XP claim button (track via `activity_log`; prevent double-claim)
- Badge grid: 28 badges; locked/unlocked states
- Activity heatmap: last 84 days color-coded
- XP spark chart: last 14 days
- Leaderboard: sort by XP / Score / Ghost Wins; top 3 podium; paginated (PAGE_SIZE=20)
- "QGX Wrapped" → generate copyable summary text

---

### 3.35 — Create ForumModule

**Action:** Implement the community discussion forum.

**File:** `components/modules/ForumModule.tsx`

Features:
- Feed sorted by hot / new / top; search by title/tag; filter by flair
- Create post: title, body (markdown), flair, tags, optional attachment (≤10MB)
- Body rendered as XSS-safe markdown
- Like (atomic via `toggle_forum_like` RPC), bookmark (via `toggle_forum_bookmark` RPC)
- View count increment (via `increment_view_count` RPC)
- Threaded comments; like comments (via `toggle_comment_like` RPC)
- Pin post (admin/teacher): `toggle_forum_pin` RPC
- Best answer marking (post author or teacher)
- Delete own post/comment; admin/teacher can delete any via `admin_delete_forum_post` / `admin_delete_forum_comment` RPCs
- Confirmation modal before delete

---

### 3.36 — Create CalendarModule

**Action:** Implement the academic calendar.

**File:** `components/modules/CalendarModule.tsx`

Features: Month/week view toggle; display academic events (tests, assignments, live classes by date); personal event creation (title, date, note); ICS export.

---

### 3.37 — Create LiveClassModule (student + teacher views)

**Action:** Implement live video class scheduling and joining.

**File:** `components/modules/LiveClassModule.tsx`

Teacher features: Schedule class (title, course_id, subject, scheduled_at, duration); generate Jitsi room_id (UUID) and room_url; "Go Live" → status=live; "End Class" → status=ended; batch notification on go-live.

Student features: List scheduled/live classes; "Join" enabled only when status=live; opens room_url in new tab.

---

### 3.38 — Create QuestModule

**Action:** Implement the quest progress and claim module.

**File:** `components/modules/QuestModule.tsx`

Features:
- Daily quests (3, seeded by today's date)
- All active quests with progress bars
- "Claim" button active when `progress >= target_count` AND `!claimed`
- Claim: PATCH `/api/quests` (claim action) → mark `claimed=true`, award `xp_reward`
- Progress auto-maintained by database triggers (no polling needed)

---

### 3.39 — Create AiTutorModule

**Action:** Implement the student AI tutor chat interface.

**File:** `components/modules/AiTutorModule.tsx`

Features:
- Course selector dropdown (enrolled courses only)
- Chat history display (user/assistant bubbles)
- Message input with file attachment (PDF/PPT/image ≤5MB; validated client-side)
- POST `/api/ai` with `mode:'tutor'`; display reply
- "New Chat": creates new `ai_chats` row, clears local history
- Persist chat history: upsert to `ai_chats` table
- 429 error → toast "Rate limit reached, wait 1 minute"

---

### 3.40 — Create CodePlaygroundModule

**Action:** Implement the in-browser code sandbox.

**File:** `components/modules/CodePlaygroundModule.tsx`

Features:
- Language selector: JavaScript / Python / HTML+CSS
- Code editor (textarea with monospace font, tab-indent support)
- JS: execute in Web Worker with 5s timeout; capture `console.log` output
- Python: execute via Pyodide (WASM); capture stdout
- HTML: render in sandboxed `<iframe srcdoc>`
- Output panel: stdout, errors (red), "(no output)" if empty
- Keyboard shortcut: Ctrl+Enter → run

---

### 3.41 — Create MessagingModule

**Action:** Implement DM and group chat.

**File:** `components/modules/MessagingModule.tsx`

Features:
- Inbox: DM threads + group chats; unread count badges
- Select thread → load messages; realtime subscription
- Send message: text + optional file attachment (≤50MB) or voice note (MediaStream)
- Edit own message (updates body + sets `edited_at`); soft-delete (`deleted=true`)
- Mark thread as read on open
- Group chat: send to `message_groups` members

---

### 3.42 — Create ReportCardModule (student + teacher + parent views)

**Action:** Implement term report cards.

**File:** `components/modules/ReportCardModule.tsx`

Teacher features: Select student + term; write comment; set conduct rating; upsert to `report_comments`.

Student/Parent features: Select term; display subject grades + GPA + teacher comment + conduct rating; print layout.

---

### 3.43 — Create StudentAnalyticsModule

**Action:** Implement the student personal analytics dashboard.

**File:** `components/modules/StudentAnalyticsModule.tsx`

Features: Test score trend (line chart); subject average (bar chart); XP over time; submission rate; filter by date range and subject.

---

### 3.44 — Create CertificateModule

**Action:** Implement certificate listing and download.

**File:** `components/modules/CertificateModule.tsx`

Features:
- List earned certificates (from `certificates` table)
- "Download" → Canvas renders 1200×850px PNG with student name, course title, issued date, QR code, `credential_id`
- Download as PNG via `<a download>` link

---

### 3.45 — Create CollaborationModule

**Action:** Implement peer study rooms.

**File:** `components/modules/CollaborationModule.tsx`

Features:
- List active study rooms (from `collaboration_rooms`)
- Create room (name, subject)
- Join room → real-time chat via `room_messages` table (Realtime subscription)
- Send message; messages displayed with author name and timestamp

---

### 3.46 — Create PlagiarismModule

**Action:** Implement submission similarity scanner.

**File:** `components/modules/PlagiarismModule.tsx`

Features:
- Teacher selects own assignment
- "Scan" → fetch up to 100 text submissions; compute pairwise Jaccard similarity client-side
- Threshold slider (10–90%, default 30%); re-filter on slider change (no re-fetch)
- Display pairs above threshold: names, % similarity, color-coded (red/amber/green)
- Highlight shared phrases
- Flag status per pair: open → reviewed → dismissed (local state, optionally persisted)

---

### 3.47 — Create MeetingSchedulerModule (teacher + parent views)

**Action:** Implement parent-teacher meeting booking.

**File:** `components/modules/MeetingSchedulerModule.tsx`

Teacher features: Add slots (date, start_time, end_time); view booked appointments.

Parent features: Browse all teachers with available slots; book slot (`status='booked'`, `booked_by=profile.id`); view own booked appointments.

---

### 3.48 — Create PredictiveAlertsModule

**Action:** Implement at-risk student detection.

**File:** `components/modules/PredictiveAlertsModule.tsx`

Risk score computed client-side per student:
- Attendance < 80% → +20
- Avg test score < 50% → +15
- Overdue assignments > 0 → +10
- No activity in 7 days → +5
- Inactivity 14 days → +10

Display: sorted by risk score desc; red (≥40), amber (20–39), green (<20); expandable per-student detail; "Refresh" button.

---

### 3.49 — Create BatchModule (AdminBatchModule)

**Action:** Implement admin bulk user creation.

**File:** `components/modules/BatchModule.tsx`

Features:
- Multi-row form: each row has name, email, role fields
- Add/remove rows
- Submit: each row → POST `/api/batch-create-user`; parallel execution
- Per-row result display: green success with QGX ID, or red error message

---

### 3.50 — Create NotificationsModule

**Action:** Implement the notification management view.

**File:** `components/modules/NotificationsModule.tsx`

Features: List all notifications for current user; mark individual or all as read; type icons; pagination.

---

### 3.51 — Verify Phase 3

**Action:** Run build and visual review.

```bash
npm run build    # 0 TS errors
npm run lint     # 0 errors
```

Manual checks:
- Navigate to `/` — landing page renders
- Navigate to `/login` — form renders, no console errors
- Navigate to `/dashboard/student` without auth → redirects to `/login`

---

## PHASE 4: INTEGRATION

> Connects frontend components to backend data, wire realtime subscriptions, configure the PWA service worker, implement the email templates, and ensure all cross-cutting concerns (auth state, offline handling, deep links) work end-to-end.

---

### 4.1 — Wire dashboard auth guards

**Action:** Verify all four dashboard page.tsx files have identical auth guard patterns.

**Files to verify:** `app/dashboard/admin/page.tsx`, `app/dashboard/teacher/page.tsx`, `app/dashboard/student/page.tsx`, `app/dashboard/parent/page.tsx`

Pattern required in each:
```ts
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') router.push('/login')
  })
  return () => subscription.unsubscribe()
}, [])
```

---

### 4.2 — Wire ?tab= deep link support

**Action:** Ensure all dashboard pages read `searchParams.get('tab')` on mount and set initial tab.

**Files:** All four `app/dashboard/*/page.tsx`

```ts
useEffect(() => {
  const tab = searchParams.get('tab')
  if (tab && validTabs.includes(tab)) setActiveTab(tab)
  if (searchParams.get('createUser') === '1') setCreateUserOpen(true)
}, [searchParams])
```

---

### 4.3 — Wire realtime subscriptions

**Action:** Implement and verify all Supabase Realtime channel subscriptions across dashboards.

| Dashboard | Channel | Table | Event |
|-----------|---------|-------|-------|
| All 4 | announcements | announcements | INSERT |
| Student, Teacher, Parent | messages | messages | INSERT |
| Admin | activity | activity_log | INSERT |
| Collaboration | room-{id} | room_messages | INSERT |

Each subscription must: call `.subscribe()` on mount, call `.channel().unsubscribe()` on cleanup (return in `useEffect`).

---

### 4.4 — Wire offline detection in student dashboard

**Action:** Ensure `isOffline` state and banner are wired in student dashboard.

**File:** `app/dashboard/student/page.tsx`

```ts
useEffect(() => {
  const onOffline = () => setIsOffline(true)
  const onOnline  = () => setIsOffline(false)
  window.addEventListener('offline', onOffline)
  window.addEventListener('online', onOnline)
  return () => {
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('online', onOnline)
  }
}, [])
```

Banner: `{isOffline && <div className="offline-banner">△ You are offline</div>}`

---

### 4.5 — Wire exam mode between TestModule and DashboardLayout

**Action:** Verify `isExamMode` state flows correctly from `TestModule` to `DashboardLayout`.

**File:** `app/dashboard/student/page.tsx`

`TestModule` receives `onExamStart` and `onExamEnd` callbacks that set `isExamMode` in parent. `DashboardLayout` receives `locked={isExamMode}`.

Verify: starting a test → sidebar becomes inert; submitting test → sidebar re-enables.

---

### 4.6 — Wire double XP banner

**Action:** Verify double XP detection reads from `platform_settings` fetched on mount.

**File:** `app/dashboard/student/page.tsx`

```ts
const doubleXP = platformSettings?.double_xp ?? { active: false, ends_at: null }
const isDoubleXPActive = doubleXP.active && (!doubleXP.ends_at || Date.now() < new Date(doubleXP.ends_at).getTime())
```

Banner: `{isDoubleXPActive && <div className="double-xp-banner">⚡ Double XP Active!</div>}`

Pass `is_double_xp: isDoubleXPActive` when calling POST `/api/submit-test`.

---

### 4.7 — Wire admin createUser modal from URL

**Action:** Verify admin dashboard opens Create User modal when `?createUser=1` is in URL.

**File:** `app/dashboard/admin/page.tsx`

Triggered by admin visiting `/register` → redirect to `/dashboard/admin?tab=users&createUser=1` → modal auto-opens.

---

### 4.8 — Wire parent–child data isolation

**Action:** Verify all parent Monitor tab data queries use `selectedStudent.id`, never the parent's own id.

**Files:** `app/dashboard/parent/page.tsx`, `components/modules/ReportCardModule.tsx`

All queries in parent dashboard for attempts, attendance, assignments, timetable must filter by `selectedStudent.id`. Changing `selectedStudent` → re-run `loadStudentData()`.

---

### 4.9 — Wire certificate issuance after course completion

**Action:** Ensure `CourseModule` checks and issues certificates when all files are marked complete.

**File:** `components/modules/CourseModule.tsx`

After each file marked complete:
```ts
const allComplete = courseFiles.length > 0 &&
  completedFileIds.length >= courseFiles.length
if (allComplete) {
  await supabase.from('certificates').insert({
    student_id, course_id, student_name, course_title,
    credential_id: crypto.randomUUID(),
  })
}
```

---

### 4.10 — Wire quest claim action

**Action:** Verify quest claim flow calls XP update and marks quest as claimed.

**File:** `components/modules/QuestModule.tsx`

On claim button click:
1. PATCH `/api/quests` with `{ action: 'claim', quest_progress_id }`
2. Server: sets `claimed=true`, calls `atomic_xp_update` RPC with `xp_reward`
3. Client: refresh quest_progress, show XP toast

Alternatively if claim is client-side: direct upsert to `quest_progress` + `atomic_xp_update` RPC call.

---

### 4.11 — Wire notification bell to dashboard layout

**Action:** Verify `NotificationBell` is inside `DashboardLayout` topbar on all 4 dashboards.

**File:** `components/layout/DashboardLayout.tsx`

`<NotificationBell profile={profile} />` must render in the topbar, right of the tab title.

---

### 4.12 — Register service worker from landing page

**Action:** Verify service worker is registered on landing page mount.

**File:** `app/page.tsx`

```ts
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
  }
}, [])
```

---

### 4.13 — Create email templates

**Action:** Create HTML email templates used by Supabase transactional emails.

**File:** `email-templates/confirm-email.html` — Email confirmation template with QGX branding and magic link button

**File:** `email-templates/reset-password.html` — Password reset template with QGX branding and reset button

**File:** `email-templates/invite-user.html` — Admin-created user invitation template with temporary password and QGX link

Upload each template in Supabase Dashboard → Authentication → Email Templates.

---

### 4.14 — Configure Supabase email redirect URLs

**Action:** In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://your-domain.com`
- Redirect URLs (allowed list):
  - `https://your-domain.com/auth/callback`
  - `http://localhost:3000/auth/callback`

**No files created.** Supabase dashboard action.

---

### 4.15 — Run full integration smoke test

**Action:** Start development server and walk through the following flows manually:

```bash
npm run dev
```

Checklist:
- [ ] Landing page loads
- [ ] Login with email/password redirects to correct dashboard
- [ ] Login with QGX ID resolves to correct dashboard
- [ ] Unauthenticated `/dashboard/student` → redirected to `/login`
- [ ] Wrong role access → redirected to correct dashboard
- [ ] Password reset flow: forgot → email → callback → reset → success banner
- [ ] Admin creates user via batch-create → user appears in list
- [ ] Admin deletes user → blocked if last admin
- [ ] Student starts test → exam mode locks sidebar
- [ ] Student submits test → results + XP displayed
- [ ] Quest claimed → XP awarded
- [ ] Double XP activated → banner appears in student dashboard
- [ ] Offline mode → banner appears
- [ ] PWA install prompt appears on landing page

---

## PHASE 5: TESTING

> Implements and runs all automated tests: Jest unit/integration tests and Playwright E2E tests.

---

### 5.1 — Write scoring algorithm unit tests

**Action:** Create Jest tests for the server-side test grading logic.

**File:** `__tests__/scoring.test.ts`

Tests to write:
- MCQ correct/incorrect
- MSQ exact match / partial match (partial = 0 score)
- TF correct/incorrect
- FIB case-insensitive match / mismatch
- Match all-pairs-correct / one-pair-wrong (= 0 score)
- Empty answer_map → score 0
- Zero total marks edge case
- Percent calculation rounding

---

### 5.2 — Write constants unit tests

**Action:** Create Jest tests that assert all constants have their expected values.

**File:** `__tests__/constants.test.ts`

Tests:
- `PAGE_SIZE === 20`
- `MAX_XP_PER_TEST === 500`
- `DOUBLE_XP_DURATION_MS === 3_600_000`
- `DEBOUNCE_MS === 300`
- `MAX_FILE_SIZE === 52428800`
- `NOTIFICATION_LIMIT === 10`
- `DEFAULT_ANTICHEAT.maxAttempts === 1`
- `DAYS.length === 6`
- `DAYS[0] === 'Monday'`

---

### 5.3 — Write utility function unit tests

**Action:** Create Jest tests for shared utility functions.

**File:** `__tests__/utils.test.ts`

Tests:
- `isSafeRedirect('/dashboard/student')` → true
- `isSafeRedirect('//evil.com')` → false
- `isSafeRedirect('/login')` → false (not dashboard)
- `isSafeRedirect('')` → false
- `truncate('hello world', 5)` → `'hello...'`
- `formatBytes(1024)` → `'1 KB'`
- `formatBytes(0)` → `'0 B'`
- `getInitials('John Doe')` → `'JD'`

---

### 5.4 — Run Jest unit tests

**Action:** Execute the Jest test suite and confirm all pass.

```bash
npm test
```

**Expected:** All tests pass. Coverage report generated in `coverage/`.

---

### 5.5 — Install Playwright browsers

**Action:** Install Chromium browser for Playwright testing.

```bash
npx playwright install chromium
```

---

### 5.6 — Create auth setup spec

**Action:** Create the Playwright auth setup that logs in as each of 4 roles and saves storage states.

**File:** `e2e/auth.setup.ts`

For each role (admin, teacher, student, parent):
1. Navigate to `/login`
2. Fill email + password from `.env.test`
3. Click submit
4. Wait for `/dashboard/{role}` URL
5. `page.context().storageState({ path: 'playwright/.auth/{role}.json' })`

---

### 5.7 — Create landing page E2E spec

**Action:** Test the public landing page.

**File:** `e2e/landing.spec.ts`

Tests:
- Page loads with title "QGX"
- "Sign In" link visible and navigates to `/login`
- "Get Started" link visible and navigates to `/register`

---

### 5.8 — Create login page E2E spec

**Action:** Test the login flow.

**File:** `e2e/login.spec.ts`

Tests:
- Empty submit → validation error appears
- Wrong password → error message shown
- Valid email login → redirects to correct dashboard
- Valid QGX ID login → resolves and redirects
- `?redirect=/dashboard/student` preserved after login
- `?reset=success` → green banner shown

---

### 5.9 — Create register page E2E spec

**Action:** Test the registration flow.

**File:** `e2e/register.spec.ts`

Tests:
- Role selector shows student / teacher / parent (no admin)
- Short password → validation error
- Invalid email → validation error
- Admin visiting `/register` → redirected to admin dashboard

---

### 5.10 — Create forgot password E2E spec

**Action:** Test the password reset request flow.

**File:** `e2e/forgot-password.spec.ts`

Tests:
- `?error=expired` param → expired message shown
- Email submit → success confirmation shown
- Form cleared after submit

---

### 5.11 — Create navigation E2E spec

**Action:** Test protected route redirects.

**File:** `e2e/navigation.spec.ts`

Tests:
- `/dashboard/student` without auth → `/login` with `?redirect=...`
- `/dashboard/admin` without auth → `/login`
- Invalid role URL → correct role dashboard

---

### 5.12 — Create security E2E spec

**Action:** Test security-critical flows.

**File:** `e2e/security.spec.ts`

Tests:
- `?redirect=//evil.com` → ignored, goes to role dashboard
- `?next=//evil.com` (auth callback) → defaults to `/reset-password`
- CSRF: direct form POST without session cookie → 401

---

### 5.13 — Create API E2E spec

**Action:** Test API routes directly without browser UI.

**File:** `e2e/api.spec.ts`

Tests:
- `POST /api/submit-test` without auth → 401
- `POST /api/batch-create-user` without auth → 401
- `GET /api/quests` without auth → 401
- `POST /api/ai` without auth → 401
- `POST /api/delete-user` without auth → 401

---

### 5.14 — Create PWA and accessibility E2E spec

**Action:** Test PWA manifest and basic accessibility.

**File:** `e2e/pwa-a11y.spec.ts`

Tests:
- `/manifest.json` returns valid JSON with `name`, `start_url`, `display`
- Landing page has at least one `<h1>`
- Login page inputs have `aria-label` or `<label>` association
- No images without `alt` attribute on landing page

---

### 5.15 — Create authenticated admin E2E spec

**Action:** Test admin dashboard interactions with saved auth state.

**File:** `e2e/authenticated/admin.spec.ts`

Tests (using `admin-auth` project state):
- Dashboard loads with admin navigation
- Sidebar shows admin-specific tabs (users, settings, batch, activity)
- Can navigate to Users tab
- Can navigate to Settings tab
- Can navigate to Activity Log tab
- Can navigate to Batch Create tab
- Sidebar shows admin role badge
- Dashboard layout with sidebar renders
- Profile tab accessible
- Logout button present

---

### 5.16 — Create authenticated student E2E spec

**Action:** Test student dashboard with saved auth state.

**File:** `e2e/authenticated/student.spec.ts`

Tests:
- Dashboard loads
- Learning section tabs visible (tests, courses, assignments)
- Tools section visible (ai-tutor, code, messaging)
- XP Hub tab navigable
- Quests tab navigable

---

### 5.17 — Create authenticated teacher E2E spec

**Action:** Test teacher dashboard with saved auth state.

**File:** `e2e/authenticated/teacher.spec.ts`

Tests:
- Dashboard loads
- Teaching section visible (tests, timetable, courses)
- Tools section visible (plagiarism, meetings, pred-alerts)
- Can navigate to Tests tab

---

### 5.18 — Create authenticated parent E2E spec

**Action:** Test parent dashboard with saved auth state.

**File:** `e2e/authenticated/parent.spec.ts`

Tests:
- Dashboard loads
- Monitor section visible (grades, attendance, timetable, report)
- Communication section visible (excuses, meetings, messaging, alerts)

---

### 5.19 — Create cross-role security E2E spec

**Action:** Test that roles cannot access each other's dashboards.

**File:** `e2e/authenticated/cross-role-security.spec.ts`

Tests (each using the corresponding auth state):
- Student auth + visit `/dashboard/admin` → redirected to `/dashboard/student`
- Teacher auth + visit `/dashboard/admin` → redirected to `/dashboard/teacher`
- Parent auth + visit `/dashboard/student` → redirected to `/dashboard/parent`
- Admin auth + visit `/dashboard/student` → redirected to `/dashboard/admin`

---

### 5.20 — Run all Playwright E2E tests

**Action:** Start the dev server and run the full E2E suite.

```bash
npm run dev &        # Start dev server in background
npx playwright test  # Run all E2E tests
```

**Expected:** All tests pass. Report generated at `playwright-report/index.html`.

---

### 5.21 — Run production build verification

**Action:** Execute a full production build and confirm zero errors.

```bash
npm run build
```

**Expected:**
- 0 TypeScript errors
- 0 ESLint errors (warnings acceptable)
- All pages successfully compiled
- No missing environment variable errors

---

### 5.22 — Generate test coverage report

**Action:** Run Jest with coverage flags and inspect results.

```bash
npm test -- --coverage
```

**Files updated:** `coverage/lcov-report/index.html`, `coverage/clover.xml`, `coverage/lcov.info`

Review: `__tests__/scoring.test.ts` should achieve full coverage of the scoring logic. `__tests__/utils.test.ts` should achieve full coverage of utility functions.

---

### 5.23 — Deploy to Vercel

**Action:** Push to GitHub and connect the repository to Vercel.

Prerequisites:
- `vercel.json` exists with `{ "framework": "nextjs" }`
- All env vars from `.env.local` are added in Vercel Dashboard → Settings → Environment Variables

```bash
git add .
git commit -m "chore: production-ready build"
git push origin main
```

Vercel auto-deploys on push. Confirm:
- Build log shows 0 errors
- Production URL loads the landing page
- `/login` and `/register` accessible
- `/dashboard/*` routes redirect to `/login` when unauthenticated

---

## SUMMARY

| Phase | Steps | Key Deliverables |
|-------|-------|-----------------|
| **Phase 1: Setup** | 1.1–1.19 | Scaffolded project, all dependencies, DB schema, seeded accounts, type system, constants |
| **Phase 2: Core Backend** | 2.1–2.14 | Supabase client, middleware, auth callback, 5 API routes (ai, submit-test, batch-create-user, delete-user, quests) |
| **Phase 3: Core Frontend** | 3.1–3.51 | Global CSS, root layout, PWA assets, 4 auth pages, 10 UI primitives, 2 layout components, 4 dashboard SPAs, 25 feature modules |
| **Phase 4: Integration** | 4.1–4.15 | Auth state wiring, realtime subscriptions, offline detection, exam mode, deep links, certificate issuance, email templates, smoke test |
| **Phase 5: Testing** | 5.1–5.23 | 3 Jest test files (64 tests), 12 Playwright E2E spec files, coverage report, production build verification, Vercel deployment |

**Total steps: 111**

---

*Last updated: April 6, 2026*
