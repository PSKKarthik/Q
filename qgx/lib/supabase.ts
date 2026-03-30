import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'teacher' | 'student'

export interface Profile {
  id: string
  name: string
  email: string
  role: Role
  avatar: string
  phone?: string
  bio?: string
  subject?: string
  grade?: string
  qgx_id: string
  xp: number
  score: number
  ghost_wins: number
  joined: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  author_id: string
  author_name: string
  role: string
  target: 'all' | 'teachers' | 'students'
  pinned: boolean
  created_at: string
}

export interface Test {
  id: string
  title: string
  subject: string
  teacher_id: string
  teacher_name: string
  scheduled_date?: string
  scheduled_time?: string
  duration: number
  status: string
  total_marks: number
  type: 'test' | 'quiz'
  anti_cheat: AntiCheat
  created_at: string
  questions?: Question[]
}

export interface AntiCheat {
  tabSwitch: boolean
  copyPaste: boolean
  randomQ: boolean
  randomOpts: boolean
  fullscreen: boolean
  timePerQ: number
  maxAttempts: number
}

export interface Question {
  id: string
  test_id: string
  type: 'mcq' | 'msq' | 'tf' | 'fib' | 'match'
  text: string
  options?: string[]
  answer: any
  marks: number
  order_index: number
}

export interface Attempt {
  id: string
  student_id: string
  test_id: string
  score: number
  total: number
  percent: number
  answer_map: Record<string, any>
  submitted_at: string
}

export interface Course {
  id: string
  title: string
  subject: string
  teacher_id: string
  teacher_name: string
  description: string
  created_at: string
  files?: CourseFile[]
  enrolled?: string[]
}

export interface CourseFile {
  id: string
  course_id: string
  name: string
  type: 'pdf' | 'video' | 'image' | 'doc'
  url?: string
  teacher_id: string
  uploaded_at: string
}

export interface Assignment {
  id: string
  title: string
  description: string
  course_id: string
  teacher_id: string
  teacher_name: string
  due_date: string
  created_at: string
}

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  file_name: string
  grade?: string
  submitted_at: string
}

export interface TimetableSlot {
  id: string
  subject: string
  teacher_id: string
  teacher_name: string
  day: string
  time: string
  room: string
}

export interface Notification {
  id: string
  user_id: string
  message: string
  type: string
  read: boolean
  created_at: string
}

export interface ActivityLog {
  id: string
  message: string
  type: string
  created_at: string
}

// ─── QGX ID Generator ─────────────────────────────────────────────────────────

export function generateQGXId(role: Role, count: number): string {
  const prefix = role === 'admin' ? 'A' : role === 'teacher' ? 'T' : 'S'
  return `QGX-${prefix}${String(count + 1).padStart(4, '0')}`
}

// ─── Notification helper ──────────────────────────────────────────────────────

export async function pushNotification(
  userId: string,
  message: string,
  type: string
) {
  await supabase.from('notifications').insert({
    user_id: userId,
    message,
    type,
    read: false,
  })
}

export async function logActivity(message: string, type: string) {
  await supabase.from('activity_log').insert({ message, type })
}
