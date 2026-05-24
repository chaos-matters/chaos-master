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

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    console.warn(`[storage] Failed to save ${key} to localStorage:`, e)
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    console.warn(`[storage] Failed to remove ${key} from localStorage:`, e)
  }
}
