import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { safeGetItem, safeRemoveItem, safeSetItem } from '@/utils/storage'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

const STORAGE_KEY = 'chaos-master-recent-flames'
export const MAX_RECENT_FLAMES = 150

export type RecentFlame = {
  id: string
  name: string
  flame: FlameDescriptor
  savedAt: number
  tracks?: TimelineTrack[]
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function isValidRecentFlame(item: unknown): item is RecentFlame {
  if (typeof item !== 'object' || item === null) return false
  const obj = item as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.savedAt === 'number' &&
    typeof obj.flame === 'object'
  )
}

export function loadRecentFlames(): RecentFlame[] {
  try {
    const raw = safeGetItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidRecentFlame).flatMap((item) => {
      const flame = tryValidateFlame(item.flame)
      return flame ? [{ ...item, flame }] : []
    })
  } catch {
    return []
  }
}

export function saveRecentFlame(
  flame: FlameDescriptor,
  name?: string,
  tracks?: TimelineTrack[],
  forceOverwriteOldest: boolean = true,
): boolean {
  const recent = loadRecentFlames()
  if (recent.length >= MAX_RECENT_FLAMES && !forceOverwriteOldest) {
    return false
  }
  const id = generateId()
  const entry: RecentFlame = {
    id,
    name: name || flame.metadata?.name || 'Flame',
    flame: deepClone(flame),
    savedAt: Date.now(),
  }
  // Only store tracks when there are actual keyframes
  if (tracks && tracks.length > 0) {
    entry.tracks = deepClone(tracks)
  }
  const updated = [entry, ...recent].slice(0, MAX_RECENT_FLAMES)
  safeSetItem(STORAGE_KEY, JSON.stringify(updated))
  return true
}

export function getOldestRecentFlame(): RecentFlame | undefined {
  const recent = loadRecentFlames()
  if (recent.length === 0) return undefined
  return recent[recent.length - 1]
}

/**
 * Compact date+time label for recent flames.
 * Returns e.g. "May 26, 14:30" or "Today, 14:30" / "Yesterday, 09:15"
 */
export function formatRecentDate(timestamp: number): string {
  const d = new Date(timestamp)
  const now = new Date()
  const hours = d.getHours().toString().padStart(2, '0')
  const mins = d.getMinutes().toString().padStart(2, '0')
  const time = `${hours}:${mins}`

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()

  if (isToday) return `Today, ${time}`
  if (isYesterday) return `Yesterday, ${time}`

  const month = d.toLocaleDateString(undefined, { month: 'short' })
  const day = d.getDate()
  return `${month} ${day}, ${time}`
}

export function deleteRecentFlame(id: string): void {
  const recent = loadRecentFlames()
  const filtered = recent.filter((item) => item.id !== id)
  safeSetItem(STORAGE_KEY, JSON.stringify(filtered))
}

export function clearRecentFlames(): void {
  safeRemoveItem(STORAGE_KEY)
}
