'use client'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/lib/theme'
import { supabase } from '@/lib/supabase'

function AnimatedCounter({ end, label, suffix = '' }: { end: number; label: string; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true
        const dur = 1200
        const start = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now - start) / dur, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          setCount(Math.round(ease * end))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [end])

  return (
    <div ref={ref} style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(48px, 8vw, 72px)', lineHeight: 1 }}>
        {count}{suffix}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--fg-dim)', textTransform: 'uppercase', marginTop: 8 }}>
        {label}
      </div>
    </div>
  )
}

// ─── SVG Icon component ───
function FeatureIcon({ d, size = 28 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg)', opacity: 0.7 }}>
      <path d={d} />
    </svg>
  )
}

const ICON_PATHS = {
  assessments: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6M9 14l2 2 4-4',
  ai: 'M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1v2a4 4 0 0 1-8 0v-2H7a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4zM9 10h0M15 10h0M9 15c.83.5 1.5.5 3 .5s2.17 0 3-.5',
  courses: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  xp: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M6 9v5a6 6 0 0 0 12 0V9M6 9h12M12 19v3M8 22h8',
  analytics: 'M18 20V10M12 20V4M6 20v-6',
  forums: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  timetable: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18M8 14h2v2H8z',
  live: 'M23 7l-7 5 7 5zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
  assignments: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  parent: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  certificate: 'M12 15l-2 5 2-1.5L14 20l-2-5zM20 7.5a2.5 2.5 0 0 0-5 0 2.5 2.5 0 0 0-6 0C9 4 11 2 12 2s3 2 3 5.5zM7 7.5A5 5 0 0 0 12 15a5 5 0 0 0 5-7.5',
}

const FEATURES = [
  { icon: 'assessments', title: 'Smart Assessments', desc: 'MCQ, MSQ, True/False, Fill-in-the-Blank, Match — with anti-cheat, timers, and ghost scoring.' },
  { icon: 'ai', title: 'AI Tutor', desc: 'Ask questions, get explanations, and auto-generate test questions powered by LLaMA.' },
  { icon: 'courses', title: 'Course Management', desc: 'Upload materials, organize sections, track student progress and completion rates.' },
  { icon: 'xp', title: 'XP & Gamification', desc: 'Earn XP from tests, check-ins, and quests. Level up from Rookie to Immortal.' },
  { icon: 'analytics', title: 'Analytics Dashboard', desc: 'Performance trends, score distributions, moving averages, and CSV exports.' },
  { icon: 'forums', title: 'Forums & Messaging', desc: 'Discussion boards with flairs, best answers, bookmarks, and real-time DMs.' },
  { icon: 'timetable', title: 'Timetable & Calendar', desc: 'Weekly schedules, event tracking, month/week views, and XP check-ins.' },
  { icon: 'live', title: 'Live Classes', desc: 'Video conferencing with Jitsi integration — no accounts needed for students.' },
  { icon: 'assignments', title: 'Assignments', desc: 'Create, submit, grade with priority levels, late detection, and file uploads.' },
  { icon: 'shield', title: 'Anti-Cheat Engine', desc: 'Tab-switch detection, copy-paste blocking, fullscreen mode, and randomization.' },
  { icon: 'parent', title: 'Parent Portal', desc: 'Monitor linked students — view grades, attendance, and timetables in real time.' },
  { icon: 'certificate', title: 'Certificates', desc: 'Auto-generated canvas certificates for course completion, downloadable and shareable.' },
]

const ROLE_ICONS = {
  student: 'M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c0 2 3 3 6 3s6-1 6-3v-5',
  teacher: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  admin: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  parent: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
}

const ROLES = [
  { role: 'student', label: 'S T U D E N T', sub: 'Learn & Attempt', icon: 'student', features: ['Take tests & quizzes', 'Track XP & leaderboard', 'Join courses & forums', 'AI-powered tutoring'] },
  { role: 'teacher', label: 'T E A C H E R', sub: 'Create & Manage', icon: 'teacher', features: ['Create assessments', 'Manage courses', 'Grade assignments', 'Live classes & analytics'] },
  { role: 'admin',   label: 'A D M I N',   sub: 'Oversee & Control', icon: 'admin', features: ['User management', 'Platform settings', 'Activity monitoring', 'Batch operations'] },
  { role: 'parent',  label: 'P A R E N T',  sub: 'Monitor & Support', icon: 'parent', features: ['Link to students', 'View grades & attendance', 'Track progress', 'Stay informed'] },
]

export default function Home() {
  const [hover, setHover] = useState<string | null>(null)
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [loggingIn, setLoggingIn] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()

  const loginAs = async (email: string, password: string, role: string) => {
    setLoggingIn(role); setLoginError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setLoginError(error.message); setLoggingIn(null); return }
    router.push(`/dashboard/${role.toLowerCase()}`)
  }

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          setVisible(prev => new Set(prev).add(e.target.id))
        }
      })
    }, { threshold: 0.1 })

    document.querySelectorAll('[data-animate]').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  const isVisible = (id: string) => visible.has(id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <div className="grid-bg" />
      <div className="scanline" />

      {/* ─── NAV ─── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px clamp(16px, 4vw, 48px)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg)', backdropFilter: 'blur(16px)' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: '0.15em' }}>QGX</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="#features" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.08em', textDecoration: 'none', padding: '6px 12px', transition: 'color 0.2s' }}>FEATURES</a>
          <a href="#roles" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.08em', textDecoration: 'none', padding: '6px 12px', transition: 'color 0.2s' }}>ROLES</a>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ background: 'none', border: '1px solid var(--border)', padding: '5px 10px', cursor: 'pointer', color: 'var(--fg)', fontSize: 16, lineHeight: 1, transition: 'border-color 0.2s' }}
          >
            {mounted ? (theme === 'dark' ? '○' : '◐') : '○'}
          </button>
          <Link href="/login" className="btn btn-sm">Login</Link>
          <Link href="/register" className="btn btn-primary btn-sm">Register</Link>
          {installPrompt && (
            <button
              className="btn btn-sm"
              title="Install QGX as an app"
              onClick={() => {
                installPrompt.prompt()
                installPrompt.userChoice.then(() => setInstallPrompt(null))
              }}
            >
              ↓ Install
            </button>
          )}
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'clamp(60px, 12vw, 120px) clamp(16px, 4vw, 48px) clamp(40px, 8vw, 80px)', position: 'relative', zIndex: 5 }}>
        <div className="fade-up" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 700 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--fg-dim)', display: 'inline-block' }} />
          Query Gen X — Learning Management System
          <span style={{ flex: 1, height: 1, background: 'var(--fg-dim)', display: 'inline-block' }} />
        </div>
        <h1 className="fade-up-1" style={{ fontFamily: 'var(--display)', fontSize: 'clamp(80px,14vw,160px)', letterSpacing: '0.1em', lineHeight: 0.85, marginBottom: 32, WebkitTextStroke: '1.5px currentColor', paintOrder: 'stroke fill' }}>
          QGX
        </h1>
        <p className="fade-up-2" style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(16px, 2.5vw, 20px)', color: 'var(--fg-dim)', maxWidth: 560, lineHeight: 1.7, marginBottom: 48 }}>
          Assessments. Courses. AI Tutoring. Gamification.<br />
          Everything your classroom needs — in one platform.
        </p>
        <div className="fade-up-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/register" className="btn btn-primary" style={{ padding: '14px 36px', fontSize: 13 }}>
            Get Started
          </Link>
          <a href="#features" className="btn" style={{ padding: '14px 36px', fontSize: 13 }}>
            Explore Features ↓
          </a>
        </div>
      </section>

      {/* ─── STATS ─── */}
      <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 'clamp(40px, 6vw, 60px) clamp(16px, 4vw, 48px)', position: 'relative', zIndex: 5 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 32, maxWidth: 800, margin: '0 auto' }}>
          <AnimatedCounter end={23} label="Modules" suffix="+" />
          <AnimatedCounter end={5} label="Question Types" />
          <AnimatedCounter end={4} label="User Roles" />
          <AnimatedCounter end={7} label="XP Levels" />
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" data-animate style={{ padding: 'clamp(60px, 10vw, 100px) clamp(16px, 4vw, 48px)', position: 'relative', zIndex: 5 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--fg-dim)', textTransform: 'uppercase', marginBottom: 12 }}>What&apos;s Inside</div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(36px, 6vw, 56px)', letterSpacing: '0.06em', WebkitTextStroke: '0.8px currentColor', paintOrder: 'stroke fill' }}>FEATURES</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, maxWidth: 1100, margin: '0 auto' }}>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              style={{
                border: '1px solid var(--border)', padding: 24, background: 'var(--card)',
                transition: 'all 0.3s', opacity: isVisible('features') ? 1 : 0,
                transform: isVisible('features') ? 'translateY(0)' : 'translateY(20px)',
                transitionDelay: `${i * 50}ms`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.background = 'var(--card-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card)' }}
            >
              <div style={{ marginBottom: 12 }}><FeatureIcon d={ICON_PATHS[f.icon as keyof typeof ICON_PATHS]} /></div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: '0.06em', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── ROLES ─── */}
      <section id="roles" data-animate style={{ padding: 'clamp(60px, 10vw, 100px) clamp(16px, 4vw, 48px)', borderTop: '1px solid var(--border)', position: 'relative', zIndex: 5 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--fg-dim)', textTransform: 'uppercase', marginBottom: 12 }}>For Everyone</div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(36px, 6vw, 56px)', letterSpacing: '0.06em', WebkitTextStroke: '0.8px currentColor', paintOrder: 'stroke fill' }}>BUILT FOR EVERY ROLE</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16, maxWidth: 1100, margin: '0 auto' }}>
          {ROLES.map((r) => (
            <Link
              key={r.role}
              href={`/login?role=${r.role}`}
              onMouseEnter={() => setHover(r.role)}
              onMouseLeave={() => setHover(null)}
              style={{
                padding: 28, cursor: 'pointer', textDecoration: 'none', color: 'var(--fg)',
                background: hover === r.role ? 'rgba(128,128,128,0.08)' : 'var(--card)',
                border: `1px solid ${hover === r.role ? 'var(--border-hover)' : 'var(--border)'}`,
                transition: 'all 0.25s', display: 'flex', flexDirection: 'column', gap: 16,
                opacity: isVisible('roles') ? 1 : 0,
                transform: isVisible('roles') ? 'translateY(0)' : 'translateY(20px)',
              }}
            >
              <div style={{ marginBottom: 4 }}><FeatureIcon d={ROLE_ICONS[r.icon as keyof typeof ROLE_ICONS]} size={32} /></div>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: '0.12em', marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>{r.sub}</div>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {r.features.map(f => (
                  <li key={f} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--success)', fontSize: 10 }}>◈</span> {f}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section data-animate id="how" style={{ padding: 'clamp(60px, 10vw, 100px) clamp(16px, 4vw, 48px)', borderTop: '1px solid var(--border)', position: 'relative', zIndex: 5 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--fg-dim)', textTransform: 'uppercase', marginBottom: 12 }}>Quick Start</div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(36px, 6vw, 56px)', letterSpacing: '0.06em', WebkitTextStroke: '0.8px currentColor', paintOrder: 'stroke fill' }}>HOW IT WORKS</h2>
        </div>
        <div style={{ display: 'flex', gap: 0, maxWidth: 900, margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { step: '01', title: 'Register', desc: 'Create your account as Student, Teacher, or Parent.' },
            { step: '02', title: 'Dashboard', desc: 'Access your role-specific dashboard with all modules.' },
            { step: '03', title: 'Learn & Teach', desc: 'Take tests, upload courses, join live classes, earn XP.' },
            { step: '04', title: 'Track Progress', desc: 'Analytics, leaderboards, certificates, and report cards.' },
          ].map((s, i) => (
            <div key={s.step} style={{
              flex: '1 1 200px', padding: 28, borderRight: i < 3 ? '1px solid var(--border)' : 'none',
              borderBottom: '1px solid var(--border)', borderLeft: i === 0 ? '1px solid var(--border)' : 'none',
              borderTop: '1px solid var(--border)',
              opacity: isVisible('how') ? 1 : 0,
              transform: isVisible('how') ? 'translateY(0)' : 'translateY(20px)',
              transition: `all 0.4s ${i * 100}ms`,
            }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 48, color: 'var(--fg-muted)', lineHeight: 1, marginBottom: 12 }}>{s.step}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: '0.06em', marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section style={{ padding: 'clamp(60px, 10vw, 100px) clamp(16px, 4vw, 48px)', borderTop: '1px solid var(--border)', textAlign: 'center', position: 'relative', zIndex: 5 }}>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(36px, 6vw, 56px)', letterSpacing: '0.06em', marginBottom: 16, WebkitTextStroke: '0.8px currentColor', paintOrder: 'stroke fill' }}>READY TO START?</h2>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 16, color: 'var(--fg-dim)', maxWidth: 400, margin: '0 auto 32px', lineHeight: 1.6 }}>
          Join QGX and transform how your classroom learns, teaches, and grows.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" className="btn btn-primary" style={{ padding: '14px 40px', fontSize: 13 }}>
            Create Account
          </Link>
          <Link href="/login" className="btn" style={{ padding: '14px 40px', fontSize: 13 }}>
            Sign In
          </Link>
        </div>
      </section>

      {/* ─── TECH STACK ─── */}
      <section style={{ borderTop: '1px solid var(--border)', padding: '32px clamp(16px, 4vw, 48px)', position: 'relative', zIndex: 5 }}>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
          {['Next.js', 'React', 'TypeScript', 'Supabase', 'PostgreSQL', 'Groq AI', 'PWA'].map(t => (
            <span key={t} style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--fg-muted)', textTransform: 'uppercase' }}>{t}</span>
          ))}
        </div>
      </section>

      {/* ─── TEST ACCOUNTS ─── */}
      <section style={{ borderTop: '1px solid var(--border)', padding: '40px clamp(16px, 4vw, 48px)', position: 'relative', zIndex: 5, background: 'rgba(128,128,128,0.03)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--fg-muted)', textTransform: 'uppercase', marginBottom: 6 }}>◈ Demo Access</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>One-click login with seeded test accounts</div>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 900, margin: '0 auto' }}>
          {([
            { role: 'Admin',   email: 'admin@qgx.demo',    password: 'QGX@admin2024',   name: 'Dr. Sarah Mitchell',  color: 'var(--danger)' },
            { role: 'Teacher', email: 'teacher1@qgx.demo', password: 'QGX@teacher2024', name: 'Prof. James Carter',  color: 'rgba(100,180,255,0.9)' },
            { role: 'Student', email: 'student1@qgx.demo', password: 'QGX@student2024', name: 'Alex Johnson',        color: 'var(--success)' },
            { role: 'Parent',  email: 'parent1@qgx.demo',  password: 'QGX@parent2024',  name: 'David Johnson',       color: 'var(--warn)' },
          ] as const).map(acc => (
            <div key={acc.role} style={{ flex: '1 1 180px', maxWidth: 210, border: '1px solid var(--border)', background: 'var(--card)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.15em', color: acc.color, border: `1px solid ${acc.color}`, padding: '2px 7px', textTransform: 'uppercase' }}>{acc.role}</span>
              </div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--fg)' }}>{acc.name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', wordBreak: 'break-all' }}>{acc.email}</div>
              <button
                disabled={loggingIn === acc.role}
                onClick={() => loginAs(acc.email, acc.password, acc.role)}
                style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', cursor: loggingIn === acc.role ? 'not-allowed' : 'pointer', padding: '7px 12px', border: `1px solid ${acc.color}`, background: 'transparent', color: acc.color, textTransform: 'uppercase', opacity: loggingIn && loggingIn !== acc.role ? 0.4 : 1, transition: 'opacity 0.2s' }}
              >
                {loggingIn === acc.role ? '▷ Signing in…' : '→ Login as ' + acc.role}
              </button>
            </div>
          ))}
        </div>
        {loginError && <div style={{ textAlign: 'center', marginTop: 16, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--danger)' }}>{loginError}</div>}
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '20px clamp(16px, 4vw, 48px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 5, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em' }}>QGX © {new Date().getFullYear()}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em' }}>QUERY GEN X — LEARNING MANAGEMENT SYSTEM</span>
      </footer>
    </div>
  )
}
