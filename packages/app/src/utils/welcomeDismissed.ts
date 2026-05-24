import { safeGetItem, safeRemoveItem, safeSetItem } from './storage'

const WELCOME_DISMISSED_KEY = 'chaos-master-welcome-dismissed'

export function hasWelcomeBeenDismissed(): boolean {
  // In dev mode (VITE_SHOW_WELCOME_ON_STARTUP=true), always show welcome
  if (import.meta.env.VITE_SHOW_WELCOME_ON_STARTUP === 'true') {
    return false
  }
  try {
    return safeGetItem(WELCOME_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function dismissWelcome(): void {
  try {
    safeSetItem(WELCOME_DISMISSED_KEY, 'true')
  } catch {
    // ignore
  }
}

export function resetWelcomeDismissal(): void {
  try {
    safeRemoveItem(WELCOME_DISMISSED_KEY)
  } catch {
    // ignore
  }
}
