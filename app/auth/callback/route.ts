import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/reset-password'

  // Whitelist safe redirect paths — prevent open redirect
  const SAFE_PATHS = ['/reset-password', '/dashboard/student', '/dashboard/teacher', '/dashboard/parent', '/dashboard/admin', '/login']
  const next = SAFE_PATHS.includes(nextParam) ? nextParam : '/reset-password'

  if (code) {
    const cookieStore = cookies()
    const redirectUrl = new URL(next, req.url)
    const response = NextResponse.redirect(redirectUrl)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return response
    }
  }

  // If code exchange failed, redirect to forgot-password with error
  return NextResponse.redirect(new URL('/forgot-password?error=expired', req.url))
}
