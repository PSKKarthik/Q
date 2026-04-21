import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'
import { sendEmail, activationEmail } from '@/lib/email'

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 })
  }

  const cookieStore = cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { success: rateLimitOk } = await checkRateLimit(`restore-user:${user.id}`)
  if (!rateLimitOk) return NextResponse.json({ success: false, error: 'Too many requests.' }, { status: 429 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!callerProfile || callerProfile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: admins only' }, { status: 403 })
  }

  const { userId } = await req.json()
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 })
  }

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ success: false, error: 'Service role key not configured.' }, { status: 500 })

  const adminClient = createClient(supabaseUrl, serviceKey)

  const { data: target, error: fetchErr } = await adminClient
    .from('profiles')
    .select('name, email, deleted_at')
    .eq('id', userId)
    .single()

  if (fetchErr || !target) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  if (!target.deleted_at) {
    return NextResponse.json({ success: false, error: 'User is not in the bin' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('profiles')
    .update({ deleted_at: null })
    .eq('id', userId)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  await supabase.from('activity_log').insert({
    message: `Admin restored user ${target.name} (${target.email}) from bin`,
    type: 'admin_restore_user',
    actor_id: user.id,
    metadata: { restored_user_id: userId, email: target.email },
  })

  // Send restoration email
  sendEmail({
    to: { email: target.email, name: target.name },
    subject: 'Your QGX Account Has Been Restored',
    html: activationEmail(target.name),
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
