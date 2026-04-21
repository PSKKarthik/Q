/**
 * POST /api/register
 *
 * Self-registration endpoint that bypasses Supabase's own email sending
 * (which has aggressive rate limits) by using the admin client with
 * email_confirm: true and sending the welcome email through Brevo.
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'
import { sendEmail, welcomeEmail } from '@/lib/email'

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
    return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })

  const { name, email, password, role, phone, institution_id } = body

  if (!name || !email || !password || !role) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
  }

  const validRoles = ['student', 'teacher', 'parent']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 })
  }

  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return NextResponse.json({ success: false, error: 'Password must be at least 8 characters with at least one letter and one number' }, { status: 400 })
  }

  // Rate limit by IP (fallback key if no IP header)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
  const { success: rateLimitOk } = await checkRateLimit(`register:${ip}`)
  if (!rateLimitOk) {
    return NextResponse.json({ success: false, error: 'Too many registration attempts. Please wait a minute.' }, { status: 429 })
  }

  const adminClient = createClient(supabaseUrl, serviceKey)

  // Check if email already exists
  const { data: existingUsers } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailExists = existingUsers?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase())
  if (emailExists) {
    return NextResponse.json({ success: false, error: 'An account with this email already exists. Please sign in instead.' }, { status: 409 })
  }

  // Create auth user with email confirmed (bypasses Supabase email rate limits)
  const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  })

  if (createErr) {
    if (createErr.message?.toLowerCase().includes('already registered') || createErr.message?.toLowerCase().includes('already exists')) {
      return NextResponse.json({ success: false, error: 'An account with this email already exists. Please sign in instead.' }, { status: 409 })
    }
    return NextResponse.json({ success: false, error: createErr.message }, { status: 400 })
  }

  if (!newUser.user) {
    return NextResponse.json({ success: false, error: 'Failed to create user' }, { status: 500 })
  }

  // Generate QGX ID
  let qgxId: string
  const { data: rpcId, error: rpcErr } = await adminClient.rpc('generate_qgx_id', { p_role: role })
  if (rpcErr || !rpcId) {
    const { count: roleCount } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', role)
    const prefixMap: Record<string, string> = { admin: 'A', teacher: 'T', student: 'S', parent: 'P' }
    const prefix = prefixMap[role] || 'U'
    const num = String((roleCount || 0) + 1).padStart(4, '0')
    const suffix = crypto.randomUUID().slice(0, 4).toUpperCase()
    qgxId = `QGX-${prefix}${num}-${suffix}`
  } else {
    qgxId = rpcId
  }

  const avatar = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  const { error: profileErr } = await adminClient.from('profiles').upsert({
    id: newUser.user.id,
    name,
    email,
    role,
    phone: phone || null,
    avatar,
    qgx_id: qgxId,
    xp: 0,
    score: 0,
    ghost_wins: 0,
    joined: new Date().toISOString().slice(0, 10),
    institution_id: institution_id || null,
  }, { onConflict: 'id' })

  if (profileErr) {
    // Clean up auth user if profile creation fails
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return NextResponse.json({ success: false, error: `Profile setup failed: ${profileErr.message}` }, { status: 500 })
  }

  // Log activity (non-blocking, fire-and-forget)
  void adminClient.from('activity_log').insert({
    message: `New ${role} registered: ${name} (${email})`,
    type: 'user_registered',
    actor_id: newUser.user.id,
    metadata: { email, role, qgx_id: qgxId },
  })

  // Send welcome email via Brevo (non-blocking)
  sendEmail({
    to: { email, name },
    subject: 'Welcome to QGX Learning Platform',
    html: welcomeEmail(name, role),
  }).catch(() => {})

  return NextResponse.json({
    success: true,
    data: { userId: newUser.user.id, qgxId, role },
  })
}
