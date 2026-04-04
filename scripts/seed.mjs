/**
 * QGX Seed Data Script
 * 
 * Usage:
 *   1. Set env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   2. Run: node scripts/seed.mjs
 * 
 * This creates realistic demo data: users, courses, tests, questions,
 * attempts, attendance, announcements, timetable, and forum posts.
 * 
 * WARNING: This script is meant for fresh/dev databases.
 * It will skip creating users that already exist.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ─── Helpers ───
const uuid = () => crypto.randomUUID()
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

// ─── Fixed IDs for referential integrity ───
const IDS = {
  admin:    uuid(),
  teacher1: uuid(),
  teacher2: uuid(),
  student1: uuid(),
  student2: uuid(),
  student3: uuid(),
  student4: uuid(),
  student5: uuid(),
  parent1:  uuid(),
  parent2:  uuid(),
  course1:  uuid(),
  course2:  uuid(),
  course3:  uuid(),
}

const TEST_IDS = ['TEST-MATH-001', 'TEST-PHY-002', 'TEST-CS-003', 'QUIZ-MATH-004']

// ─── Users to create ───
const USERS = [
  { id: IDS.admin,    email: 'admin@qgx.demo',     password: 'QGX@admin2024',   name: 'Dr. Sarah Mitchell',  role: 'admin',   avatar: 'SM', subject: null,              bio: 'Platform administrator and academic coordinator.' },
  { id: IDS.teacher1, email: 'teacher1@qgx.demo',   password: 'QGX@teacher2024', name: 'Prof. James Carter',  role: 'teacher', avatar: 'JC', subject: 'Mathematics',     bio: 'Teaching mathematics for 12 years. Specializes in calculus and linear algebra.' },
  { id: IDS.teacher2, email: 'teacher2@qgx.demo',   password: 'QGX@teacher2024', name: 'Ms. Priya Sharma',    role: 'teacher', avatar: 'PS', subject: 'Computer Science', bio: 'Full-stack developer turned educator. Passionate about teaching programming.' },
  { id: IDS.student1, email: 'student1@qgx.demo',   password: 'QGX@student2024', name: 'Alex Johnson',        role: 'student', avatar: 'AJ', grade: '10',               bio: 'Aspiring software engineer. Loves coding challenges.' },
  { id: IDS.student2, email: 'student2@qgx.demo',   password: 'QGX@student2024', name: 'Maya Patel',          role: 'student', avatar: 'MP', grade: '10',               bio: 'Math enthusiast and debate team captain.' },
  { id: IDS.student3, email: 'student3@qgx.demo',   password: 'QGX@student2024', name: 'Ryan Kim',            role: 'student', avatar: 'RK', grade: '11',               bio: 'Physics lover. Building a rocket for the science fair.' },
  { id: IDS.student4, email: 'student4@qgx.demo',   password: 'QGX@student2024', name: 'Zara Ahmed',          role: 'student', avatar: 'ZA', grade: '10',               bio: 'Creative writer who also loves algorithms.' },
  { id: IDS.student5, email: 'student5@qgx.demo',   password: 'QGX@student2024', name: 'Liam O\'Brien',       role: 'student', avatar: 'LO', grade: '11',               bio: 'Competitive programmer. Ranked in national olympiads.' },
  { id: IDS.parent1,  email: 'parent1@qgx.demo',    password: 'QGX@parent2024',  name: 'David Johnson',       role: 'parent',  avatar: 'DJ', bio: 'Parent of Alex Johnson.' },
  { id: IDS.parent2,  email: 'parent2@qgx.demo',    password: 'QGX@parent2024',  name: 'Anita Patel',         role: 'parent',  avatar: 'AP', bio: 'Parent of Maya Patel.' },
]

const STUDENTS = [IDS.student1, IDS.student2, IDS.student3, IDS.student4, IDS.student5]
const STUDENT_NAMES = ['Alex Johnson', 'Maya Patel', 'Ryan Kim', 'Zara Ahmed', "Liam O'Brien"]

// ─── Step 1: Create auth users ───
async function createUsers() {
  console.log('Creating users...')
  for (const u of USERS) {
    const { error } = await supabase.auth.admin.createUser({
      id: u.id,
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { name: u.name, role: u.role },
    })
    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        console.log(`  ⏭ ${u.email} (already exists)`)
      } else {
        console.error(`  ✗ ${u.email}: ${error.message}`)
      }
    } else {
      console.log(`  ✓ ${u.email} (${u.role})`)
    }
  }
}

// ─── Step 2: Update profiles with full data ───
async function updateProfiles() {
  console.log('Updating profiles...')
  for (const u of USERS) {
    const update = { name: u.name, avatar: u.avatar, bio: u.bio }
    if (u.subject) update.subject = u.subject
    if (u.grade) update.grade = u.grade
    if (u.role === 'student') {
      update.xp = rand(200, 4000)
      update.score = rand(40, 98)
      update.ghost_wins = rand(0, 15)
      update.reputation = rand(5, 120)
    }
    const { error } = await supabase.from('profiles').update(update).eq('id', u.id)
    if (error) console.error(`  ✗ Profile ${u.name}: ${error.message}`)
    else console.log(`  ✓ ${u.name}`)
  }
  // Generate QGX IDs
  for (const u of USERS) {
    const { data } = await supabase.rpc('generate_qgx_id', { p_role: u.role })
    if (data) {
      await supabase.from('profiles').update({ qgx_id: data }).eq('id', u.id)
    }
  }
}

// ─── Step 3: Courses ───
async function createCourses() {
  console.log('Creating courses...')
  const courses = [
    { id: IDS.course1, title: 'Calculus I — Limits & Derivatives', subject: 'Mathematics', teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter', description: 'An introductory course covering limits, continuity, derivatives, and their applications. Includes weekly problem sets and quizzes.', status: 'published' },
    { id: IDS.course2, title: 'Introduction to Python Programming', subject: 'Computer Science', teacher_id: IDS.teacher2, teacher_name: 'Ms. Priya Sharma', description: 'Learn Python from scratch — variables, loops, functions, OOP, file handling, and build a final project.', status: 'published' },
    { id: IDS.course3, title: 'Data Structures & Algorithms', subject: 'Computer Science', teacher_id: IDS.teacher2, teacher_name: 'Ms. Priya Sharma', description: 'Arrays, linked lists, trees, graphs, sorting, searching, and algorithm complexity analysis.', status: 'published' },
  ]
  const { error } = await supabase.from('courses').insert(courses)
  if (error) console.error(`  ✗ Courses: ${error.message}`)
  else console.log(`  ✓ ${courses.length} courses`)

  // Enroll all students in all courses
  const enrollments = []
  for (const cid of [IDS.course1, IDS.course2, IDS.course3]) {
    for (const sid of STUDENTS) {
      enrollments.push({ student_id: sid, course_id: cid })
    }
  }
  const { error: e2 } = await supabase.from('enrollments').insert(enrollments)
  if (e2) console.error(`  ✗ Enrollments: ${e2.message}`)
  else console.log(`  ✓ ${enrollments.length} enrollments`)
}

// ─── Step 4: Tests & Questions ───
async function createTests() {
  console.log('Creating tests...')
  const today = new Date()
  const futureDate = (days) => new Date(today.getTime() + days * 86400000).toISOString().split('T')[0]
  const pastDate = (days) => new Date(today.getTime() - days * 86400000).toISOString().split('T')[0]

  const tests = [
    {
      id: TEST_IDS[0], title: 'Limits & Continuity', subject: 'Mathematics',
      teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter',
      scheduled_date: pastDate(5), scheduled_time: '10:00', duration: 45,
      status: 'active', total_marks: 20, type: 'test', xp_reward: 200,
      anti_cheat: { tabSwitch: true, copyPaste: true, randomQ: true, randomOpts: false, fullscreen: true, timePerQ: 0, maxAttempts: 2 },
    },
    {
      id: TEST_IDS[1], title: 'Newton\'s Laws of Motion', subject: 'Physics',
      teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter',
      scheduled_date: futureDate(3), scheduled_time: '14:00', duration: 60,
      status: 'scheduled', total_marks: 25, type: 'test', xp_reward: 250,
      anti_cheat: { tabSwitch: true, copyPaste: false, randomQ: false, randomOpts: true, fullscreen: false, timePerQ: 120, maxAttempts: 1 },
    },
    {
      id: TEST_IDS[2], title: 'Python Basics Quiz', subject: 'Computer Science',
      teacher_id: IDS.teacher2, teacher_name: 'Ms. Priya Sharma',
      scheduled_date: pastDate(2), scheduled_time: '09:00', duration: 30,
      status: 'active', total_marks: 15, type: 'quiz', xp_reward: 150,
      anti_cheat: { tabSwitch: false, copyPaste: false, randomQ: true, randomOpts: true, fullscreen: false, timePerQ: 0, maxAttempts: 3 },
    },
    {
      id: TEST_IDS[3], title: 'Quick Algebra Check', subject: 'Mathematics',
      teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter',
      scheduled_date: pastDate(10), scheduled_time: '11:00', duration: 15,
      status: 'active', total_marks: 10, type: 'quiz', xp_reward: 100,
      anti_cheat: { tabSwitch: false, copyPaste: false, randomQ: false, randomOpts: false, fullscreen: false, timePerQ: 0, maxAttempts: 2 },
    },
  ]
  const { error } = await supabase.from('tests').insert(tests)
  if (error) console.error(`  ✗ Tests: ${error.message}`)
  else console.log(`  ✓ ${tests.length} tests`)

  // Questions
  const questions = [
    // TEST-MATH-001: Limits & Continuity
    { test_id: TEST_IDS[0], type: 'mcq', text: 'What is the limit of (sin x)/x as x approaches 0?', options: ['0', '1', '∞', 'undefined'], answer: '1', marks: 4, order_index: 0 },
    { test_id: TEST_IDS[0], type: 'tf', text: 'A continuous function is always differentiable.', options: null, answer: false, marks: 4, order_index: 1 },
    { test_id: TEST_IDS[0], type: 'fib', text: 'The derivative of e^x is ___', options: null, answer: 'e^x', marks: 4, order_index: 2 },
    { test_id: TEST_IDS[0], type: 'mcq', text: 'Which of the following is NOT a type of discontinuity?', options: ['Removable', 'Jump', 'Infinite', 'Linear'], answer: 'Linear', marks: 4, order_index: 3 },
    { test_id: TEST_IDS[0], type: 'msq', text: 'Select all rules used in differentiation:', options: ['Chain Rule', 'Slide Rule', 'Product Rule', 'Quotient Rule'], answer: ['Chain Rule', 'Product Rule', 'Quotient Rule'], marks: 4, order_index: 4 },

    // TEST-PHY-002: Newton's Laws
    { test_id: TEST_IDS[1], type: 'mcq', text: 'What is the SI unit of force?', options: ['Joule', 'Newton', 'Watt', 'Pascal'], answer: 'Newton', marks: 5, order_index: 0 },
    { test_id: TEST_IDS[1], type: 'tf', text: 'Newton\'s third law states that every action has an equal and opposite reaction.', options: null, answer: true, marks: 5, order_index: 1 },
    { test_id: TEST_IDS[1], type: 'fib', text: 'Force equals mass times ___', options: null, answer: 'acceleration', marks: 5, order_index: 2 },
    { test_id: TEST_IDS[1], type: 'match', text: 'Match the law to its description:', options: { left: ['First Law', 'Second Law', 'Third Law'], right: ['Inertia', 'F=ma', 'Action-Reaction'] }, answer: { 'First Law': 'Inertia', 'Second Law': 'F=ma', 'Third Law': 'Action-Reaction' }, marks: 5, order_index: 3 },
    { test_id: TEST_IDS[1], type: 'mcq', text: 'An object at rest stays at rest unless acted upon by a(n):', options: ['External force', 'Internal force', 'Gravity only', 'Friction only'], answer: 'External force', marks: 5, order_index: 4 },

    // TEST-CS-003: Python Basics
    { test_id: TEST_IDS[2], type: 'mcq', text: 'What keyword is used to define a function in Python?', options: ['function', 'func', 'def', 'define'], answer: 'def', marks: 3, order_index: 0 },
    { test_id: TEST_IDS[2], type: 'tf', text: 'Python uses curly braces {} for code blocks.', options: null, answer: false, marks: 3, order_index: 1 },
    { test_id: TEST_IDS[2], type: 'fib', text: 'To print "Hello" in Python, write: ___("Hello")', options: null, answer: 'print', marks: 3, order_index: 2 },
    { test_id: TEST_IDS[2], type: 'mcq', text: 'Which data type is mutable in Python?', options: ['tuple', 'string', 'list', 'int'], answer: 'list', marks: 3, order_index: 3 },
    { test_id: TEST_IDS[2], type: 'msq', text: 'Select valid Python data types:', options: ['int', 'float', 'char', 'dict', 'array'], answer: ['int', 'float', 'dict'], marks: 3, order_index: 4 },

    // QUIZ-MATH-004: Quick Algebra
    { test_id: TEST_IDS[3], type: 'mcq', text: 'Solve: 2x + 6 = 14. What is x?', options: ['2', '4', '6', '8'], answer: '4', marks: 2, order_index: 0 },
    { test_id: TEST_IDS[3], type: 'tf', text: 'The square root of 144 is 14.', options: null, answer: false, marks: 2, order_index: 1 },
    { test_id: TEST_IDS[3], type: 'fib', text: '5! (5 factorial) = ___', options: null, answer: '120', marks: 2, order_index: 2 },
    { test_id: TEST_IDS[3], type: 'mcq', text: 'What is the slope of y = 3x + 7?', options: ['7', '3', '3x', '10'], answer: '3', marks: 2, order_index: 3 },
    { test_id: TEST_IDS[3], type: 'mcq', text: 'Simplify: (x²)(x³)', options: ['x⁵', 'x⁶', '2x⁵', 'x⁸'], answer: 'x⁵', marks: 2, order_index: 4 },
  ]
  const { error: e2 } = await supabase.from('questions').insert(questions)
  if (e2) console.error(`  ✗ Questions: ${e2.message}`)
  else console.log(`  ✓ ${questions.length} questions`)
}

// ─── Step 5: Attempts (for completed tests) ───
async function createAttempts() {
  console.log('Creating attempts...')
  const attempts = []
  // All students attempted TEST-MATH-001 and TEST-CS-003 and QUIZ-MATH-004
  for (const [i, sid] of STUDENTS.entries()) {
    const score1 = rand(10, 20), pct1 = Math.round((score1 / 20) * 100)
    attempts.push({
      student_id: sid, test_id: TEST_IDS[0],
      score: score1, total: 20, percent: pct1,
      answer_map: {}, xp_earned: rand(80, 200), attempt_number: 1,
      submitted_at: new Date(Date.now() - 5 * 86400000 + i * 3600000).toISOString(),
    })

    const score2 = rand(7, 15), pct2 = Math.round((score2 / 15) * 100)
    attempts.push({
      student_id: sid, test_id: TEST_IDS[2],
      score: score2, total: 15, percent: pct2,
      answer_map: {}, xp_earned: rand(50, 150), attempt_number: 1,
      submitted_at: new Date(Date.now() - 2 * 86400000 + i * 3600000).toISOString(),
    })

    const score3 = rand(4, 10), pct3 = Math.round((score3 / 10) * 100)
    attempts.push({
      student_id: sid, test_id: TEST_IDS[3],
      score: score3, total: 10, percent: pct3,
      answer_map: {}, xp_earned: rand(30, 100), attempt_number: 1,
      submitted_at: new Date(Date.now() - 10 * 86400000 + i * 3600000).toISOString(),
    })
  }
  const { error } = await supabase.from('attempts').insert(attempts)
  if (error) console.error(`  ✗ Attempts: ${error.message}`)
  else console.log(`  ✓ ${attempts.length} attempts`)
}

// ─── Step 6: Announcements ───
async function createAnnouncements() {
  console.log('Creating announcements...')
  const announcements = [
    { title: 'Welcome to QGX!', body: 'Welcome to the Query Gen X Learning Management System. Explore your dashboard, take tests, earn XP, and climb the leaderboard!', author_id: IDS.admin, author_name: 'Dr. Sarah Mitchell', role: 'admin', target: 'all', pinned: true },
    { title: 'Calculus I — Midterm Scheduled', body: 'The midterm exam for Calculus I is scheduled for next week. Review chapters 1-4 and complete all practice sets.', author_id: IDS.teacher1, author_name: 'Prof. James Carter', role: 'teacher', target: 'students', pinned: false },
    { title: 'Python Project Deadline Extended', body: 'Due to popular request, the final Python project deadline has been extended by one week. Submit by the new date shown on the assignments page.', author_id: IDS.teacher2, author_name: 'Ms. Priya Sharma', role: 'teacher', target: 'students', pinned: false },
    { title: 'Staff Meeting — Friday 3 PM', body: 'All teachers please join the staff meeting this Friday at 3 PM in the conference room. Agenda: curriculum review and grading standards.', author_id: IDS.admin, author_name: 'Dr. Sarah Mitchell', role: 'admin', target: 'teachers', pinned: false },
    { title: 'Double XP Weekend!', body: 'This weekend is Double XP! All test attempts and check-ins earn 2x XP. Don\'t miss out!', author_id: IDS.admin, author_name: 'Dr. Sarah Mitchell', role: 'admin', target: 'all', pinned: true },
  ]
  const { error } = await supabase.from('announcements').insert(announcements)
  if (error) console.error(`  ✗ Announcements: ${error.message}`)
  else console.log(`  ✓ ${announcements.length} announcements`)
}

// ─── Step 7: Timetable ───
async function createTimetable() {
  console.log('Creating timetable...')
  const entries = [
    { subject: 'Mathematics', teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter', day: 'Monday',    time: '09:00', room: 'Room 101' },
    { subject: 'Mathematics', teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter', day: 'Wednesday', time: '09:00', room: 'Room 101' },
    { subject: 'Mathematics', teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter', day: 'Friday',    time: '09:00', room: 'Room 101' },
    { subject: 'Computer Science', teacher_id: IDS.teacher2, teacher_name: 'Ms. Priya Sharma', day: 'Monday',    time: '11:00', room: 'Lab 201' },
    { subject: 'Computer Science', teacher_id: IDS.teacher2, teacher_name: 'Ms. Priya Sharma', day: 'Tuesday',   time: '14:00', room: 'Lab 201' },
    { subject: 'Computer Science', teacher_id: IDS.teacher2, teacher_name: 'Ms. Priya Sharma', day: 'Thursday',  time: '11:00', room: 'Lab 201' },
    { subject: 'Physics',          teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter', day: 'Tuesday',   time: '10:00', room: 'Room 103' },
    { subject: 'Physics',          teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter', day: 'Thursday',  time: '10:00', room: 'Room 103' },
  ]
  const { error } = await supabase.from('timetable').insert(entries)
  if (error) console.error(`  ✗ Timetable: ${error.message}`)
  else console.log(`  ✓ ${entries.length} timetable slots`)
}

// ─── Step 8: Assignments ───
async function createAssignments() {
  console.log('Creating assignments...')
  const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString().split('T')[0]
  const pastDate = (days) => new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

  const assignments = [
    { title: 'Limits Practice Set', description: 'Complete problems 1-20 from Chapter 2. Show all working.', course_id: IDS.course1, teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter', due_date: futureDate(7), priority: 'high', max_points: 100, status: 'active' },
    { title: 'Derivatives Worksheet', description: 'Solve the derivative worksheet attached. Focus on chain rule applications.', course_id: IDS.course1, teacher_id: IDS.teacher1, teacher_name: 'Prof. James Carter', due_date: futureDate(14), priority: 'medium', max_points: 50, status: 'active' },
    { title: 'Python Calculator Project', description: 'Build a CLI calculator in Python that supports +, -, *, /, and power operations. Include error handling.', course_id: IDS.course2, teacher_id: IDS.teacher2, teacher_name: 'Ms. Priya Sharma', due_date: futureDate(10), priority: 'high', max_points: 100, status: 'active' },
    { title: 'Sorting Algorithm Comparison', description: 'Implement Bubble Sort, Merge Sort, and Quick Sort. Compare their performance on arrays of 1000, 10000, and 100000 elements.', course_id: IDS.course3, teacher_id: IDS.teacher2, teacher_name: 'Ms. Priya Sharma', due_date: pastDate(2), priority: 'critical', max_points: 150, status: 'active' },
  ]
  const { error } = await supabase.from('assignments').insert(assignments)
  if (error) console.error(`  ✗ Assignments: ${error.message}`)
  else console.log(`  ✓ ${assignments.length} assignments`)
}

// ─── Step 9: Attendance ───
async function createAttendance() {
  console.log('Creating attendance...')
  const records = []
  const statuses = ['present', 'present', 'present', 'present', 'late', 'absent'] // weighted toward present
  for (let d = 14; d >= 1; d--) {
    const date = new Date(Date.now() - d * 86400000)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue // skip weekends
    const dateStr = date.toISOString().split('T')[0]
    for (const [i, sid] of STUDENTS.entries()) {
      records.push({
        student_id: sid,
        student_name: STUDENT_NAMES[i],
        teacher_id: IDS.teacher1,
        subject: 'Mathematics',
        date: dateStr,
        status: pick(statuses),
      })
      records.push({
        student_id: sid,
        student_name: STUDENT_NAMES[i],
        teacher_id: IDS.teacher2,
        subject: 'Computer Science',
        date: dateStr,
        status: pick(statuses),
      })
    }
  }
  const { error } = await supabase.from('attendance').insert(records)
  if (error) console.error(`  ✗ Attendance: ${error.message}`)
  else console.log(`  ✓ ${records.length} attendance records`)
}

// ─── Step 10: Forum Posts ───
async function createForumPosts() {
  console.log('Creating forum posts...')
  const posts = [
    { title: 'How to solve limit problems with L\'Hôpital\'s Rule?', body: 'I keep getting confused about when to apply L\'Hôpital\'s Rule vs. algebraic manipulation. Can someone explain the conditions?\n\nSpecifically, I\'m stuck on:\n`lim (x→0) (e^x - 1) / x`\n\nThanks!', author_id: IDS.student1, author_name: 'Alex Johnson', author_role: 'student', flair: 'question', tags: ['math', 'calculus', 'limits'], comment_count: 2, view_count: 45 },
    { title: 'Python vs JavaScript — Which to learn first?', body: 'Starting my programming journey. My teacher recommends Python but my friends say JavaScript is more useful. What do you think?\n\nI want to eventually build web apps and maybe do some data science.', author_id: IDS.student4, author_name: 'Zara Ahmed', author_role: 'student', flair: 'discussion', tags: ['programming', 'python', 'career'], comment_count: 3, view_count: 128 },
    { title: 'Midterm Study Resources — Calculus I', body: '📚 Sharing my study notes and practice problems for the upcoming midterm.\n\nKey topics:\n- Limits and continuity\n- Derivative rules (product, quotient, chain)\n- Applications of derivatives\n\nGood luck everyone!', author_id: IDS.student2, author_name: 'Maya Patel', author_role: 'student', flair: 'resource', tags: ['math', 'study-guide', 'midterm'], comment_count: 1, view_count: 89, pinned: true },
    { title: 'Announcement: Coding Competition Next Month', body: 'We\'re organizing an inter-school coding competition! Teams of 2-3 students.\n\n**Date:** Next month, exact date TBD\n**Format:** 3-hour problem-solving contest\n**Languages:** Python, Java, C++\n\nRegister with me if interested.', author_id: IDS.teacher2, author_name: 'Ms. Priya Sharma', author_role: 'teacher', flair: 'announcement', tags: ['competition', 'coding', 'event'], comment_count: 0, view_count: 67 },
    { title: 'My first sorting algorithm visualization!', body: 'Just built a Bubble Sort visualizer using Python + Pygame. It was so cool seeing the bars swap in real time!\n\nNext up: Merge Sort visualization. Will share the code once it\'s clean.', author_id: IDS.student5, author_name: "Liam O'Brien", author_role: 'student', flair: 'showcase', tags: ['python', 'algorithms', 'project'], comment_count: 1, view_count: 34 },
  ]
  const { error } = await supabase.from('forum_posts').insert(posts)
  if (error) console.error(`  ✗ Forum posts: ${error.message}`)
  else console.log(`  ✓ ${posts.length} forum posts`)
}

// ─── Step 11: Activity Log ───
async function createActivityLog() {
  console.log('Creating activity log...')
  const logs = [
    { message: 'Admin Dr. Sarah Mitchell logged in', type: 'auth' },
    { message: 'Prof. James Carter created test "Limits & Continuity"', type: 'test' },
    { message: 'Ms. Priya Sharma created course "Introduction to Python Programming"', type: 'course' },
    { message: 'Alex Johnson submitted test "Limits & Continuity" — scored 85%', type: 'test' },
    { message: 'Maya Patel enrolled in "Data Structures & Algorithms"', type: 'enrollment' },
    { message: 'Ryan Kim earned 200 XP — leveled up to SCHOLAR', type: 'xp' },
    { message: 'Prof. James Carter posted announcement "Calculus I — Midterm Scheduled"', type: 'announcement' },
    { message: 'Zara Ahmed submitted assignment "Python Calculator Project"', type: 'assignment' },
    { message: "Liam O'Brien reached 3500 XP — LEGEND rank achieved!", type: 'xp' },
    { message: 'Admin enabled Double XP Weekend', type: 'setting' },
  ]
  const { error } = await supabase.from('activity_log').insert(logs)
  if (error) console.error(`  ✗ Activity log: ${error.message}`)
  else console.log(`  ✓ ${logs.length} activity entries`)
}

// ─── Step 12: Parent-Student Links ───
async function createParentLinks() {
  console.log('Linking parents to students...')
  const links = [
    { parent_id: IDS.parent1, student_id: IDS.student1 },
    { parent_id: IDS.parent2, student_id: IDS.student2 },
  ]
  const { error } = await supabase.from('parent_students').insert(links)
  if (error) console.error(`  ✗ Parent links: ${error.message}`)
  else console.log(`  ✓ ${links.length} parent-student links`)
}

// ─── Run All ───
async function main() {
  console.log('═══════════════════════════════════════')
  console.log(' QGX Seed Data')
  console.log('═══════════════════════════════════════\n')

  await createUsers()
  await updateProfiles()
  await createCourses()
  await createTests()
  await createAttempts()
  await createAnnouncements()
  await createTimetable()
  await createAssignments()
  await createAttendance()
  await createForumPosts()
  await createActivityLog()
  await createParentLinks()

  console.log('\n═══════════════════════════════════════')
  console.log(' Seed complete!')
  console.log('═══════════════════════════════════════')
  console.log('\n Demo Accounts:')
  console.log(' ┌──────────────────────────────┬──────────────────┐')
  console.log(' │ Email                        │ Password         │')
  console.log(' ├──────────────────────────────┼──────────────────┤')
  console.log(' │ admin@qgx.demo               │ QGX@admin2024    │')
  console.log(' │ teacher1@qgx.demo             │ QGX@teacher2024  │')
  console.log(' │ teacher2@qgx.demo             │ QGX@teacher2024  │')
  console.log(' │ student1@qgx.demo             │ QGX@student2024  │')
  console.log(' │ student2@qgx.demo             │ QGX@student2024  │')
  console.log(' │ student3-5@qgx.demo           │ QGX@student2024  │')
  console.log(' │ parent1@qgx.demo              │ QGX@parent2024   │')
  console.log(' │ parent2@qgx.demo              │ QGX@parent2024   │')
  console.log(' └──────────────────────────────┴──────────────────┘')
}

main().catch(console.error)
