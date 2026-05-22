import { validateFlame } from '@/flame/schema/flameSchema'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const STORAGE_KEY = 'chaos-master-recent-flames'
const MAX_RECENT_FLAMES = 10

export type RecentFlame = {
  id: string
  name: string
  flame: FlameDescriptor
  savedAt: number
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
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidRecentFlame).map((item) => ({
      ...item,
      flame: validateFlame(item.flame),
    }))
  } catch {
    return []
  }
}

export function saveRecentFlame(flame: FlameDescriptor, name?: string): void {
  const recent = loadRecentFlames()
  const id = generateId()
  const entry: RecentFlame = {
    id,
    name: name ?? `Flame ${new Date().toLocaleDateString()}`,
    flame: JSON.parse(JSON.stringify(flame)),
    savedAt: Date.now(),
  }
  const updated = [entry, ...recent].slice(0, MAX_RECENT_FLAMES)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function deleteRecentFlame(id: string): void {
  const recent = loadRecentFlames()
  const filtered = recent.filter((item) => item.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}

export function clearRecentFlames(): void {
  localStorage.removeItem(STORAGE_KEY)
}
