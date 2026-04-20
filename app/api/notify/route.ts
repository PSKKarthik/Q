import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'
import { sendEmail, meetingBookedEmail, meetingCancelledEmail, gradePostedEmail, excuseSubmittedEmail, excuseReviewedEmail, meetingRequestEmail, meetingRequestReviewedEmail } from '@/lib/email'

export async function POST(req: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { success: rateLimitOk } = await checkRateLimit(`notify:${user.id}`)
  if (!rateLimitOk) return NextResponse.json({ success: false, error: 'Too many requests. Please wait a minute.' }, { status: 429 })

  const body = await req.json()
  const { type, payload } = body || {}

  if (!type || !payload) {
    return NextResponse.json({ success: false, error: 'Missing type or payload' }, { status: 400 })
  }

  // ── meeting_booked: notify teacher ────────────────────────────
  if (type === 'meeting_booked') {
    const { slot_id } = payload
    if (!slot_id) return NextResponse.json({ success: false, error: 'Missing slot_id' }, { status: 400 })

    const { data: slot } = await supabase.from('meeting_slots').select('*').eq('id', slot_id).single()
    if (!slot) return NextResponse.json({ success: false, error: 'Slot not found' }, { status: 404 })

    const { data: teacher } = await supabase.from('profiles').select('email, name').eq('id', slot.teacher_id).single()
    if (teacher?.email) {
      await sendEmail({
        to: { email: teacher.email, name: teacher.name },
        subject: 'New Meeting Booked — QGX',
        html: meetingBookedEmail(teacher.name, slot.parent_name || 'A parent', slot.date, slot.start_time, slot.end_time),
      })
    }
    return NextResponse.json({ success: true })
  }

  // ── meeting_cancelled: notify affected party ──────────────────
  if (type === 'meeting_cancelled') {
    const { slot_id } = payload
    if (!slot_id) return NextResponse.json({ success: false, error: 'Missing slot_id' }, { status: 400 })

    // Derive role from the authenticated user's profile — never trust the client payload
    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const cancelled_by_role = callerProfile?.role || 'parent'

    const { data: slot } = await supabase.from('meeting_slots').select('*').eq('id', slot_id).single()
    if (!slot) return NextResponse.json({ success: false, error: 'Slot not found' }, { status: 404 })

    // If teacher cancelled → notify the parent/booker
    // If parent cancelled → notify the teacher
    if (cancelled_by_role === 'teacher' && slot.booked_by) {
      const { data: parent } = await supabase.from('profiles').select('email, name').eq('id', slot.booked_by).single()
      if (parent?.email) {
        await sendEmail({
          to: { email: parent.email, name: parent.name },
          subject: 'Meeting Cancelled — QGX',
          html: meetingCancelledEmail(parent.name, slot.teacher_name, slot.date, slot.start_time, slot.end_time),
        })
      }
    } else {
      // Parent/student cancelled → notify teacher
      const { data: teacher } = await supabase.from('profiles').select('email, name').eq('id', slot.teacher_id).single()
      if (teacher?.email) {
        await sendEmail({
          to: { email: teacher.email, name: teacher.name },
          subject: 'Meeting Cancelled — QGX',
          html: meetingCancelledEmail(teacher.name, slot.parent_name || 'A parent', slot.date, slot.start_time, slot.end_time),
        })
      }
    }
    return NextResponse.json({ success: true })
  }

  // ── grade_posted: notify student ──────────────────────────────
  if (type === 'grade_posted') {
    const { student_id, assignment_title, grade, feedback } = payload
    if (!student_id || !assignment_title || !grade) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }
    const { data: student } = await supabase.from('profiles').select('email, name').eq('id', student_id).single()
    if (student?.email) {
      await sendEmail({
        to: { email: student.email, name: student.name },
        subject: `Grade Posted: ${assignment_title} — QGX`,
        html: gradePostedEmail(student.name, assignment_title, grade, feedback),
      })
    }
    return NextResponse.json({ success: true })
  }

  // ── meeting_requested: notify teacher by email ────────────────
  if (type === 'meeting_requested') {
    const { request_id } = payload
    if (!request_id) return NextResponse.json({ success: false, error: 'Missing request_id' }, { status: 400 })

    const { data: req } = await supabase.from('meeting_requests').select('*').eq('id', request_id).single()
    if (!req) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })

    const { data: teacher } = await supabase.from('profiles').select('email, name').eq('id', req.teacher_id).single()
    if (teacher?.email) {
      await sendEmail({
        to: { email: teacher.email, name: teacher.name },
        subject: `Meeting Request from ${req.parent_name} — QGX`,
        html: meetingRequestEmail(teacher.name, req.parent_name, req.proposed_date, req.proposed_start, req.proposed_end, req.message),
      })
    }
    return NextResponse.json({ success: true })
  }

  // ── meeting_request_reviewed: notify parent by email ──────────
  if (type === 'meeting_request_reviewed') {
    const { request_id } = payload
    if (!request_id) return NextResponse.json({ success: false, error: 'Missing request_id' }, { status: 400 })

    const { data: req } = await supabase.from('meeting_requests').select('*').eq('id', request_id).single()
    if (!req) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })

    const { data: parent } = await supabase.from('profiles').select('email, name').eq('id', req.parent_id).single()
    if (parent?.email) {
      await sendEmail({
        to: { email: parent.email, name: parent.name },
        subject: `Meeting Request ${req.status === 'approved' ? 'Approved' : 'Declined'} — QGX`,
        html: meetingRequestReviewedEmail(parent.name, req.teacher_name, req.proposed_date, req.proposed_start, req.proposed_end, req.status),
      })
    }
    return NextResponse.json({ success: true })
  }

  // ── excuse_submitted: notify teacher(s) by email ─────────────
  if (type === 'excuse_submitted') {
    const { excuse_id } = payload
    if (!excuse_id) return NextResponse.json({ success: false, error: 'Missing excuse_id' }, { status: 400 })

    const { data: excuse } = await supabase
      .from('absence_excuses')
      .select('*')
      .eq('id', excuse_id)
      .single()
    if (!excuse) return NextResponse.json({ success: false, error: 'Excuse not found' }, { status: 404 })

    const { data: student } = await supabase.from('profiles').select('name').eq('id', excuse.student_id).single()
    const { data: parent } = await supabase.from('profiles').select('name').eq('id', excuse.parent_id).single()

    // Find teachers who have attendance records for this student
    const { data: attRecords } = await supabase
      .from('attendance')
      .select('teacher_id')
      .eq('student_id', excuse.student_id)
    const teacherIds = Array.from(new Set((attRecords || []).map((r: any) => r.teacher_id).filter(Boolean)))

    if (teacherIds.length > 0) {
      const { data: teachers } = await supabase.from('profiles').select('id, name, email').in('id', teacherIds)
      for (const teacher of teachers || []) {
        if (teacher.email) {
          await sendEmail({
            to: { email: teacher.email, name: teacher.name },
            subject: `Absence Excuse — ${student?.name || 'Student'} — QGX`,
            html: excuseSubmittedEmail(teacher.name, student?.name || 'Student', parent?.name || 'Parent', excuse.date, excuse.reason),
          })
        }
      }
    }
    return NextResponse.json({ success: true })
  }

  // ── excuse_reviewed: notify parent by email ───────────────────
  if (type === 'excuse_reviewed') {
    const { excuse_id } = payload
    if (!excuse_id) return NextResponse.json({ success: false, error: 'Missing excuse_id' }, { status: 400 })

    const { data: excuse } = await supabase
      .from('absence_excuses')
      .select('*')
      .eq('id', excuse_id)
      .single()
    if (!excuse) return NextResponse.json({ success: false, error: 'Excuse not found' }, { status: 404 })

    const { data: student } = await supabase.from('profiles').select('name').eq('id', excuse.student_id).single()
    const { data: parent } = await supabase.from('profiles').select('name, email').eq('id', excuse.parent_id).single()

    if (parent?.email) {
      await sendEmail({
        to: { email: parent.email, name: parent.name },
        subject: `Absence Excuse ${excuse.status === 'approved' ? 'Approved' : 'Rejected'} — QGX`,
        html: excuseReviewedEmail(parent.name, student?.name || 'Student', excuse.date, excuse.status),
      })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: false, error: 'Unknown notification type' }, { status: 400 })
}
