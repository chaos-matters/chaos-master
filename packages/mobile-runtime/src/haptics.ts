/**
 * The haptic vocabulary: five sensations, one meaning each (DESIGN.md,
 * motion section 1). Light impact: a discrete, reversible thing happened.
 * Medium impact: a committing thing. Selection: a value or a destination
 * crossed a stop. Notification: the outcome of work the app did for the user.
 * Heavy impact is deliberately unused in v1.
 *
 * Calls are never awaited: a bridge round trip must not sit in front of a
 * visual change. The platform sits behind `HapticPorts`, so this runs in
 * tests against a fake; `./capacitor/haptics` binds it to the plugin.
 */
export type ImpactStrength = 'light' | 'medium'
export type NotificationKind = 'success' | 'warning' | 'error'

export interface HapticPorts {
  impact: (strength: ImpactStrength) => Promise<void>
  notification: (kind: NotificationKind) => Promise<void>
  selectionStart: () => Promise<void>
  selectionChanged: () => Promise<void>
  selectionEnd: () => Promise<void>
}

export interface Haptics {
  impactLight(): void
  impactMedium(): void
  success(): void
  warning(): void
  error(): void
  selectionStart(): void
  selectionChanged(): void
  selectionEnd(): void
}

/** A slider scrubbed at 120 Hz must not buzz continuously. */
export const SELECTION_MIN_INTERVAL_MS = 60

const swallow = (): undefined => undefined

export function hapticsWith(
  ports: HapticPorts,
  isEnabled: () => boolean,
  now: () => number = () => Date.now(),
): Haptics {
  let lastSelection = -Infinity
  const fire = (call: () => Promise<void>) => {
    if (!isEnabled()) return
    // A suppressed or failed haptic is not an error the user should hear about.
    call().catch(swallow)
  }
  return {
    impactLight: () => {
      fire(() => ports.impact('light'))
    },
    impactMedium: () => {
      fire(() => ports.impact('medium'))
    },
    success: () => {
      fire(() => ports.notification('success'))
    },
    warning: () => {
      fire(() => ports.notification('warning'))
    },
    error: () => {
      fire(() => ports.notification('error'))
    },
    selectionStart: () => {
      fire(() => ports.selectionStart())
    },
    selectionChanged: () => {
      const t = now()
      if (t - lastSelection < SELECTION_MIN_INTERVAL_MS) return
      lastSelection = t
      fire(() => ports.selectionChanged())
    },
    selectionEnd: () => {
      fire(() => ports.selectionEnd())
    },
  }
}

const noop = (): void => undefined

/** The web, and the native app before the plugin has loaded. */
export const NO_HAPTICS: Haptics = {
  impactLight: noop,
  impactMedium: noop,
  success: noop,
  warning: noop,
  error: noop,
  selectionStart: noop,
  selectionChanged: noop,
  selectionEnd: noop,
}
