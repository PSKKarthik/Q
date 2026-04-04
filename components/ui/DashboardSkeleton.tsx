'use client'

export function DashboardSkeleton({ label = 'Loading dashboard...' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 24, minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ width: 180, height: 18, borderRadius: 6, background: 'rgba(255,255,255,0.08)', animation: 'pulse 1.2s infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 66, borderRadius: 8, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.2s infinite' }} />
        ))}
      </div>
      <div style={{ height: 120, borderRadius: 10, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.2s infinite' }} />
      <div style={{ height: 220, borderRadius: 10, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.2s infinite' }} />
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>{label.toUpperCase()}</div>
    </div>
  )
}
