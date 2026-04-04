'use client'
import { Icon } from '@/components/ui/Icon'
import { sanitizeText } from '@/lib/utils'
import type { Announcement } from '@/types'

export function AnnouncementCard({ a, canDelete, onDelete }: {
  a: Announcement; canDelete: boolean; onDelete?: (id: string) => void
}) {
  return (
    <div className="announce-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="ac-meta">
            {a.pinned && '● PINNED · '}
            <span style={{ textTransform: 'uppercase' }}>{a.role}</span> · {a.author_name} · {a.created_at?.slice(0, 10)}
          </div>
          <div className="ac-title">{sanitizeText(a.title)}</div>
          <div className="ac-body">{sanitizeText(a.body)}</div>
        </div>
        {canDelete && onDelete && (
          <button className="btn btn-xs btn-danger" style={{ marginLeft: 12 }} onClick={() => onDelete(a.id)}>
            <Icon name="trash" size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
