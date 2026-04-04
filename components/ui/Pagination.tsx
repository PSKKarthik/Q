interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
      <button className="btn btn-xs" disabled={page === 0} onClick={() => onPageChange(page - 1)}>← Prev</button>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, lineHeight: '28px' }}>{page + 1} / {totalPages}</span>
      <button className="btn btn-xs" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>Next →</button>
    </div>
  )
}
