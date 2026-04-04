import { supabase } from './supabase'

export async function pushNotification(
  userId: string,
  message: string,
  type: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    message,
    type,
    read: false,
  })
  return { error: error?.message || null }
}

/** Batch-insert notifications for multiple users at once */
export async function pushNotificationBatch(
  userIds: string[],
  message: string,
  type: string
): Promise<{ error: string | null; failedCount: number }> {
  if (!userIds.length) return { error: null, failedCount: 0 }
  const rows = userIds.map(uid => ({ user_id: uid, message, type, read: false }))
  const { error } = await supabase.from('notifications').insert(rows)
  return { error: error?.message || null, failedCount: error ? userIds.length : 0 }
}

export async function logActivity(message: string, type: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('activity_log').insert({ message, type })
  return { error: error?.message || null }
}
