import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'

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

  const { success: rateLimitOk } = await checkRateLimit(`delete-user:${user.id}`)
  if (!rateLimitOk) return NextResponse.json({ success: false, error: 'Too many requests. Please wait a minute.' }, { status: 429 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: admins only' }, { status: 403 })
  }

  const body = await req.json()
  const { userId, permanent } = body
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 })
  }

  // Prevent self-deletion
  if (userId === user.id) {
    return NextResponse.json({ success: false, error: 'Cannot delete your own account' }, { status: 400 })
  }

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      { success: false, error: 'Service role key not configured.' },
      { status: 500 }
    )
  }

  const adminClient = createClient(supabaseUrl, serviceKey)

  // Prevent deleting the last admin
  const { data: targetProfile } = await adminClient.from('profiles').select('role, name, email').eq('id', userId).single()
  if (targetProfile?.role === 'admin') {
    const { count } = await adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').is('deleted_at', null)
    if ((count || 0) <= 1) {
      return NextResponse.json({ success: false, error: 'Cannot delete the last admin account' }, { status: 403 })
    }
  }

  if (permanent) {
    // Permanent delete — removes from auth (cascade deletes profile via FK)
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    await supabase.from('activity_log').insert({
      message: `Admin permanently deleted user ${targetProfile?.name || userId} (${targetProfile?.email || ''})`,
      type: 'admin_permanent_delete',
      actor_id: user.id,
      metadata: { deleted_user_id: userId, email: targetProfile?.email, role: targetProfile?.role },
    })
  } else {
    // Soft delete — sets deleted_at timestamp on profile
    const { error } = await adminClient
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    await supabase.from('activity_log').insert({
      message: `Admin moved user ${targetProfile?.name || userId} (${targetProfile?.email || ''}) to bin`,
      type: 'admin_soft_delete',
      actor_id: user.id,
      metadata: { deleted_user_id: userId, email: targetProfile?.email, role: targetProfile?.role },
    })
  }

  return NextResponse.json({ success: true })
}
