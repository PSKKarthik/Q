# QGX Project: Complete Workflow Analysis
## Breakages, Loopholes, Missing Functions & Logic

---

## 📊 COMPLETE WORKFLOW BREAKDOWN

### 1. AUTHENTICATION FLOW
```
User → HOME (/page.tsx)
  ├─ [NEW USER] → REGISTER (/register/page.tsx)
  │   ├─ Select Role (Student|Teacher|Admin)
  │   ├─ Enter: Name, Email, Password, Phone (opt)
  │   ├─ Generate QGX ID: (A/T/S)####
  │   ├─ Create Supabase Auth User
  │   ├─ Create Profile in DB
  │   └─ Route to /dashboard/{role}
  │
  └─ [EXISTING USER] → LOGIN (/login/page.tsx)
      ├─ Enter Email & Password
      ├─ Authenticate via Supabase.auth.signInWithPassword()
      ├─ Fetch Profile + Role
      └─ Route to /dashboard/{role}
```

### 2. STUDENT WORKFLOW
```
STUDENT DASHBOARD (/dashboard/student)
├─ HOME (Overview)
│   ├─ Display Announcements
│   ├─ Show XP Tier (ROOKIE → SCHOLAR → ACHIEVER → ELITE → LEGEND)
│   ├─ Display Leaderboard
│   └─ Ghost Score Tracking
│
├─ TESTS TAB
│   ├─ Fetch Scheduled Tests
│   ├─ Show Attempted Status
│   ├─ [CLICK ATTEMPT]
│   │   ├─ Load Questions from DB
│   │   ├─ Apply Anti-Cheat Rules:
│   │   │   ├─ Randomize Q order (if enabled)
│   │   │   ├─ Randomize options (if enabled)
│   │   │   ├─ Request full-screen (if enabled)
│   │   │   ├─ Monitor tab-switch (if enabled)
│   │   │   └─ Set time-per-Q (if enabled)
│   │   ├─ Display Question Review UI
│   │   ├─ Record Answers in answers{}
│   │   ├─ Timer: duration * 60 seconds
│   │   ├─ [SUBMIT]
│   │   │   ├─ Calculate Score:
│   │   │   │   ├─ MCQ: Compare answer===question.answer
│   │   │   │   ├─ TF: Direct boolean match
│   │   │   │   ├─ FIB: Case-insensitive trim() match
│   │   │   │   ├─ MSQ: JSON.stringify sort & compare
│   │   │   │   └─ Match: TBD (NOT FULLY IMPLEMENTED)
│   │   │   ├─ Calculate %: (score/total)*100
│   │   │   ├─ Check Ghost Score (prev attempt %)
│   │   │   ├─ Apply Double XP if active
│   │   │   ├─ Award Ghost Bonus (+50 XP if > ghost)
│   │   │   ├─ Update Attempt DB
│   │   │   ├─ Update Profile (XP, Score, Ghost Wins)
│   │   │   ├─ Push Notification
│   │   │   ├─ Log Activity
│   │   │   └─ Display Result Card
│   │
├─ COURSES TAB
│   ├─ Fetch All Available Courses
│   ├─ Display: Title, Subject, Teacher, Description
│   ├─ [CLICK COURSE]
│   │   ├─ Fetch Course Files
│   │   ├─ Display Files (PDF, Video, Image, Doc)
│   │   ├─ [ENROLL] (If not enrolled)
│   │   │   ├─ Create enrollment record
│   │   │   └─ Add to enrolledIds[]
│   │   └─ Display Materials for enrolled courses
│   │
├─ ASSIGNMENTS TAB
│   ├─ Fetch All Assignments
│   ├─ Display: Title, Due Date, Status
│   ├─ [CLICK ASSIGNMENT]
│   │   ├─ Show Teacher Attachment (if any)
│   │   ├─ Allow student to submit file
│   │   ├─ [SUBMIT FILE]
│   │   │   ├─ Upload to storage
│   │   │   ├─ Create submission record
│   │   │   └─ Notify teacher
│   │   └─ Show grade if graded
│   │
├─ TIMETABLE TAB
│   ├─ Fetch All Timetable Slots
│   ├─ Display by Day
│   ├─ [CLICK SLOT]
│   │   └─ Join Jitsi Meet: meet.jit.si/{slot.room}
│   │
├─ LEADERBOARD TAB
│   ├─ Fetch All Students
│   ├─ Sort by XP (descending)
│   ├─ Display Rank, Name, XP, Tier
│   └─ Highlight "My Rank"
│
├─ FORUMS TAB
│   ├─ Fetch Forum Posts (pinned first)
│   ├─ [CREATE POST]
│   │   ├─ Enter Title & Body
│   │   └─ Insert to forum_posts
│   ├─ [OPEN POST]
│   │   ├─ Fetch Comments
│   │   ├─ [ADD COMMENT]
│   │   └─ [LIKE POST]
│   │
├─ WRAPPED TAB
│   ├─ Display Stats:
│   │   ├─ Total XP
│   │   ├─ Tier
│   │   ├─ Global Rank
│   │   ├─ Best Score
│   │   ├─ Tests Attempted
│   │   └─ Ghost Wins
│   └─ [COPY WRAPPED]
│
└─ PROFILE TAB
    ├─ Display Profile Info
    ├─ Edit Name, Email, Phone, Bio
    └─ [LOGOUT] → /login
```

### 3. TEACHER WORKFLOW
```
TEACHER DASHBOARD (/dashboard/teacher)
├─ HOME (Overview)
│   ├─ Display Class Stats
│   └─ Show Recent Activity
│
├─ TESTS & QUIZZES TAB
│   ├─ [CREATE TEST/QUIZ]
│   │   ├─ Enter: Title, Subject, Duration, Type
│   │   ├─ Configure Anti-Cheat (optional)
│   │   ├─ Create test record → Get test ID
│   │   ├─ [ADD QUESTIONS - MANUAL]
│   │   │   ├─ Select Question Type (MCQ|MSQ|TF|FIB|MATCH)
│   │   │   ├─ Enter Question Text
│   │   │   ├─ Enter Options (if applicable)
│   │   │   ├─ Set Correct Answer
│   │   │   ├─ Set Marks
│   │   │   ├─ Save to questions table
│   │   │   └─ Update total_marks in tests
│   │   │
│   │   └─ [ADD QUESTIONS - AI]
│   │       ├─ Enter Topic & Type
│   │       ├─ Call Groq LLaMA API
│   │       ├─ Parse JSON response
│   │       ├─ Inject questions into DB
│   │       └─ Update total_marks
│   │
│   ├─ VIEW TEST
│   │   ├─ Show all questions
│   │   ├─ [EDIT QUESTION]
│   │   └─ [DELETE QUESTION]
│   │
│   ├─ SCHEDULE TEST
│   │   ├─ Set scheduled_date & scheduled_time
│   │   ├─ Set status='scheduled'
│   │   └─ Notify students
│   │
│   └─ VIEW SUBMISSIONS
│       ├─ Fetch all attempts for test
│       ├─ Display Score, Percent, Submitted Time
│       └─ [VIEW ANSWERS]
│
├─ TIMETABLE TAB
│   ├─ [ADD SLOT]
│   │   ├─ Enter: Subject, Day, Time, Room (auto-generated or custom)
│   │   └─ Save to timetable
│   ├─ View all slots
│   ├─ [EDIT SLOT]
│   └─ [DELETE SLOT]
│
├─ COURSES TAB
│   ├─ [CREATE COURSE]
│   │   ├─ Enter: Title, Subject, Description
│   │   └─ Create course record
│   │
│   ├─ [OPEN COURSE]
│   │   ├─ Display Files (if any)
│   │   ├─ [UPLOAD FILE]
│   │   │   ├─ Upload to storage bucket
│   │   │   ├─ Get public URL
│   │   │   └─ Create course_files record
│   │   ├─ [DELETE FILE]
│   │   │   ├─ Delete from storage
│   │   │   └─ Delete from DB
│   │   └─ [DELETE COURSE]
│   │       ├─ Clean up all files
│   │       └─ Delete course record
│   │
│   └─ Notify students on course creation
│
├─ ASSIGNMENTS TAB
│   ├─ [CREATE ASSIGNMENT]
│   │   ├─ Enter: Title, Description, Due Date
│   │   ├─ Optionally attach file
│   │   └─ Notify students
│   │
│   ├─ [OPEN ASSIGNMENT]
│   │   ├─ View Student Submissions
│   │   ├─ [OPEN SUBMISSION]
│   │   │   ├─ Download/View student file
│   │   │   ├─ [GRADE]
│   │   │   │   ├─ Enter Score & Feedback
│   │   │   │   ├─ Update submission record
│   │   │   │   └─ Notify student
│   │   │   └─ Show Feedback
│   │   │
│   │   └─ [DELETE ASSIGNMENT]
│   │
│   └─ Analytics: Response rate, avg score, etc.
│
├─ ANNOUNCEMENTS TAB
│   ├─ [POST ANNOUNCEMENT]
│   │   ├─ Enter: Title, Body, Pin option
│   │   ├─ Target: 'students'
│   │   └─ Notify all students
│   │
│   └─ View announcement history
│
├─ FORUMS TAB
│   ├─ View all posts
│   ├─ [PIN POST] (can only pin own posts)
│   ├─ [DELETE POST]
│   ├─ [COMMENT ON POST]
│   └─ [DELETE COMMENT]
│
├─ ANALYTICS TAB
│   ├─ Test Performance Stats
│   ├─ Student Engagement
│   └─ Course Enrollment Stats
│
└─ PROFILE TAB
    └─ [LOGOUT]
```

### 4. ADMIN WORKFLOW
```
ADMIN DASHBOARD (/dashboard/admin)
├─ HOME (Overview)
│   ├─ Platform Stats
│   │   ├─ Total Users
│   │   ├─ Active Tests
│   │   ├─ Engagement Rate
│   │   └─ Platform Health
│   └─ Recent Activity Log
│
├─ USERS TAB
│   ├─ Search & Filter Users (by role, name, email)
│   ├─ Display: QGX ID, Name, Role, Email, Phone, XP (for students)
│   ├─ [CLICK USER]
│   │   ├─ View Full Profile
│   │   ├─ [EDIT]
│   │   │   ├─ Change Name, Email, Role
│   │   │   ├─ Update XP/Score/Ghost Wins (for students)
│   │   │   └─ Save changes
│   │   └─ [DELETE USER]
│   │       ├─ Remove from auth
│   │       └─ Delete profile + related data
│   │
│   └─ [BAN/UNBAN USER]
│       └─ Update user status
│
├─ ANNOUNCEMENTS TAB
│   ├─ [POST GLOBAL ANNOUNCEMENT]
│   │   ├─ Enter: Title, Body
│   │   ├─ Target: 'all' (reaches teachers & students)
│   │   └─ Notify all users
│   │
│   └─ View/Manage all announcements
│
├─ ACTIVITY LOG TAB
│   ├─ View all activity log entries
│   ├─ Filter by: Type, Date
│   └─ Actions tracked: user_registered, attempt, announcement, test_created, course, etc.
│
├─ DOUBLE XP EVENT
│   ├─ [ACTIVATE DOUBLE XP]
│   │   ├─ Set duration (minutes)
│   │   ├─ Calculate end time
│   │   ├─ Notify all students
│   │   └─ Start countdown timer
│   │
│   └─ [DEACTIVATE] (manual stop)
│
├─ FORUMS TAB
│   ├─ Moderate all posts
│   ├─ [PIN/UNPIN POST]
│   ├─ [DELETE POST if violates policy]
│   └─ [DELETE COMMENT]
│
└─ PROFILE TAB
    └─ [LOGOUT]
```

---

## 🔴 CRITICAL BREAKAGES & ISSUES

### 1. **Test Model Mismatch - Matching Questions NOT IMPLEMENTED**
**WHERE:** Student Dashboard, Teacher Dashboard (answer checking)  
**ISSUE:** Question type `'match'` is defined in types but logic not implemented
```typescript
// student/page.tsx handleSubmit()
if (q.type==='mcq' && ans===q.answer) score += q.marks || 1
else if (q.type==='tf' && ans===q.answer) score += q.marks || 1
else if (q.type==='fib' && typeof ans==='string' && ans.trim().toLowerCase()===(q.answer as string)?.toLowerCase()) score += q.marks || 1
else if (q.type==='msq') { /* ... */ }
// ❌ NO MATCH HANDLING
```
**FIX NEEDED:** Add matching logic to compare answer pairs

---

### 2. **No Validation for Tab-Switch Anti-Cheat Enforcement**
**WHERE:** student/page.tsx, startTest()  
**ISSUE:** Tab switch detection is registered but auto-submit may fail
```typescript
if (ac.tabSwitch) {
  const handler = () => { if (document.hidden) handleSubmit() }
  document.addEventListener('visibilitychange', handler)
}
// ❌ Handler NOT REMOVED on cleanup
// ❌ Hidden frame/dev tools can bypass this
// ❌ No logging of violations
```
**RISK:** Students can easily open dev tools without detection

---

### 3. **Double XP Status Infinite Loop Risk**
**WHERE:** student/page.tsx, admin/page.tsx  
**ISSUE:** Timer calculation race condition
```typescript
// admin/page.tsx
useEffect(() => {
  if (!doubleXP.active || !doubleXP.ends_at) return
  const iv = setInterval(() => {
    const rem = Math.max(0, doubleXP.ends_at - Date.now())
    if (rem === 0) { setDoubleXP({ active: false, ends_at: null }); ... }
  }, 1000)
  return () => clearInterval(iv)
}, [doubleXP])
```
**ISSUE:** If timer ends, component doesn't automatically re-fetch latest doubleXP status from DB. Students may see stale "2x active" after it expires.

---

### 4. **No Question Randomization Verification**
**WHERE:** student/page.tsx, startTest()  
**ISSUE:** Fisher-Yates shuffle is correct but no seed/verification
```typescript
if (ac.randomQ) qs = fisher_yates(qs)
if (ac.randomOpts) qs = qs.map(q => {
  if (q.type === 'mcq' && q.options) {
    const shuffled = fisher_yates(q.options.map((o: string, i: number) => ({ o, i })))
    const newOpts  = shuffled.map((x: any) => x.o)
    const newAns   = shuffled.findIndex((x: any) => x.i === q.answer)
    return { ...q, options: newOpts, answer: newAns }
  }
  return q
})
```
**ISSUE:** No logging of which shuffle variant student got. If dispute about answer, can't audit.

---

### 5. **Email Verification & Password Reset NOT IMPLEMENTED**
**WHERE:** Supabase auth integration  
**ISSUE:** Users can register with fake emails, no verification
```typescript
// register/page.tsx
const { data, error: signUpErr } = await supabase.auth.signUp({
  email: form.email,
  password: form.password,
  options: { data: { name: form.name, role: form.role } }
})
// ❌ No email confirmation required
// ❌ No password reset link flow
```
**SECURITY RISK:** Account takeover via fake email registration

---

### 6. **No Input Validation/Sanitization**
**WHERE:** All form inputs across all dashboards  
**ISSUE:** Direct state assignment without validation
```typescript
// Multiple places
const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
// No trimming, no length limits, no SQL injection checks
// Questions/answers can have unlimited length
```
**SECURITY RISK:** XSS attacks, DB bloat, slow queries

---

### 7. **Question Bank Modal doesn't Save on F5**
**WHERE:** teacher/page.tsx  
**ISSUE:** When adding questions, state is client-side only
```typescript
const [questionBank, setQuestionBank] = useState<Test | null>(null)
// Browser refresh loses questionBank context
// User has to re-open test manually
```
**UX ISSUE:** Teacher loses workflow state on accidental refresh

---

### 8. **Attempt Upsert Logic - Duplicate Score Recording**
**WHERE:** student/page.tsx, handleSubmit()  
**ISSUE:** If student retakes test multiple times
```typescript
await supabase.from('attempts').upsert({ student_id:profile.id, test_id:activeTest.id, score, total, percent, answer_map:answerMap })
```
**ISSUE:** Without explicit ID, upsert creates new record each time (if no unique ID). Multiple records for same student+test possible.
**BUG:** Leaderboard XP calculation broken if duplicate attempts exist

---

### 9. **No Anti-Cheat Data Logging**
**WHERE:** teacher/page.tsx - Student submission view  
**ISSUE:** Teachers can't see anti-cheat violations
```typescript
// No anti_cheat_log or violation tracking table
// Can't identify cheaters
// Tab switches, copy-paste events not logged
```
**MONITORING GAP:** Academic integrity not auditable

---

### 10. **Forum Likes Array Not Initialized**
**WHERE:** student/page.tsx, teacher/page.tsx Forums  
**ISSUE:** Trying to filter null/undefined likes
```typescript
const liked = (post.likes||[]).includes(profile.id)
const newLikes = liked ? post.likes.filter(...) : [...(post.likes||[]), profile.id]
```
**BUG:** If forum_posts.likes is NULL in DB, likes array doesn't exist. Can cause runtime error on map().

---

---

## 🟡 LOOPHOLES & VULNERABILITIES

### 1. **Role-Based Access Control (RBAC) NOT ENFORCED Server-Side**
**WHERE:** All API calls  
**ISSUE:** Only client-side checks exist
```typescript
if (!data.user) { router.push('/login'); return } // Client-side check
// No server-side verification that user matches role
// Malicious actor can spoof role in URL
```
**VULNERABILITY:** Any user can manually redirect to /dashboard/admin

**FIX NEEDED:**
- Implement Supabase RLS (Row-Level Security) policies
- Verify role matches session on every data fetch

---

### 2. **Supabase Anon Key Exposed in Frontend**
**WHERE:** lib/supabase.ts
```typescript
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```
**VULNERABILITY:** Anon key is public, so direct DB queries exposed
- Any user can query test answers if questions table has no RLS policy
- Can manually insert fake attempts/scores

**FIX NEEDED:**
- Configure Supabase Row-Level Security (RLS)
- Only allow INSERT attempts if user is authenticated student
- Only allow UPDATE profile if user owns it
- Question answers should not be readable to students before submission

---

### 3. **Scoring Calculation - Case Sensitivity & Whitespace**
**WHERE:** student/page.tsx handleSubmit()
```typescript
else if (q.type==='fib' && typeof ans==='string' && 
  ans.trim().toLowerCase()===(q.answer as string)?.toLowerCase())
```
**LOOPHOLE:** Trimming but not accounting for:
- Multiple spaces between words → "hello  world" vs "hello world"
- Accents/diacritics → "café" vs "cafe"
- Plurals → "cat" vs "cats"

**UX ISSUE:** Students lose points for minor formatting

---

### 4. **No Rate Limiting on Test Submissions**
**WHERE:** student/page.tsx handleSubmit()  
**ISSUE:** Can submit test immediately after previous attempt
```typescript
// No cooldown between attempts
// No check if maxAttempts reached
const ac = test.anti_cheat || {}
// ac.maxAttempts is set but NEVER CHECKED during submission
```
**LOOPHOLE:** Student can take test unlimited times even if maxAttempts=1

**FIX NEEDED:**
```typescript
const attemptCount = attempts.filter(a => a.test_id === test.id).length
if (attemptCount >= ac.maxAttempts) {
  setError('Max attempts reached')
  return
}
```

---

### 5. **No Time Zone Handling**
**WHERE:** All timestamps  
**ISSUE:** `new Date().toISOString()` is UTC, but students in different zones
```typescript
const result = { ..., date: new Date().toISOString().slice(0,10) }
// Server stores UTC, frontend doesn't convert to user TZ
```
**CONFUSION:** Test due dates, timetable times, announcements all in UTC

---

### 6. **Notifications Not Deleted After Read**
**WHERE:** Layout.tsx NotificationBell component  
**ISSUE:** No delete operation on notifications
```typescript
// Notifications accumulate forever
// No "Mark as Read" → "Archive" flow
// DB grows unbounded
```
**PERFORMANCE:** Over time, huge notification table slows queries

---

### 7. **Course Enrollment - No Capacity Limits**
**WHERE:** student/page.tsx (enrollment)  
**ISSUE:** Students can enroll unlimited courses
```typescript
// No course.max_students check
// No conflict detection (same time timetable slots)
```
**LOOPHOLE:** Can enroll in conflicting courses

---

### 8. **Assignment Submission - No File Type Check**
**WHERE:** teacher/page.tsx, createAssignment()  
**ISSUE:** Any file type accepted
```typescript
if (assignFile) {
  const ext = assignFile.name.split('.').pop()
  const path = `assignments/${profile.id}/${Date.now()}.${ext}`
  // No ext validation
}
```
**SECURITY:** .exe, .sh, malware files uploadable

---

### 9. **Ghost Score Logic - Self-Targeting**
**WHERE:** student/page.tsx handleSubmit()  
**ISSUE:** Ghost score includes current attempt
```typescript
const prev = attempts.find(a => a.test_id === test.id)
setGhostScore(prev ? prev.percent : null) // Set BEFORE submit
// But then: if (ghostScore !== null) { if (percent > ghostScore) ... }
// ghostScore === previous attempt, correct logic
// BUT: studentcanMIXENGINE to get bonus XP by retaking immediately
```
**LOOPHOLE:** If you score 50%, then 60%, ghost logic says "beat ghost" → +50 XP bonus
- Can grind same test 10 times, each defeating previous ghost → 500 XP inflation

---

### 10. **No Plagiarism Detection on Assignments**
**WHERE:** teacher/page.tsx - submission view  
**ISSUE:** Can't detect copied work
```typescript
// No checksum/similarity comparison
// Teachers manually check
```
**ACADEMIC RISK:** Mass plagiarism undetected

---

---

## 🚫 MISSING FUNCTIONS & LOGIC

### CRITICAL (Breaks Core Features)

#### 1. **Test Take - Answer Validation UI**
```typescript
// MISSING: Display which answers are correct/incorrect after submit
// MISSING: "Review Test" mode - show student their work + correct answers
// MISSING: Question randomization verification display
```

#### 2. **Attempt Model - Missing Fields**
```typescript
// Supabase Attempt table lacks:
// - time_spent (how long student took)
// - started_at (test start time)
// - ip_address (for fraud detection)
// - device_info (desktop/mobile/tablet)
// - violations (list of anti-cheat violations)
```

#### 3. **Max Attempts Enforcement**
```typescript
// MISSING: Check before allowing test start
async function canStartTest(studentId, testId, antiCheat) {
  const attempts = await supabase.from('attempts')
    .select('*')
    .eq('student_id', studentId)
    .eq('test_id', testId)
  if (attempts.data.length >= antiCheat.maxAttempts) return false
  return true
}
```

#### 4. **Test Status Workflow**
```typescript
// Test can be: 'draft' | 'scheduled' | 'in_progress' | 'closed' | 'archived'
// MISSING: Status transitions & validation
// MISSING: Auto-close test after scheduled_date + 24h
// MISSING: Show "Test Closed" message to late students
```

#### 5. **Answer Review & Explanation**
```typescript
// Question type missing:
interface Question {
  id: string
  explanation?: string // Why this answer is correct
  references?: string[] // Links to learning material
}
// MISSING: Display explanation after submit
```

#### 6. **Partial Credit for MSQ**
```typescript
// Current: MSQ all-or-nothing
// MISSING: Award partial credit:
// - 50% for getting half answers correct
// - Percentage based on correct selections
```

#### 7. **Performance Analytics**
```typescript
// MISSING on Teacher Dashboard:
// - Which questions have lowest avg_score (need reteaching)
// - Time-to-answer per question (identify hard questions)
// - Student confusion matrix (common wrong answers)
// - Learning curve (improvement over time)
```

---

### HIGH PRIORITY (Major Features)

#### 8. **Email Notifications**
```typescript
// MISSING: Func sendEmailNotification(userId, subject, html)
// MISSING: Import nodemailer/SendGrid
// MISSING: Email templates for:
// - Test scheduled
// - Assignment due reminder (24h before)
// - Grade released
// - Course announcement
```

#### 9. **Search & Filtering**
```typescript
// MISSING: Global search across:
// - Tests, Courses, Assignments, Forum posts
// - Autocomplete on student list (teacher admin)
// - Filter tests by: subject, date range, status
// - Sort assignments by due date

// Currently no search UI
```

#### 10. **Bulk Operations**
```typescript
// MISSING on Admin Dashboard:
// - Bulk delete users
// - Bulk change role
// - Bulk reset passwords
// - Bulk export data (for backups)
```

#### 11. **Attendance Tracking**
```typescript
// MISSING: Track who joined Jitsi live class
// MISSING: Auto-mark attendance based on join time
// MISSING: Generate attendance report for teacher

interface AttendanceRecord {
  id: string
  slot_id: string
  student_id: string
  joined_at: string
  left_at?: string
  duration_minutes: number
}
```

#### 12. **Recurring Classes**
```typescript
// Timetable slots are one-time only
// MISSING: Support weekly/bi-weekly recurring classes
// MISSING: "Monday at 09:00" every week

interface RecurringSlot {
  id: string
  subject: string
  day: string // 'monday' 
  time: string
  room: string
  recurrence: 'weekly' | 'bi-weekly' | 'monthly'
  repeat_until?: date
}
```

#### 13. **Notifications Center**
```typescript
// MISSING: Dedicated Notifications page
// MISSING: Filter by type (test, assignment, announcement)
// MISSING: Bulk delete
// MISSING: "Mark all as read"
// Currently just dropdown bell icon
```

---

### MEDIUM PRIORITY (Polish Features)

#### 14. **Test Blueprint / Question Distribution**
```typescript
// MISSING: Specify question distribution:
// - 50% from Chapter 1, 30% from Ch 2, 20% from Ch 3
// - Auto-select random questions per distribution

// Currently teacher adds all Qs manually
```

#### 15. **Negative Marking**
```typescript
interface Question {
  marks: number
  negative_mark?: number // -0.5 for wrong answer
}

const calculateScore = (q, ans) => {
  if (ans === q.answer) return q.marks
  if (ans !== null && q.negative_mark) return -q.negative_mark
  return 0 // No mark if not attempted
}
```

#### 16. **Student Notes/Bookmarks**
```typescript
// MISSING: Student can bookmark course materials
// MISSING: Student can create personal notes on course
// MISSING: Highlight text in PDFs

interface StudentNote {
  id: string
  student_id: string
  course_id: string
  content: string
  created_at: string
}
```

#### 17. **Real-Time Collaboration on Assignments**
```typescript
// Currently: Upload file, teacher grades
// MISSING: Collaborative docs (like Google Docs)
// MISSING: Teacher annotate student work in real-time
// MISSING: Version history
```

#### 18. **Peer Review System**
```typescript
// MISSING: Students review peer assignments
// MISSING: Anonymous peer grading
// MISSING: Merge peer + teacher scores

interface PeerReview {
  id: string
  submission_id: string
  reviewer_id: string // Another student
  score: number
  feedback: string
  reviewed_at: string
}
```

#### 19. **Discussion Forums - Threading**
```typescript
// Current: Linear comments
// MISSING: Nested replies (threaded discussions)
// MISSING: Voting system (upvote/downvote comments)
// MISSING: Reputation system (top contributors)
```

#### 20. **Custom Branding**
```typescript
// MISSING: Admin can upload custom logo
// MISSING: Custom color scheme
// MISSING: Custom welcome message
// Currently hardcoded "QGX" branding
```

---

### LOW PRIORITY (Enhancement)

#### 21. **Gamification Enhancements**
```typescript
// Current: XP + Tiers only
// MISSING:
// - Badges (e.g., "Speed Demon" for 60+ in 5 min)
// - Streaks (consecutive daily logins)
// - Achievements (First 100 XP, Win 10 ghosts, etc.)
// - Leaderboard seasons (reset monthly)

interface Badge {
  id: string
  name: string
  description: string
  icon_url: string
  condition: Function // Logic to earn
}
```

#### 22. **Accessibility (A11y)**
```typescript
// MISSING:
// - ARIA labels
// - Keyboard navigation
// - Screen reader support
// - High contrast mode toggle
// - Dyslexia-friendly font option
```

#### 23. **Mobile App / PWA**
```typescript
// MISSING: Service worker for offline support
// MISSING: App manifest for install-to-home-screen
// MISSING: Native mobile app (React Native)
```

#### 24. **Translation / i18n**
```typescript
// MISSING: Support for multiple languages
// Currently English only
// MISSING: Right-to-left (RTL) text support (Arabic, Hindi, etc.)
```

#### 25. **API Documentation**
```typescript
// MISSING: OpenAPI/Swagger docs
// MISSING: Third-party integration endpoints
// MISSING: Webhook support
```

---

---

## 🛠️ LOGIC GAPS & INCONSISTENCIES

### 1. **Profile Update Flow Broken**
```typescript
// student/page.tsx
const [profile, setProfile] = useState<Profile | null>(null)
// Can be edited, but no "Save" button in profile modal
// Changes not persisted

// FIX: Add update endpoint
async function updateProfile(updates: Partial<Profile>) {
  await supabase.from('profiles').update(updates).eq('id', profile.id)
  setProfile({...profile, ...updates})
}
```

### 2. **Circular Dependency in Ghost Score**
```typescript
// If multiple students retake test:
// Student A: 60% (vs prev 50%) → +50 ghost XP
// Student B: 55% (vs prev 40%) → +50 ghost XP
// Both beat their ghost, both get bonus, but they're not competing
// Ghost score should be against BEST attempt, not just previous

const myBestScore = Math.max(...myAttempts.map(a => a.percent), 0)
if (percent > myBestScore) { /* ghost bonus */ }
```

### 3. **Double XP Not Applied to Ghost Bonus**
```typescript
// handleSubmit()
let xpEarned = isDoubleXP ? baseXP * 2 : baseXP
if (ghostBonus > 0) xpEarned += 50 // ❌ Not doubled

// SHOULD BE:
if (ghostBonus > 0) 
  xpEarned += isDoubleXP ? 100 : 50
```

### 4. **Course Enrollment Duplicate Check Missing**
```typescript
// student enrolls in course A
// Refreshes page
// Accidentally clicks enroll again
// No duplicate check in DB unique constraint

// FIX:
const alreadyEnrolled = enrolledIds.includes(courseId)
if (alreadyEnrolled) { setError('Already enrolled'); return }
```

### 5. **Timetable - No Conflict Detection**
```typescript
// Teacher can create overlapping slots:
// Monday 09:00-10:00 Math
// Monday 09:30-10:30 Science (overlaps!)
// Students get confused

// FIX: Validate no overlapping time ranges
```

### 6. **Forum Post Delete - Cascade Missing**
```typescript
// When forum post deleted:
await supabase.from('forum_posts').delete().eq('id', postId)
// ❌ forum_comments NOT deleted (orphaned)
// ❌ forum_likes NOT cleared (if table exists)

// FIX: Delete cascade in Supabase or delete explicitly:
await supabase.from('forum_comments').delete().eq('post_id', postId)
```

### 7. **Announcements Target Not Enforced**
```typescript
// Teacher posts announcement with target='students'
// Admin creates announcement with target='all'
// ❌ No validation that teachers can't select 'all'
// ❌ No validation that admin can only select 'all'

// Student posts announcement? Should be blocked entirely
```

### 8. **Assignment Due Date - Not Enforced**
```typescript
// Assignment due: 2024-03-30
// Student submits: 2024-04-05
// No late penalty applied
// No "Late" status shown to teacher

// FIX: Track submitted_at vs due_date
// Mark as "Late", apply penalty
```

### 9. **Test Scheduled Date - Not Enforced**
```typescript
// Test scheduled_date: 2024-03-31 (past date)
// Test still appears as available for student
// No "Test Closed" state

// FIX: Compute test.status based on dates
```

### 10. **Notification Duplication**
```typescript
// If student enrolls in course:
// notif 1: "New course: Math"
// 
// If another student enrolls:
// notif 2: "New course: Math" (again)
// 
// Same notification sent multiple times

// FIX: Cache by course_id, only notify on creation
```

---

---

## 📋 SUMMARY TABLE

| Category | Count | Examples |
|----------|-------|----------|
| **Critical Breakages** | 10 | Matching Q unanswered, Tab cheat bypass, Double XP stale, etc. |
| **Security Loopholes** | 10 | No RLS, Anon key exposed, No rate limit, File upload unfiltered |
| **Missing Core Functions** | 25+ | Email notif, Search, Analytics, Attendance, Notes, etc. |
| **Logic Gaps** | 10 | Profile update broken, Ghost score circular, Cascade delete missing |
| **Total Issues** | **55+** | Estimate **6-8 weeks to fix all** |

---

## 🎯 PRIORITY ROADMAP

### PHASE 1 (WEEK 1-2) - SECURITY & STABILITY
- [ ] Implement Supabase RLS policies
- [ ] Add input validation & sanitization
- [ ] Fix matching question scoring
- [ ] Fix max attempts enforcement
- [ ] Remove exposed anon key vulnerabilities

### PHASE 2 (WEEK 3-4) - CORE FEATURES
- [ ] Add email verification & password reset
- [ ] Implement test review/explanation display
- [ ] Fix ghost score logic
- [ ] Add anti-cheat violation logging
- [ ] Implement search & filtering

### PHASE 3 (WEEK 5-6) - POLISH & ANALYTICS
- [ ] Add performance analytics
- [ ] Implement notifications center
- [ ] Add attendance tracking
- [ ] Implement bulk operations (admin)
- [ ] Add test status workflow

### PHASE 4 (WEEK 7+) - ENHANCEMENTS
- [ ] Gamification features
- [ ] Accessibility (A11y)
- [ ] Mobile PWA support
- [ ] Multilingual support
- [ ] API documentation

