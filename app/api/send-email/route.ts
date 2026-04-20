import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sendEmail, sendEmailBatch, emailTemplate } from '@/lib/email'

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

  const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single()
  if (!profile) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }
  const isPrivileged = ['admin', 'teacher'].includes(profile.role)

  const body = await req.json()
  const { to, subject, message, template } = body

  if (!to || !subject || !message) {
    return NextResponse.json({ success: false, error: 'Missing to, subject, or message' }, { status: 400 })
  }

  // Strip HTML tags from message to prevent phishing via mail relay
  const safeMessage = String(message).replace(/<[^>]*>/g, '')
  const html = emailTemplate(template || subject, safeMessage)

  // Single recipient — non-privileged users may only send to their own email (e.g. welcome email)
  if (!Array.isArray(to)) {
    if (!isPrivileged && to !== profile.email) {
      return NextResponse.json({ success: false, error: 'Forbidden: you may only send email to yourself' }, { status: 403 })
    }
    const result = await sendEmail({ to: { email: to }, subject, html })
    if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    return NextResponse.json({ success: true, data: { messageId: result.messageId } })
  }

  // Multiple recipients — only admin/teacher can send batch emails
  if (!isPrivileged) {
    return NextResponse.json({ success: false, error: 'Forbidden: batch email requires admin or teacher role' }, { status: 403 })
  }
  const { sent, failed } = await sendEmailBatch(to, subject, html)
  return NextResponse.json({ success: true, data: { sent, failed } })
}
