# QGX — Query Gen X LMS
## Complete Setup Guide (Beginner Friendly)

---

## STEP 1 — Install Node.js
1. Go to **https://nodejs.org**
2. Download the **LTS** version
3. Install it (click Next → Next → Install)
4. Verify: open Terminal/CMD and type `node -v` → should show a version number

---

## STEP 2 — Create Supabase Account & Project
1. Go to **https://supabase.com**
2. Click "Start your project" → Sign up with GitHub
3. Click **"New project"**
   - Name: `qgx`
   - Database password: choose something strong, SAVE IT
   - Region: pick closest to you
4. Wait ~2 minutes for setup

---

## STEP 3 — Run the Database Schema
1. In Supabase dashboard → click **"SQL Editor"** (left sidebar)
2. Click **"New query"**
3. Open the file `supabase-schema.sql` from this project
4. Copy ALL its contents and paste into the SQL editor
5. Click **"Run"**
6. You should see "Success. No rows returned"

---

## STEP 4 — Enable Realtime
1. In Supabase → **Database** → **Replication** (left sidebar)
2. Find these tables and toggle them ON:
   - announcements
   - notifications  
   - attempts
   - tests
   - activity_log

---

## STEP 5 — Get Your API Keys
1. In Supabase → **Settings** → **API**
2. Copy:
   - **Project URL** (looks like: https://abcdefgh.supabase.co)
   - **anon public** key (long string starting with eyJ...)

---

## STEP 6 — Set Up the Project
1. Open Terminal/CMD
2. Navigate to this folder:
   ```
   cd path/to/qgx
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Create environment file:
   - Copy `.env.local.example` → rename to `.env.local`
   - Open `.env.local` in any text editor
   - Paste your Supabase URL and key:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   NEXT_PUBLIC_CLAUDE_API_KEY=your-claude-key (optional, for AI questions)
   ```

---

## STEP 7 — Run Locally
```
npm run dev
```
Open **http://localhost:3000** in your browser.

---

## STEP 8 — Register Your First Users
Since this is a real backend, you need to register users:

1. Go to http://localhost:3000/register
2. Register an **Admin** account
3. Register a **Teacher** account  
4. Register **Student** accounts

These will be saved permanently in your Supabase database.

---

## STEP 9 — Deploy to Vercel (Free)
1. Create GitHub account at **https://github.com**
2. Create a new repository named `qgx`
3. Push your code:
   ```
   git init
   git add .
   git commit -m "QGX initial"
   git remote add origin https://github.com/YOURNAME/qgx.git
   git push -u origin main
   ```
4. Go to **https://vercel.com** → Sign up with GitHub
5. Click **"New Project"** → Import your `qgx` repo
6. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_CLAUDE_API_KEY`
7. Click **Deploy**
8. Get your live URL like **qgx.vercel.app** in 2 minutes! 🎉

---

## FEATURES INCLUDED
- ✅ Real authentication (Supabase Auth)
- ✅ Persistent database (Postgres)
- ✅ Realtime announcements & notifications
- ✅ Admin: User management, announcements, analytics, Double XP control
- ✅ Teacher: Tests, quizzes, question bank (MCQ/MSQ/T-F/FIB/Match)
- ✅ Teacher: AI question generation (Claude API)
- ✅ Teacher: Anti-cheat settings (tab switch, copy-paste block, shuffle, fullscreen, per-Q timer)
- ✅ Teacher: Analytics dashboard
- ✅ Student: Full test/quiz attempt flow with timer
- ✅ Student: Ghost Racing (compete vs your past score)
- ✅ Student: Double XP Hour support
- ✅ Student: QGX Wrapped (end-of-term summary)
- ✅ Student: Jitsi Meet live classes
- ✅ Student: Leaderboard
- ✅ Notification bell (all roles)
- ✅ Theme toggle (dark ↔ light)
- ✅ QGX IDs (QGX-S0001 format)
- ✅ Free hosting (Vercel + Supabase free tier)

---

## TROUBLESHOOTING

**"Module not found" error**
→ Run `npm install` again

**"Invalid API key" from Supabase**
→ Check your `.env.local` file, make sure no spaces around `=`

**Page shows "Loading..." forever**
→ Check browser console (F12) for errors
→ Verify your Supabase URL and key are correct

**Realtime not working**
→ Make sure you enabled Replication in Step 4

**Can't sign in**
→ Check Supabase → Authentication → Users to see if account was created
→ Make sure email confirmation is disabled: Supabase → Authentication → Settings → uncheck "Enable email confirmations"

---

## DISABLE EMAIL CONFIRMATION (Important!)
By default Supabase requires email verification. For development:
1. Supabase → **Authentication** → **Settings**
2. Scroll to "Email Auth"
3. **Uncheck** "Enable email confirmations"
4. Save

---

## COST
- Supabase free tier: up to 50,000 monthly active users
- Vercel free tier: unlimited hobby deployments
- **Total cost: $0/month** for most use cases
