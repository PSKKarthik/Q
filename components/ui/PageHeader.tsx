import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <>
      <div className="page-title fade-up">{title}</div>
      {subtitle && <div className="page-sub fade-up-1" style={{ marginBottom: 28 }}>{subtitle}</div>}
    </>
  )
}
