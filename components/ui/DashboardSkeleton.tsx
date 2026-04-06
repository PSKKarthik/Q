'use client'

const SHIMMER: React.CSSProperties = { background: 'rgba(255,255,255,0.07)', animation: 'pulse 1.3s ease-in-out infinite', borderRadius: 6 }

export function DashboardSkeleton({ label = 'Loading dashboard...' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar skeleton */}
      <div style={{ width: 220, minHeight: '100vh', borderRight: '1px solid var(--border)', padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <div style={{ ...SHIMMER, height: 32, width: '70%', marginBottom: 8 }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ ...SHIMMER, height: 28, width: `${60 + (i % 3) * 15}%` }} />
        ))}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar skeleton */}
        <div style={{ height: 52, borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...SHIMMER, height: 16, width: 140 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ ...SHIMMER, height: 28, width: 28, borderRadius: '50%' }} />
            <div style={{ ...SHIMMER, height: 28, width: 64 }} />
          </div>
        </div>

        {/* Content skeleton */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ ...SHIMMER, height: 72, borderRadius: 10 }} />
            ))}
          </div>
          {/* Content blocks */}
          <div style={{ ...SHIMMER, height: 130, borderRadius: 10 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ ...SHIMMER, height: 180, borderRadius: 10 }} />
            <div style={{ ...SHIMMER, height: 180, borderRadius: 10 }} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.1em', marginTop: 4 }}>
            {label.toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  )
}
