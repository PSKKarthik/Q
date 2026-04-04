import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase URL/anon key not configured on server' }, { status: 500 })
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admins only' }, { status: 403 })
  }

  const { userId } = await req.json()
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  // Prevent self-deletion
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  // Prevent deleting the last admin
  const { data: targetProfile } = await supabase.from('profiles').select('role').eq('id', userId).single()
  if (targetProfile?.role === 'admin') {
    const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
    if ((count || 0) <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last admin account' }, { status: 403 })
    }
  }

  // Service role client for auth.admin operations
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      {
        error: 'Service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY / SERVICE_ROLE_KEY) and restart dev server.',
      },
      { status: 500 }
    )
  }

  const adminClient = createClient(
    supabaseUrl,
    serviceKey
  )

  // Delete auth user (cascade will delete profile via FK)
  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit trail
  await supabase.from('activity_log').insert({
    message: `Admin ${user.id} deleted user ${userId}`,
    type: 'admin_delete',
    actor_id: user.id,
    metadata: { deleted_user_id: userId },
  })

  return NextResponse.json({ success: true })
}
