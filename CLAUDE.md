# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint check
npm run test         # Run Jest unit tests (verbose)
npm run test:e2e     # Run Playwright E2E tests
npm run seed         # Seed Supabase with demo data (requires SUPABASE_SERVICE_ROLE_KEY)
```

Run a single Jest test file:
```bash
npx jest __tests__/scoring.test.ts
```

## Architecture Overview

**QGX (Query Gen X)** is a role-based LMS with four dashboards: Admin, Teacher, Student, Parent. Each dashboard is a single large client component (`app/dashboard/<role>/page.tsx`) that tab-routes to feature modules rather than using Next.js file-based routing for sub-views.

### Data Layer

- **Supabase** (PostgreSQL + Row-Level Security) is the sole database. The browser client lives at `lib/supabase.ts` (PKCE auth flow). API routes that need admin privileges create their own `createClient` with `SUPABASE_SERVICE_ROLE_KEY` directly in the route handler.
- **Real-time**: Supabase `postgres_changes` subscriptions are used in modules that need live updates (forums, notifications). Tables that broadcast UPDATE payloads require `REPLICA IDENTITY FULL` — run `ALTER TABLE <t> REPLICA IDENTITY FULL` in Supabase before subscribing to updates.
- After any schema change, trigger a PostgREST cache reload: `NOTIFY pgrst, 'reload schema';`

### Module Pattern

Feature work lives in `components/modules/`. Each module is a self-contained client component receiving a `profile: Profile` prop. Modules own their own data fetching via `useCallback`/`useEffect`. They do **not** use a global state manager.

### API Routes

`app/api/` has 10 routes. Critical ones:

| Route | Purpose |
|---|---|
| `submit-test` | Server-side scoring (anti-cheat safe) — never trust client scores |
| `setup-profile` | Called after `signUp()` to create profile row + QGX ID; uses service role key since no session exists yet |
| `notify` | Triggers in-app push + email for specific event types (meeting_requested, excuse_submitted, etc.) |
| `ai` | GROQ question generation; Node.js runtime, rate-limited 10/min |
| `send-email` | Brevo SMTP via Nodemailer; accepts `to`, `subject`, `template`, `message` |
| `batch-create-user` | Bulk user creation (admin only) |

### Key Libraries

- `lib/actions.ts` — `pushNotification(userId, msg, type)`, `pushNotificationBatch(userIds[], msg, type)`, `logActivity(msg, type)`
- `lib/utils.ts` — `sanitizeText()`, `generateQGXId(role)`, `getLevel(xp)` (7-tier: ROOKIE→IMMORTAL), `isSafeRedirect()`, CSV/file helpers
- `lib/checkAnswer.ts` — Answer validation for MCQ/MSQ/T-F/FIB/Match question types
- `lib/email.ts` — Email helpers including typed templates (`meetingRequestEmail`, `excuseSubmittedEmail`, etc.)
- `lib/ratelimit.ts` — Upstash Redis sliding window (10/min) with in-memory fallback for dev

### Multi-Institution Data Model

Institutions → Classrooms → ClassroomMember rows. Adding a member to a classroom should also set `profiles.institution_id`. The register page reads `active` institutions from the DB; admins control visibility via the `active` flag.

### Styling

No CSS framework. All styles are inline or via CSS custom properties (`var(--bg)`, `var(--accent)`, `var(--fg-dim)`, `var(--border)`, `var(--danger)`, `var(--success)`, `var(--mono)`, `var(--display)`). Reusable class names like `.btn`, `.btn-primary`, `.btn-sm`, `.card`, `.input`, `.label`, `.tag`, `.tag-success`, `.tag-warn`, `.tag-danger`, `.spinner`, `.fade-up`, `.fade-up-1`, `.fade-up-2`, `.fade-up-3` are defined globally. Use `components/ui/` primitives (`PageHeader`, `StatGrid`, `SectionLabel`, `Modal`, `Icon`) to stay consistent.

### TypeScript Gotchas

- Supabase `PostgrestError` is **not** an `instanceof Error`. Always extract error messages with `(err as any)?.message || 'fallback'` rather than `err instanceof Error ? err.message : 'fallback'`.
- Use `Array.from(new Set(...))` instead of `[...new Set(...)]` — the spread form fails with the current `tsconfig` target.

### Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Admin operations in API routes |
| `GROQ_API_KEY` | Yes | AI tutor + question generation |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Prod only | Rate limiting |
| `BREVO_API_KEY`, `BREVO_SENDER_NAME`, `BREVO_SENDER_EMAIL` | Email features | Brevo SMTP |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Error monitoring |

### Testing

- **64 unit tests** in `__tests__/` covering answer scoring, XP calculations, sanitization, and utility functions.
- E2E tests in `e2e/` via Playwright — auth state stored in `playwright/.auth/` (gitignored).
- Jest uses `jsdom` environment; path alias `@/*` resolves to project root.
