import { supabase } from '@/lib/supabase'

const MAX_ACTIVITY_MESSAGE_LENGTH = 500
const MAX_ACTIVITY_TYPE_LENGTH = 48

function sanitizeActivityMessage(message: string): string {
  return message.trim().replace(/\s+/g, ' ').slice(0, MAX_ACTIVITY_MESSAGE_LENGTH)
}

function sanitizeActivityType(type: string): string {
  const normalized = type
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_ACTIVITY_TYPE_LENGTH)
  return normalized || 'info'
}

export async function pushNotification(
  userId: string,
  message: string,
  type: string
): Promise<{ error: string | null }> {
  if (!userId || !message) return { error: 'Missing userId or message' }
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      message,
      type,
      read: false,
    })
    return { error: error?.message || null }
  } catch (err) {
    return { error: (err as any)?.message || 'Notification failed' }
  }
}

/** Batch-insert notifications for multiple users at once */
export async function pushNotificationBatch(
  userIds: string[],
  message: string,
  type: string
): Promise<{ error: string | null; failedCount: number }> {
  if (!userIds.length) return { error: null, failedCount: 0 }
  
  try {
    const { error } = await supabase.from('notifications').insert(
      userIds.map(userId => ({
        user_id: userId,
        message,
        type,
        read: false,
      }))
    )
    if (error) return { error: error.message, failedCount: userIds.length }
    return { error: null, failedCount: 0 }
  } catch (err) {
    return { error: (err as any)?.message || 'Notification failed', failedCount: userIds.length }
  }
}

export async function logActivity(message: string, type: string): Promise<{ error: string | null }> {
  const sanitizedMessage = sanitizeActivityMessage(message)
  if (!sanitizedMessage) {
    return { error: 'Activity message is required' }
  }

  const sanitizedType = sanitizeActivityType(type)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('activity_log').insert({
    message: sanitizedMessage,
    type: sanitizedType,
    actor_id: user?.id ?? null,
  })
  return { error: error?.message || null }
}
