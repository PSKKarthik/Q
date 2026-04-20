/**
 * POST /api/setup-profile
 *
 * Called immediately after supabase.auth.signUp() to ensure the user's profile
 * row is created with a proper QGX ID. Uses the service role key so it works
 * even when email confirmation is enabled (no active session yet).
 *
 * The request is validated by looking up the userId in auth — if the user doesn't
 * exist in Supabase auth the route returns 404, preventing profile spoofing.
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY

  if (!serviceKey) {
    return NextResponse.json({ success: false, error: 'Service role key not configured' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })

  const { userId, name, email, role, phone, institution_id } = body

  if (!userId || !name || !email || !role) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
  }

  const validRoles = ['admin', 'teacher', 'student', 'parent']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 })
  }

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // Verify the user actually exists in Supabase auth (prevents spoofing)
  const { data: authUser, error: authErr } = await adminClient.auth.admin.getUserById(userId)
  if (authErr || !authUser?.user) {
    return NextResponse.json({ success: false, error: 'User not found in auth' }, { status: 404 })
  }

  // Check if the profile already has a QGX ID — avoid overwriting an existing one
  const { data: existing } = await adminClient
    .from('profiles')
    .select('qgx_id')
    .eq('id', userId)
    .single()

  if (existing?.qgx_id) {
    return NextResponse.json({ success: true, data: { qgxId: existing.qgx_id } })
  }

  // Generate QGX ID atomically via RPC
  let qgxId: string
  const { data: rpcId, error: rpcErr } = await adminClient.rpc('generate_qgx_id', { p_role: role })
  if (rpcErr || !rpcId) {
    // Fallback: count existing users of this role and build ID
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

  const { error: upsertErr } = await adminClient.from('profiles').upsert({
    id: userId,
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

  if (upsertErr) {
    return NextResponse.json({ success: false, error: `Profile setup failed: ${upsertErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: { qgxId } })
}
