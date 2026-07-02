/**
 * Safe wrapper around localStorage to prevent crashes in incognito mode
 * or when the storage quota is exceeded.
 */

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** @returns false when the write failed (private mode, quota exceeded) so
 *  callers that track "saved" state don't mark data clean that never landed. */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e) {
    console.warn(`[storage] Failed to save ${key} to localStorage:`, e)
    return false
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    console.warn(`[storage] Failed to remove ${key} from localStorage:`, e)
  }
}
