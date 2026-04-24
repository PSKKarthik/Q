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

  const { success: rateLimitOk } = await checkRateLimit(`toggle-active:${user.id}`)
  if (!rateLimitOk) return NextResponse.json({ success: false, error: 'Too many requests. Please wait a minute.' }, { status: 429 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: admins only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { userId, active } = body
  if (!userId || typeof userId !== 'string' || typeof active !== 'boolean') {
    return NextResponse.json({ success: false, error: 'Missing userId or active status' }, { status: 400 })
  }

  // Prevent self-deactivation
  if (userId === user.id && active === false) {
    return NextResponse.json({ success: false, error: 'Cannot deactivate your own account' }, { status: 400 })
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

  // Update target profile status
  const { error } = await adminClient
    .from('profiles')
    .update({ active })
    .eq('id', userId)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Log activity
  const { data: targetUser } = await adminClient.from('profiles').select('name, email').eq('id', userId).single()
  const action = active ? 'activated' : 'deactivated'
  
  await adminClient.from('activity_log').insert({
    message: `Admin ${action} user ${targetUser?.name || userId} (${targetUser?.email || ''})`,
    type: `admin_${action}_user`,
    actor_id: user.id,
    metadata: { target_user_id: userId, email: targetUser?.email, active },
  })

  return NextResponse.json({ success: true })
}
