interface SectionLabelProps {
  children: React.ReactNode
  className?: string
}

export function SectionLabel({ children, className = '' }: SectionLabelProps) {
  return (
    <div
      className={className}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--fg-dim)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  )
}
