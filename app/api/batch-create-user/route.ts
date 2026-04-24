import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'
import { sendEmail, userCredentialsEmail } from '@/lib/email'

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ success: false, error: 'Supabase URL/anon key not configured on server' }, { status: 500 })
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  // Verify caller is authenticated admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { success: rateLimitOk } = await checkRateLimit(`batch-create:${user.id}`)
  if (!rateLimitOk) return NextResponse.json({ success: false, error: 'Too many requests. Please wait a minute.' }, { status: 429 })

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: admins only' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, role } = body || {}

  if (!name || !email || !role) {
    return NextResponse.json({ success: false, error: 'Missing required fields: name, email, role' }, { status: 400 })
  }

  if (typeof name !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
    return NextResponse.json({ success: false, error: 'Invalid field types' }, { status: 400 })
  }

  const validRoles = ['admin', 'teacher', 'student', 'parent']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 })
  }

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'Service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY / SERVICE_ROLE_KEY) and restart dev server.',
      },
      { status: 500 }
    )
  }

  const adminClient = createClient(
    supabaseUrl,
    serviceKey
  )

  // Check if email already exists in profiles (including soft-deleted)
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id, deleted_at')
    .eq('email', email)
    .maybeSingle()

  if (existingProfile) {
    if (existingProfile.deleted_at) {
      return NextResponse.json({ success: false, error: 'An account with this email exists in the deleted users bin. Restore it from the admin Users tab.' }, { status: 409 })
    }
    return NextResponse.json({ success: false, error: 'An account with this email already exists.' }, { status: 409 })
  }

  // Generate a secure random password for the new user
  const tempPassword = crypto.randomUUID().slice(0, 8) + 'Aa1!'

  // Create auth user
  const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name, role },
  })

  if (createErr) {
    return NextResponse.json({ success: false, error: createErr.message }, { status: 400 })
  }

  if (!newUser.user) {
    return NextResponse.json({ success: false, error: 'Failed to create user' }, { status: 500 })
  }

  // Generate QGX ID atomically via RPC to avoid race conditions
  let qgxId: string
  const { data: rpcId, error: rpcErr } = await adminClient.rpc('generate_qgx_id', { p_role: role })
  if (rpcErr || !rpcId) {
    // Fallback if RPC doesn't exist yet
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

  // Upsert profile (use adminClient to bypass RLS — admin is creating another user's profile)
  const avatar = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const { error: upsertErr } = await adminClient.from('profiles').upsert({
    id: newUser.user.id,
    name,
    email,
    role,
    avatar,
    qgx_id: qgxId,
    xp: 0,
    score: 0,
    ghost_wins: 0,
    joined: new Date().toISOString().slice(0, 10),
  })

  if (upsertErr) {
    return NextResponse.json({ success: false, error: `Profile setup failed: ${upsertErr.message}` }, { status: 500 })
  }

  // Audit trail
  await supabase.from('activity_log').insert({
    message: `Admin batch-created user ${email} (${role})`,
    type: 'admin_batch_create',
    actor_id: user.id,
    metadata: { created_user_id: newUser.user.id, email, role },
  })

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Generate a password reset link so user can set their own password
  const { data: resetData } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${siteOrigin}/reset-password` },
  })

  const resetLink = resetData?.properties?.hashed_token
    ? `${siteOrigin}/reset-password?token_hash=${resetData.properties.hashed_token}&type=recovery`
    : null

  // Email credentials to the new user (fire-and-forget)
  if (resetLink) {
    await sendEmail({
      to: { email, name },
      subject: 'Your QGX Account — QGX Learning Platform',
      html: userCredentialsEmail(name, email, role, resetLink),
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      userId: newUser.user.id,
      qgxId,
      resetLink,
      message: resetLink
        ? 'User created. Credentials email sent to their inbox.'
        : 'User created. Share the reset link so they can set their password.',
    },
  })
}
