interface StatItem {
  label: string
  value: string | number
}

interface StatGridProps {
  items: StatItem[]
  columns?: 2 | 3 | 4 | 6
}

export function StatGrid({ items, columns = 4 }: StatGridProps) {
  return (
    <div className={`grid-${columns} fade-up-2`} style={{ marginBottom: 24 }}>
      {items.map(({ label, value }) => (
        <div key={label} className="stat-card">
          <div className="stat-val">{value}</div>
          <div className="stat-label">{label}</div>
        </div>
      ))}
    </div>
  )
}
