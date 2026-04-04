import { supabase } from '@/lib/supabase'

const AVATAR_BUCKET = 'course-files'

function stripQuery(value: string): string {
  const q = value.indexOf('?')
  return q >= 0 ? value.slice(0, q) : value
}

export function extractAvatarStoragePath(value?: string | null): string | null {
  if (!value) return null

  const raw = value.trim()
  if (!raw) return null

  if (raw.startsWith('avatars/')) return raw

  const decoded = decodeURIComponent(raw)
  const publicMarker = `/storage/v1/object/public/${AVATAR_BUCKET}/`
  const signedMarker = `/storage/v1/object/sign/${AVATAR_BUCKET}/`

  const publicIdx = decoded.indexOf(publicMarker)
  if (publicIdx >= 0) {
    return stripQuery(decoded.slice(publicIdx + publicMarker.length))
  }

  const signedIdx = decoded.indexOf(signedMarker)
  if (signedIdx >= 0) {
    return stripQuery(decoded.slice(signedIdx + signedMarker.length))
  }

  return null
}

export async function resolveAvatarUrl(value?: string | null): Promise<string | null> {
  if (!value) return null

  const path = extractAvatarStoragePath(value)
  if (!path) return value

  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7)
  if (error || !data?.signedUrl) return value
  return data.signedUrl
}
