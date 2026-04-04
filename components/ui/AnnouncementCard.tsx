'use client'
import { Icon } from '@/components/ui/Icon'
import { sanitizeText } from '@/lib/utils'
import type { Announcement } from '@/types'

export function AnnouncementCard({ a, canDelete, onDelete, canEdit, onEdit, canPin, onTogglePin }: {
  a: Announcement
  canDelete: boolean
  onDelete?: (id: string) => void
  canEdit?: boolean
  onEdit?: (announcement: Announcement) => void
  canPin?: boolean
  onTogglePin?: (announcement: Announcement) => void
}) {
  const createdAt = a.created_at ? new Date(a.created_at) : null
  const dateLabel = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString() : 'Unknown date'
  const targetLabel = a.target === 'all' ? 'All' : a.target === 'students' ? 'Students' : a.target === 'parents' ? 'Parents' : 'Teachers'

  return (
    <div className="announce-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="ac-meta">
            {a.pinned && '● PINNED · '}
            <span style={{ textTransform: 'uppercase' }}>{a.role}</span> · {a.author_name} · {dateLabel}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px', marginBottom: 8 }}>
            <Icon name="bell" size={10} />
            For {targetLabel}
          </div>
          <div className="ac-title">{sanitizeText(a.title)}</div>
          <div className="ac-body">{sanitizeText(a.body)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
          {canPin && onTogglePin && (
            <button className="btn btn-xs" onClick={() => onTogglePin(a)} title={a.pinned ? 'Unpin announcement' : 'Pin announcement'}>
              <Icon name={a.pinned ? 'star' : 'star'} size={11} />
            </button>
          )}
          {canEdit && onEdit && (
            <button className="btn btn-xs" onClick={() => onEdit(a)} title="Edit announcement">
              <Icon name="edit" size={11} />
            </button>
          )}
          {canDelete && onDelete && (
            <button className="btn btn-xs btn-danger" onClick={() => onDelete(a.id)} title="Delete announcement">
              <Icon name="trash" size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
