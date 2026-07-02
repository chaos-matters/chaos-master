import { persistentSignal } from './persistentSignal'

/**
 * Periodic autosave of the active flame into Recent flames.
 * 'unset' = the user hasn't decided yet — the first time an edit would be
 * autosaved, a toast asks whether to enable it; the answer persists here.
 * Save-on-unload (tab close/reload with unsaved changes) is independent of
 * this setting and always on, so work is never silently lost.
 */
export const [autosaveRecents, setAutosaveRecents] = persistentSignal<
  'unset' | 'on' | 'off'
>('editor/autosave-recents', 'unset')

/** Minutes between periodic autosaves (when enabled). */
export const [autosaveIntervalMin, setAutosaveIntervalMin] = persistentSignal(
  'editor/autosave-interval-min',
  2,
)

/** Permanent opt-out for the "you can save/export your flame" reminder. */
export const [saveReminderDismissed, setSaveReminderDismissed] =
  persistentSignal('editor/save-reminder-dismissed', false)
