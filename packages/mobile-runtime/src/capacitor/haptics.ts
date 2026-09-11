/**
 * The Capacitor binding of the haptic ports. Only the native build reaches
 * this module, through the guarded dynamic import in the app's lib/haptics.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import type { HapticPorts } from '../haptics'

const IMPACT = { light: ImpactStyle.Light, medium: ImpactStyle.Medium } as const
const NOTIFICATION = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
} as const

export const hapticPorts: HapticPorts = {
  impact: (strength) => Haptics.impact({ style: IMPACT[strength] }),
  notification: (kind) => Haptics.notification({ type: NOTIFICATION[kind] }),
  selectionStart: () => Haptics.selectionStart(),
  selectionChanged: () => Haptics.selectionChanged(),
  selectionEnd: () => Haptics.selectionEnd(),
}
