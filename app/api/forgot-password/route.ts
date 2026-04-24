/**
 * POST /api/forgot-password
 *
 * Bypasses Supabase's rate-limited password reset emails by generating
 * the recovery link via the admin client and sending it through Brevo.
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'
import { sendEmail, emailTemplate } from '@/lib/email'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.email) {
    return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 })
  }

  const { email } = body

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 })
  }

  // Rate limit by IP to prevent abuse
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
  const { success: rateLimitOk } = await checkRateLimit(`forgot-password:${ip}`)
  if (!rateLimitOk) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 })
  }

  const adminClient = createClient(supabaseUrl, serviceKey)
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Generate recovery link via admin API (no Supabase email rate limits)
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${siteOrigin}/reset-password` },
  })

  // Always return success to avoid leaking whether an email exists
  if (linkErr || !linkData?.properties?.hashed_token) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[forgot-password] generateLink error:', linkErr?.message)
    }
    return NextResponse.json({ success: true })
  }

  // Build reset link using token_hash — the reset-password page calls verifyOtp directly,
  // bypassing Supabase's redirect chain which drops tokens in PKCE mode.
  const resetLink = `${siteOrigin}/reset-password?token_hash=${linkData.properties.hashed_token}&type=recovery`

  // Fetch name from profile for a personalized email
  const { data: profile } = await adminClient
    .from('profiles')
    .select('name')
    .eq('email', email.toLowerCase())
    .single()

  const name = profile?.name || 'there'

  const emailResult = await sendEmail({
    to: { email, name },
    subject: 'Password Reset — QGX Platform',
    html: emailTemplate(
      'Password Reset',
      `Hi <strong>${name}</strong>,<br><br>We received a request to reset your QGX password. Click the button below to set a new password.<br><br>This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.`,
      'Reset Password', resetLink
    ),
  })

  if (process.env.NODE_ENV === 'development' && !emailResult.success) {
    console.error('[forgot-password] sendEmail error:', emailResult.error)
  }

  return NextResponse.json({ success: true })
}
