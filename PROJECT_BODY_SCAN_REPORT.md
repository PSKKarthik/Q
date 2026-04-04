# PROJECT BODY SCAN REPORT

Date: 2026-04-04
Scope: Full-stack audit (code errors + product/human testing matrix + architecture/risk body scan)

## Executive Summary

Overall Health Score: 84/100

Deployment Verdict: Ready with conditions

Conditions before production confidence:
1. Fix critical/high RLS authorization gaps in messaging/reporting/profile/activity data.
2. Run full manual runtime walkthrough for all sidebar features using real seeded users.
3. Align realtime publication guidance with actual listeners and migration expectations.

## Risk Heatmap

- Critical: 1
- High: 4
- Medium: 5
- Low: 4

## Evidence-Based Quality Gates

- Build: PASS
- Lint: PASS with warnings
- Tests: PASS (64/64)

## Findings By Body System

### A) Physical Problems (UI, responsiveness, perceived performance)

1. QGX-011 (Low): Parent role color token missing in role map.
2. QGX-012 (Low): Multiple img warnings reduce default optimization path.
3. QGX-013 (Low): TypeScript parser support warning increases tooling drift risk.

### B) Mental Problems (logic clarity, UX confidence, cognitive load)

1. QGX-006 (Medium): submit-test route enforces end deadline but lacks explicit pre-start rejection guard.
2. QGX-008 (Medium): parent-child linking by bare QGX ID can create trust anxiety and misuse risk.

### C) Outside Problems (security, privacy, external exposure)

1. QGX-001 (Critical): messages update policy allows unauthorized mutation patterns.
2. QGX-002 (High): parent visibility on report comments is not linked-child constrained.
3. QGX-003 (High): profiles table broadly visible to all authenticated users.
4. QGX-004 (High): activity log globally readable by any authenticated user.
5. QGX-005 (High): public storage bucket can expose sensitive assets.
6. QGX-009 (Medium): batch user endpoint returns reset link in API response.

### D) Inside Problems (architecture, maintainability, consistency)

1. QGX-007 (Medium): messaging listens to message_groups realtime, but replication guidance is incomplete.
2. QGX-010 (Medium): AI rate limiting is in-memory and not durable across instances.
3. QGX-014 (Medium): announcements insert policy over-permissive for all authenticated users.

## Detailed Findings

### QGX-001
- Severity: Critical
- Category: Outside
- Role Impact: All
- Feature: Messaging
- Evidence: db-single-run.sql lines 823 and 935
- Repro: As DM receiver or group member, attempt to update body/deleted on a message not authored by self.
- Expected: Only sender can edit/delete content; receivers should only toggle read state.
- Actual: Update policy grants broad update pathways for non-authors.
- Root Cause Hypothesis: Single broad update policy without field-level or author-only constraints.
- Recommended Fix: Split into scoped policies and/or controlled RPC.

### QGX-002
- Severity: High
- Category: Outside
- Role Impact: Parent
- Feature: Report comments
- Evidence: db-single-run.sql line 971
- Repro: Parent queries report_comments directly.
- Expected: Parent only sees linked student records.
- Actual: Parent role can select report comments broadly.
- Root Cause Hypothesis: Missing parent_students join condition in policy.
- Recommended Fix: Constrain parent read by linkage table.

### QGX-003
- Severity: High
- Category: Outside
- Role Impact: All
- Feature: Profiles privacy
- Evidence: db-single-run.sql line 359
- Repro: Authenticated user queries profiles.
- Expected: Scoped or redacted profile view.
- Actual: Broad read for all authenticated users.
- Root Cause Hypothesis: Convenience policy left in place.
- Recommended Fix: Redacted view + role/scoped policy.

### QGX-004
- Severity: High
- Category: Outside
- Role Impact: All
- Feature: Activity log
- Evidence: db-single-run.sql line 509
- Repro: Any authenticated user reads activity_log.
- Expected: Admin/ops scoped visibility.
- Actual: using (true) allows all.
- Root Cause Hypothesis: Missing role gate in select policy.
- Recommended Fix: Restrict select to admin (and optional scoped teacher analytics).

### QGX-005
- Severity: High
- Category: Outside
- Role Impact: All
- Feature: Attachments privacy
- Evidence: db-single-run.sql line 9
- Repro: Access uploaded object public URL without auth.
- Expected: Private/signed access for sensitive assets.
- Actual: Public bucket allows broad URL access.
- Root Cause Hypothesis: Single public bucket used for mixed sensitivity workloads.
- Recommended Fix: Split bucket strategy and signed URLs.

### QGX-006
- Severity: Medium
- Category: Mental
- Role Impact: Student
- Feature: Test submission timing
- Evidence: app/api/submit-test/route.ts lines 84 and 87
- Repro: Submit before scheduled start through direct API call.
- Expected: Server rejects early attempt.
- Actual: End deadline check exists; explicit pre-start guard absent.
- Root Cause Hypothesis: Deadline-only enforcement implementation.
- Recommended Fix: Add now < scheduledStart rejection.

### QGX-007
- Severity: Medium
- Category: Inside
- Role Impact: Teacher/Student
- Feature: Group messaging realtime
- Evidence: components/modules/MessagingModule.tsx line 136, db-single-run.sql lines 1208 and 1214, db-single-run.sql line 548
- Repro: Deploy using only documented replication toggle notes.
- Expected: Group/thread sidebar updates consistently.
- Actual: Listener includes message_groups but deployment guidance omits it.
- Root Cause Hypothesis: Documentation-migration drift.
- Recommended Fix: Add publication + docs checklist update for message_groups.

### QGX-008
- Severity: Medium
- Category: Mental
- Role Impact: Parent/Student
- Feature: Parent link workflow
- Evidence: app/dashboard/parent/page.tsx line 157
- Repro: Parent enters known student QGX ID.
- Expected: Consent/approval tokenized linking.
- Actual: Direct link can be established from ID knowledge.
- Root Cause Hypothesis: Trust model relies on secrecy of identifier.
- Recommended Fix: One-time invite codes with expiry and approval/audit.

### QGX-009
- Severity: Medium
- Category: Outside
- Role Impact: Admin
- Feature: Batch create API
- Evidence: app/api/batch-create-user/route.ts line 127
- Repro: Admin calls endpoint and captures reset link from response.
- Expected: Controlled and auditable reset-link handling.
- Actual: Link returned in payload.
- Root Cause Hypothesis: UX convenience prioritized over exposure minimization.
- Recommended Fix: Minimize exposure path, shorten expiry, enforce audit and secure channel.

### QGX-010
- Severity: Medium
- Category: Inside
- Role Impact: All
- Feature: AI rate limiting
- Evidence: app/api/ai/route.ts lines 7 and 71
- Repro: Multi-instance scale or restart burst.
- Expected: Stable distributed throttling.
- Actual: Process-local memory limiter only.
- Root Cause Hypothesis: Single-node development limiter carried forward.
- Recommended Fix: Distributed/shared limiter backend.

### QGX-011
- Severity: Low
- Category: Physical
- Role Impact: Parent
- Feature: Role color
- Evidence: components/layout/DashboardLayout.tsx line 46
- Repro: Open parent dashboard and inspect role style.
- Expected: Explicit parent color token.
- Actual: Parent role not mapped in roleColor record.
- Root Cause Hypothesis: Incomplete role-color map after parent role addition.
- Recommended Fix: Add parent color entry.

### QGX-012
- Severity: Low
- Category: Physical
- Role Impact: All
- Feature: Image optimization
- Evidence: lint output (multiple no-img-element warnings)
- Repro: npm run lint
- Expected: next/image used for major imagery.
- Actual: Raw img usage remains.
- Root Cause Hypothesis: Legacy component migration incomplete.
- Recommended Fix: Replace key img tags or explicitly document intentional exceptions.

### QGX-013
- Severity: Low
- Category: Physical
- Role Impact: Dev/Ops
- Feature: TypeScript toolchain alignment
- Evidence: lint output warning about TS support range
- Repro: npm run lint
- Expected: Supported parser + TS matrix.
- Actual: TS 5.9.3 warning shown.
- Root Cause Hypothesis: Dependency drift.
- Recommended Fix: Harmonize TS + eslint parser ecosystem versions.

### QGX-014
- Severity: Medium
- Category: Inside
- Role Impact: All
- Feature: Announcement publishing authorization
- Evidence: db-single-run.sql line 387
- Repro: Authenticated non-staff user inserts announcement directly.
- Expected: Limited publish roles.
- Actual: insert allowed for any authenticated.
- Root Cause Hypothesis: Overly broad insertion policy.
- Recommended Fix: Restrict to admin/teacher roles.

## Login Handle and Feature Coverage Summary

Coverage produced in full matrix:
- Authentication handles (login email/QGX, register, forgot/reset, callback, middleware role guard)
- Student sidebar: 21 items
- Teacher sidebar: 21 items
- Admin sidebar: 15 items
- Parent sidebar: 11 items
- Core action buttons and major workflows
- Ideology coherence checks by role and feature grouping

See detailed matrix in PROJECT_CHECKLIST_MATRIX.md.

## Human-Style Diagnosis (Project as a Human)

- Physical health: Strong build posture, but visible posture issues (image optimization warnings, minor role-color inconsistency).
- Mental health: Functional cognition is solid, but trust/flow stress appears in parent-link logic and a timing-edge in submit-test.
- Outside health: Immune system has notable weak points in RLS around messaging/content visibility and broad profile/activity exposure.
- Inside health: Organs are mostly connected, but policy-model alignment and distributed runtime assumptions need correction.

## Top 20 Prioritized Fix Plan

1. Lock down messages_update policy for author-only content edits.
2. Restrict report_comments parent visibility via parent_students mapping.
3. Restrict profiles_select visibility and create sanitized profile view.
4. Restrict activity_log_select to admin.
5. Harden storage strategy: private bucket/signed URLs for sensitive files.
6. Restrict announcements_insert to admin/teacher.
7. Add submit-test start-time guard.
8. Add message_groups to realtime publication and deployment docs.
9. Add parent consent/tokenized child-link flow.
10. Replace in-memory AI limiter with distributed limiter.
11. Add audit scope controls for batch-create reset link handling.
12. Add parent color token mapping in dashboard layout.
13. Migrate major img tags to next/image where feasible.
14. Align TypeScript + eslint parser dependency matrix.
15. Add E2E auth flow tests for all roles.
16. Add E2E messaging tests for DM/group read/update constraints.
17. Add policy regression test scripts for critical RLS tables.
18. Add observability dashboard for auth failures and API 4xx/5xx spikes.
19. Add per-role integration smoke script post-deployment.
20. Add formal release checklist gate requiring manual feature matrix sign-off.

## Files Generated

- PROJECT_BODY_SCAN_REPORT.md
- PROJECT_CHECKLIST_MATRIX.md
- PROJECT_DEFECT_LOG.csv
