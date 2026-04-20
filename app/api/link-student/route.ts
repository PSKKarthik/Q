/**
 * Parent–Student account linking via email OTP.
 *
 * Flow:
 *   POST { action: 'request', qgx_id }
 *     → Finds the student, generates a 6-digit OTP, sends it to the
 *       student's email, notifies the student in-app, and returns a
 *       short-lived signed token to the parent client.
 *
 *   POST { action: 'verify', token, otp }
 *     → Verifies the HMAC signature on the token, checks the OTP
 *       matches and hasn't expired, then creates the parent_students row.
 *
 * The token is HMAC-SHA256 signed with OTP_SECRET (falls back to the
 * Supabase service-role key, which is already a strong secret).
 * No database table is needed for OTP storage — the signed token is
 * kept entirely on the parent client between the two steps.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sendEmail, studentLinkPinEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/ratelimit'

const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes

// ── token helpers ─────────────────────────────────────────────

function getSecret(): string {
  return (
    process.env.OTP_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'dev-otp-secret-change-in-production'
  )
}

interface OtpPayload {
  otp: string
  student_id: string
  parent_id: string
  expires: number // unix ms
}

function signToken(payload: OtpPayload): string {
  const secret = getSecret()
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

function verifyToken(token: string): OtpPayload | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const data = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const secret = getSecret()
    const expected = createHmac('sha256', secret).update(data).digest('base64url')
    // Constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(sig)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null
    const payload: OtpPayload = JSON.parse(Buffer.from(data, 'base64url').toString())
    return payload
  } catch {
    return null
  }
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// ── route ─────────────────────────────────────────────────────

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

  const { data: caller } = await supabase
    .from('profiles').select('role, name').eq('id', user.id).single()

  if (!caller || caller.role !== 'parent') {
    return NextResponse.json({ success: false, error: 'Only parents can link students' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })

  const { action } = body

  // Rate limit: 5 OTP requests per minute per parent, 10 verify attempts per minute per parent
  const limitKey = action === 'request' ? `link-otp-request:${user.id}` : `link-otp-verify:${user.id}`
  const { success: rateLimitOk } = await checkRateLimit(limitKey)
  if (!rateLimitOk) return NextResponse.json({ success: false, error: 'Too many requests. Please wait a minute.' }, { status: 429 })

  // ── Step 1: send OTP ────────────────────────────────────────
  if (action === 'request') {
    const { qgx_id } = body
    if (!qgx_id?.trim()) {
      return NextResponse.json({ success: false, error: 'QGX ID is required' }, { status: 400 })
    }

    // Find the student
    const { data: student } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('qgx_id', String(qgx_id).trim().toUpperCase())
      .eq('role', 'student')
      .single()

    if (!student) {
      return NextResponse.json({ success: false, error: 'Student not found. Check the QGX ID and try again.' }, { status: 404 })
    }

    // Validate student has an email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!student.email || !emailRegex.test(student.email)) {
      return NextResponse.json(
        { success: false, error: 'This student has no email on file. Ask an admin to update their profile.' },
        { status: 422 }
      )
    }

    // Check not already linked
    const { data: existing } = await supabase
      .from('parent_students')
      .select('student_id')
      .eq('parent_id', user.id)
      .eq('student_id', student.id)
      .single()

    if (existing) {
      return NextResponse.json({ success: false, error: 'You are already linked to this student.' }, { status: 409 })
    }

    // Generate OTP + signed token (stateless — no DB storage needed)
    const otp = generateOtp()
    const token = signToken({
      otp,
      student_id: student.id,
      parent_id: user.id,
      expires: Date.now() + OTP_TTL_MS,
    })

    // Send OTP to student's email
    const emailResult = await sendEmail({
      to: { email: student.email, name: student.name },
      subject: 'Account Link Verification Code — QGX',
      html: studentLinkPinEmail(student.name, caller.name, otp),
    })

    // Notify student in-app so they see it in their dashboard too
    await supabase.from('notifications').insert({
      user_id: student.id,
      type: 'parent_link',
      message: `${caller.name} wants to link your account as a parent. Verification code sent to your email (valid 10 min).`,
      read: false,
    })

    if (!emailResult.success) {
      // Dev mode: log OTP to console so testing works without email
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] OTP for ${student.name}: ${otp}`)
        return NextResponse.json({
          success: true,
          data: { token, studentName: student.name, devOtp: otp },
        })
      }
      return NextResponse.json(
        { success: false, error: 'Could not send verification email. Check student email address.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: { token, studentName: student.name } })
  }

  // ── Step 2: verify OTP ──────────────────────────────────────
  if (action === 'verify') {
    const { token, otp } = body

    if (!token || !otp) {
      return NextResponse.json({ success: false, error: 'Missing token or OTP' }, { status: 400 })
    }

    const payload = verifyToken(String(token))

    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Invalid or tampered verification token. Request a new code.' },
        { status: 422 }
      )
    }

    if (Date.now() > payload.expires) {
      return NextResponse.json(
        { success: false, error: 'Verification code expired. Request a new one.' },
        { status: 410 }
      )
    }

    if (payload.parent_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Token does not belong to this account.' }, { status: 403 })
    }

    if (String(otp).trim() !== payload.otp) {
      return NextResponse.json({ success: false, error: 'Incorrect code. Try again.' }, { status: 422 })
    }

    // Fetch student profile for the response
    const { data: student } = await supabase
      .from('profiles').select('*').eq('id', payload.student_id).single()

    if (!student) {
      return NextResponse.json({ success: false, error: 'Student no longer exists.' }, { status: 404 })
    }

    // Create the link
    const { error: linkErr } = await supabase
      .from('parent_students')
      .insert({ parent_id: user.id, student_id: payload.student_id })

    if (linkErr) {
      // Unique violation — already linked (race condition)
      if (linkErr.code === '23505') {
        return NextResponse.json({ success: true, data: { student } }) // idempotent — return success
      }
      return NextResponse.json({ success: false, error: linkErr.message }, { status: 500 })
    }

    // Notify student their account was successfully linked
    await supabase.from('notifications').insert({
      user_id: payload.student_id,
      type: 'parent_link',
      message: `${caller.name} has been linked to your account as a parent.`,
      read: false,
    })

    return NextResponse.json({ success: true, data: { student } })
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
}
