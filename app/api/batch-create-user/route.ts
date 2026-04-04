import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admins only' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, role } = body || {}

  if (!name || !email || !role) {
    return NextResponse.json({ error: 'Missing required fields: name, email, role' }, { status: 400 })
  }

  if (typeof name !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
    return NextResponse.json({ error: 'Invalid field types' }, { status: 400 })
  }

  const validRoles = ['admin', 'teacher', 'student', 'parent']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )

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
    return NextResponse.json({ error: createErr.message }, { status: 400 })
  }

  if (!newUser.user) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }

  // Generate QGX ID atomically via RPC to avoid race conditions
  let qgxId: string
  const { data: rpcId, error: rpcErr } = await supabase.rpc('generate_qgx_id', { p_role: role })
  if (rpcErr || !rpcId) {
    // Fallback if RPC doesn't exist yet
    const { count: roleCount } = await supabase
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

  // Upsert profile
  const avatar = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  await supabase.from('profiles').upsert({
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

  // Audit trail
  await supabase.from('activity_log').insert({
    message: `Admin batch-created user ${email} (${role})`,
    type: 'admin_batch_create',
  })

  // Generate a password reset link so user can set their own password
  const { data: resetData } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
  })

  return NextResponse.json({
    success: true,
    userId: newUser.user.id,
    qgxId,
    resetLink: resetData?.properties?.action_link || null,
    message: 'User created. Share the reset link so they can set their password.',
  })
}
