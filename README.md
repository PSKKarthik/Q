<div align="center">

# QGX — Query Gen X

**A Next-Gen Learning Management System**

Built with Next.js 14 · Supabase · GROQ AI · TypeScript

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?logo=supabase)](https://supabase.com)
[![Tests](https://img.shields.io/badge/Tests-64%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

</div>

---

## Overview

QGX (Query Gen X) is a full-stack Learning Management System designed for schools & institutions. It supports 4 user roles — **Admin**, **Teacher**, **Student**, and **Parent** — with gamification (XP/levels), AI tutoring, anti-cheat testing, real-time notifications, and a progressive web app experience.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Inline CSS, CSS variables, dark/light theme |
| Backend | Next.js API Routes, Server Components |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth with SSR cookie sessions |
| AI | GROQ API (Llama 3.3 70B + Llama 4 Scout) |
| Testing | Jest 30 + React Testing Library (64 tests) |
| Hosting | Vercel (frontend) + Supabase (backend) |
| PWA | Service Worker, Web App Manifest, offline page |

---

## Features

### Admin Dashboard
- User management (create, batch-create, delete)
- System-wide announcements with realtime broadcast
- Analytics overview (users, courses, tests, attempts)
- Double XP Hour toggle
- Activity log viewer

### Teacher Dashboard
- Create tests & quizzes (MCQ, MSQ, True/False, Fill-in-Blank, Match)
- AI-powered question generation via GROQ
- Anti-cheat settings (tab-switch detection, copy-paste block, shuffle, fullscreen lock, per-question timer)
- Grade management & student analytics
- Course management with file uploads
- Assignment creation & grading
- Live classes via Jitsi Meet
- Attendance tracking
- Timetable management

### Student Dashboard
- Test/quiz attempt flow with timer & anti-cheat enforcement
- XP & leveling system (7 levels: Novice → Grandmaster)
- Ghost Racing (compete against your past scores)
- QGX Wrapped (end-of-term summary)
- AI Tutor chat with image support
- Forum discussions
- Certificate generation
- Code Playground
- Collaboration tools
- Leaderboard

### Parent Dashboard
- View linked children's grades & attendance
- Predictive alerts for at-risk students
- Communication with teachers

### Cross-Role Features
- Real-time notifications with bell icon
- Dark/light theme toggle
- QGX IDs (e.g., QGX-S0001)
- Profile management with avatar upload
- PWA (installable, offline-ready)
- Responsive design (mobile + desktop)

---

## Demo Credentials

| Email | Password | Role |
|---|---|---|
| `admin@qgx.demo` | `QGX@admin2024` | Admin |
| `teacher1@qgx.demo` | `QGX@teacher2024` | Teacher |
| `student1@qgx.demo` | `QGX@student2024` | Student |
| `parent1@qgx.demo` | `QGX@parent2024` | Parent |

> Run `npm run seed` to populate these demo accounts (requires `SUPABASE_SERVICE_ROLE_KEY`).

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [Supabase](https://supabase.com) project (free tier works)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/qgx.git
cd qgx
npm install
```

### 2. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase-schema.sql` in the SQL Editor
3. Enable Realtime replication for: `announcements`, `notifications`, `attempts`, `tests`, `activity_log`

### 3. Configure Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
GROQ_API_KEY=your-groq-api-key
```

### 4. Seed Demo Data (Optional)

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-key npm run seed
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run test` | Run test suite (64 tests) |
| `npm run seed` | Seed database with demo data |
| `npm run lint` | Run ESLint |

---

## Project Structure

```
app/
├── page.tsx                 # Landing page
├── layout.tsx               # Root layout with theme/toast providers
├── login/                   # Auth pages
├── register/
├── forgot-password/
├── reset-password/
├── dashboard/
│   ├── admin/               # Admin dashboard
│   ├── teacher/             # Teacher dashboard
│   ├── student/             # Student dashboard
│   └── parent/              # Parent dashboard
└── api/
    ├── ai/                  # GROQ AI endpoints
    ├── submit-test/         # Test submission & scoring
    ├── batch-create-user/   # Bulk user creation
    └── delete-user/         # User deletion

components/
├── layout/                  # DashboardLayout, NotificationBell
├── modules/                 # 25+ feature modules
└── ui/                      # Reusable UI components

lib/                         # Supabase client, utils, theme, constants
types/                       # TypeScript interfaces
__tests__/                   # Jest test suites
scripts/                     # Seed data script
email-templates/             # Supabase email templates (3 templates)
```

---

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import repo at [vercel.com](https://vercel.com)
3. Add environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GROQ_API_KEY`)
4. Deploy

### Email Templates

Paste the HTML from `email-templates/` into **Supabase → Authentication → Email Templates**:
- `confirm-email.html` → Confirm signup
- `reset-password.html` → Reset password
- `invite-user.html` → Invite user

---

## Testing

```bash
npm test
```

**64 tests** across 3 suites:
- `utils.test.ts` — sanitization, ID generation, XP levels, file utilities
- `scoring.test.ts` — MCQ/MSQ/T-F/FIB/Match scoring, XP calculation
- `constants.test.ts` — configuration constants validation

---

## Cost

| Service | Tier | Cost |
|---|---|---|
| Supabase | Free (50K MAU) | $0 |
| Vercel | Hobby | $0 |
| GROQ AI | Free tier | $0 |
| **Total** | | **$0/month** |

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Module not found | Run `npm install` |
| Invalid API key | Check `.env.local` — no spaces around `=` |
| Loading forever | Check browser console (F12), verify Supabase keys |
| Realtime not working | Enable Replication for required tables in Supabase |
| Can't sign in | Check Supabase → Authentication → Users |

---

## License

MIT
