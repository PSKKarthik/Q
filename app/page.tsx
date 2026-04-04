'use client'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme'

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

const FEATURES = [
  { icon: '📝', title: 'Smart Assessments', desc: 'MCQ, MSQ, True/False, Fill-in-the-Blank, Match — with anti-cheat, timers, and ghost scoring.' },
  { icon: '🤖', title: 'AI Tutor', desc: 'Ask questions, get explanations, and auto-generate test questions powered by LLaMA.' },
  { icon: '📚', title: 'Course Management', desc: 'Upload materials, organize sections, track student progress and completion rates.' },
  { icon: '🏆', title: 'XP & Gamification', desc: 'Earn XP from tests, check-ins, and quests. Level up from Rookie to Immortal.' },
  { icon: '📊', title: 'Analytics Dashboard', desc: 'Performance trends, score distributions, moving averages, and CSV exports.' },
  { icon: '💬', title: 'Forums & Messaging', desc: 'Discussion boards with flairs, best answers, bookmarks, and real-time DMs.' },
  { icon: '📅', title: 'Timetable & Calendar', desc: 'Weekly schedules, event tracking, month/week views, and XP check-ins.' },
  { icon: '🎥', title: 'Live Classes', desc: 'Video conferencing with Jitsi integration — no accounts needed for students.' },
  { icon: '📋', title: 'Assignments', desc: 'Create, submit, grade with priority levels, late detection, and file uploads.' },
  { icon: '🛡️', title: 'Anti-Cheat Engine', desc: 'Tab-switch detection, copy-paste blocking, fullscreen mode, and randomization.' },
  { icon: '👨‍👩‍👧', title: 'Parent Portal', desc: 'Monitor linked students — view grades, attendance, and timetables in real time.' },
  { icon: '🏅', title: 'Certificates', desc: 'Auto-generated canvas certificates for course completion, downloadable and shareable.' },
]

const ROLES = [
  { role: 'student', label: 'S T U D E N T', sub: 'Learn & Attempt', icon: '🎓', features: ['Take tests & quizzes', 'Track XP & leaderboard', 'Join courses & forums', 'AI-powered tutoring'] },
  { role: 'teacher', label: 'T E A C H E R', sub: 'Create & Manage', icon: '📖', features: ['Create assessments', 'Manage courses', 'Grade assignments', 'Live classes & analytics'] },
  { role: 'admin',   label: 'A D M I N',   sub: 'Oversee & Control', icon: '⚙️', features: ['User management', 'Platform settings', 'Activity monitoring', 'Batch operations'] },
  { role: 'parent',  label: 'P A R E N T',  sub: 'Monitor & Support', icon: '👁️', features: ['Link to students', 'View grades & attendance', 'Track progress', 'Stay informed'] },
]

export default function Home() {
  const [hover, setHover] = useState<string | null>(null)
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const { theme, toggleTheme } = useTheme()

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
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <Link href="/login" className="btn btn-sm">Login</Link>
          <Link href="/register" className="btn btn-primary btn-sm">Register</Link>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'clamp(60px, 12vw, 120px) clamp(16px, 4vw, 48px) clamp(40px, 8vw, 80px)', position: 'relative', zIndex: 5 }}>
        <div className="fade-up" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 24, height: 1, background: 'var(--fg-dim)', display: 'inline-block' }} />
          Query Gen X — Learning Management System
          <span style={{ width: 24, height: 1, background: 'var(--fg-dim)', display: 'inline-block' }} />
        </div>
        <h1 className="fade-up-1" style={{ fontFamily: 'var(--display)', fontSize: 'clamp(80px,14vw,160px)', letterSpacing: '0.1em', lineHeight: 0.85, marginBottom: 32 }}>
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
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(36px, 6vw, 56px)', letterSpacing: '0.06em' }}>FEATURES</h2>
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
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
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
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(36px, 6vw, 56px)', letterSpacing: '0.06em' }}>BUILT FOR EVERY ROLE</h2>
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
              <div style={{ fontSize: 32 }}>{r.icon}</div>
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
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(36px, 6vw, 56px)', letterSpacing: '0.06em' }}>HOW IT WORKS</h2>
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
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(36px, 6vw, 56px)', letterSpacing: '0.06em', marginBottom: 16 }}>READY TO START?</h2>
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

      {/* ─── FOOTER ─── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '20px clamp(16px, 4vw, 48px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 5, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em' }}>QGX © {new Date().getFullYear()}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em' }}>QUERY GEN X — LEARNING MANAGEMENT SYSTEM</span>
      </footer>
    </div>
  )
}
