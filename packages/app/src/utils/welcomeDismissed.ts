const WELCOME_DISMISSED_KEY = 'chaos-master-welcome-dismissed'

export function hasWelcomeBeenDismissed(): boolean {
  // In dev mode (VITE_SHOW_WELCOME_ON_STARTUP=true), always show welcome
  if (import.meta.env.VITE_SHOW_WELCOME_ON_STARTUP === 'true') {
    return false
  }
  try {
    return localStorage.getItem(WELCOME_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function dismissWelcome(): void {
  try {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true')
  } catch {
    // ignore
  }
}

export function resetWelcomeDismissal(): void {
  try {
    localStorage.removeItem(WELCOME_DISMISSED_KEY)
  } catch {
    // ignore
  }
}
