import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sendEmail, emailTemplate } from '@/lib/email'

export async function POST(req: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
  }

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ success: false, error: 'Service role key not configured' }, { status: 500 })

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // Fetch the user's email from profiles
  const { data: targetProfile } = await adminClient.from('profiles').select('email, name').eq('id', userId).single()
  if (!targetProfile?.email) {
    return NextResponse.json({ success: false, error: 'User has no email on file' }, { status: 404 })
  }

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Generate a password reset link
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: targetProfile.email,
    options: { redirectTo: `${siteOrigin}/auth/callback?next=/reset-password` },
  })
  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.json({ success: false, error: linkErr?.message || 'Failed to generate reset link' }, { status: 500 })
  }

  const resetLink = linkData.properties.action_link

  // Email the reset link to the user (action_link is the direct Supabase link — user clicks it,
  // Supabase processes the recovery token and redirects through /auth/callback to /reset-password)
  await sendEmail({
    to: { email: targetProfile.email, name: targetProfile.name },
    subject: 'Password Reset — QGX Platform',
    html: emailTemplate(
      'Password Reset',
      `Hi <strong>${targetProfile.name}</strong>,<br><br>An admin has sent you a password reset link for the QGX Learning Platform.<br><br>Click the button below to set a new password.`,
      'Reset Password', resetLink
    ),
  })

  return NextResponse.json({ success: true, data: { resetLink, email: targetProfile.email } })
}
