import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: admin only' }, { status: 403 })
  }

  const { data: quests, error } = await supabase.from('quests').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: { quests } })
}

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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: admin only' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, type, target_type, target_count, xp_reward, active } = body

  // Validate required fields
  if (!title || title.trim().length === 0 || title.length > 180) {
    return NextResponse.json({ success: false, error: 'Title must be 1-180 characters' }, { status: 400 })
  }
  if (!type || !['daily', 'weekly', 'special'].includes(type)) {
    return NextResponse.json({ success: false, error: 'Type must be daily, weekly, or special' }, { status: 400 })
  }
  if (!target_type || !['test', 'course', 'streak', 'social', 'achievement', 'xp'].includes(target_type)) {
    return NextResponse.json({ success: false, error: 'Invalid target_type' }, { status: 400 })
  }
  if (typeof target_count !== 'number' || target_count < 1 || target_count > 1000) {
    return NextResponse.json({ success: false, error: 'target_count must be 1-1000' }, { status: 400 })
  }
  if (typeof xp_reward !== 'number' || xp_reward < 1 || xp_reward > 5000) {
    return NextResponse.json({ success: false, error: 'xp_reward must be 1-5000' }, { status: 400 })
  }

  const { data: newQuest, error } = await supabase.from('quests').insert({
    title: title.trim(),
    description: description ? description.trim().slice(0, 1000) : null,
    type,
    target_type,
    target_count,
    xp_reward,
    active: active !== false,
  }).select().single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: { quest: newQuest } }, { status: 201 })
}

export async function PATCH(req: Request) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: admin only' }, { status: 403 })
  }

  const body = await req.json()
  const { id, title, description, type, target_type, target_count, xp_reward, active } = body

  if (!id) return NextResponse.json({ success: false, error: 'Missing quest id' }, { status: 400 })

  const updates: Record<string, any> = {}
  if (title) updates.title = title.trim().slice(0, 180)
  if (description) updates.description = description.trim().slice(0, 1000)
  if (type) updates.type = type
  if (target_type) updates.target_type = target_type
  if (typeof target_count === 'number') updates.target_count = target_count
  if (typeof xp_reward === 'number') updates.xp_reward = xp_reward
  if (typeof active === 'boolean') updates.active = active

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updatedQuest, error } = await supabase.from('quests').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: { quest: updatedQuest } })
}

export async function DELETE(req: Request) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: admin only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ success: false, error: 'Missing quest id' }, { status: 400 })

  const { error } = await supabase.from('quests').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
