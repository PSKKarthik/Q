export type Role = 'admin' | 'teacher' | 'student' | 'parent'

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
  reputation?: number
  badges?: string[]
  theme?: 'dark' | 'light'
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
  xp_reward: number
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
  answer: number | boolean | string | number[] | { left: string; right: string }[]
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
  answer_map: Record<string, number | boolean | string | number[] | Record<string, string>>
  submitted_at: string
}

export interface Course {
  id: string
  title: string
  subject: string
  teacher_id: string
  teacher_name: string
  description: string
  status: 'draft' | 'published'
  created_at: string
  files?: CourseFile[]
  enrolled?: string[]
}

export interface CourseFile {
  id: string
  course_id: string
  name: string
  storage_path?: string
  type: string
  url?: string
  size?: number
  section?: string
  order_index?: number
  teacher_id: string
  uploaded_at: string
}

export interface CourseProgress {
  id: string
  student_id: string
  course_id: string
  file_id: string
  completed_at: string
}

export interface CourseRating {
  id: string
  student_id: string
  student_name: string
  course_id: string
  rating: number
  review?: string
  created_at: string
}

export interface Assignment {
  id: string
  title: string
  description: string
  course_id: string
  teacher_id: string
  teacher_name: string
  due_date: string
  attachment_url?: string
  attachment_name?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  max_points: number
  status: 'active' | 'closed'
  created_at: string
}

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  student_name?: string
  file_name: string
  file_url?: string
  text_response?: string
  feedback?: string
  grade?: string
  score?: number
  is_draft?: boolean
  is_late?: boolean
  submitted_at: string
}

export type ForumFlair = 'question' | 'discussion' | 'announcement' | 'resource' | 'help' | 'showcase'

export interface ForumPost {
  id: string
  title: string
  body: string
  author_id: string
  author_name: string
  author_role: Role
  pinned: boolean
  likes: string[]
  bookmarks: string[]
  flair?: ForumFlair
  tags: string[]
  attachment_url?: string
  attachment_name?: string
  attachment_type?: string
  comment_count: number
  view_count: number
  best_answer_id?: string
  edited_at?: string
  created_at: string
}

export interface ForumComment {
  id: string
  post_id: string
  parent_id?: string
  body: string
  author_id: string
  author_name: string
  author_role: Role
  likes: string[]
  is_best_answer: boolean
  created_at: string
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

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export interface AttendanceRecord {
  id: string
  student_id: string
  student_name: string
  teacher_id: string
  subject: string
  date: string
  status: AttendanceStatus
  note?: string
  created_at: string
}

export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  body: string
  read: boolean
  created_at: string
  attachment_url?: string
  attachment_name?: string
  attachment_type?: string
  edited_at?: string
  deleted?: boolean
  group_id?: string
}

export interface Certificate {
  id: string
  student_id: string
  course_id: string
  student_name: string
  course_title: string
  issued_at: string
  credential_id?: string
  verified?: boolean
}

export interface ParentStudent {
  parent_id: string
  student_id: string
}

export interface MessageGroup {
  id: string
  name: string
  created_by: string
  member_ids: string[]
  created_at: string
}

export interface ReportComment {
  id: string
  student_id: string
  teacher_id: string
  teacher_name: string
  term: string
  comment: string
  conduct?: 'excellent' | 'good' | 'satisfactory' | 'needs_improvement' | 'poor'
  created_at: string
}

export interface GradeWeights {
  id: string
  course_id?: string
  tests_weight: number
  assignments_weight: number
  attendance_weight: number
  participation_weight: number
}

export interface AbsenceExcuse {
  id: string
  parent_id: string
  student_id: string
  date: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by?: string
  created_at: string
}

export interface AiChat {
  id: string
  student_id: string
  course_id: string
  messages: { role: 'user' | 'assistant'; content: string; timestamp: string }[]
  created_at: string
  updated_at: string
}

export interface LiveClass {
  id: string
  title: string
  teacher_id: string
  teacher_name: string
  course_id?: string
  room_id: string
  room_url?: string
  subject?: string
  scheduled_at: string
  duration: number
  status: 'scheduled' | 'live' | 'ended'
  created_at: string
}

export interface Quest {
  id: string
  title: string
  description?: string
  type: 'daily' | 'weekly' | 'special'
  target_type: string
  target_count: number
  xp_reward: number
  active: boolean
  created_at: string
}

export interface QuestProgress {
  id: string
  student_id: string
  quest_id: string
  progress: number
  completed: boolean
  claimed?: boolean
  completed_at?: string
}

export interface MeetingSlot {
  id: string
  teacher_id: string
  teacher_name: string
  date: string
  start_time: string
  end_time: string
  time?: string
  duration?: number
  booked_by?: string
  booked_name?: string
  parent_id?: string
  parent_name?: string
  student_id?: string
  status: 'available' | 'booked' | 'completed' | 'cancelled'
  created_at: string
}
