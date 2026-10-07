// The save reminder after five minutes of editing: once a run, and held while a view with its own top bar covers the editor.
import { createEffect, on } from 'solid-js'
import { editorCovered } from '@/arcade/editorCover'
import { saveReminderDismissed, setSaveReminderDismissed, } from '@/utils/autosaveSettings'
import type { AutosaveQuestionParams } from './autosaveQuestion'

export const SAVE_REMINDER =
  'Enjoying this flame? Save it for later, export a PNG, or share a link from the actions bar.'
const REMINDER_AFTER_MS = 5 * 60_000
const REMINDER_SHOWN_MS = 12_000

type SaveReminderParams = Pick<
  AutosaveQuestionParams,
  'agentDriving' | 'showToast' | 'dismissToast'
>

/**
 * The reminder has a button ("Don't show again"), so like the auto-save
 * question (hooks/autosaveQuestion.ts) it could land over the Arena or the
 * hub and take a click meant for their top bar. It waits while a view with
 * its own top bar covers the editor, and one still on screen when such a view
 * opens is taken down and shown again once the viewer is back. One that had
 * already run its 12 s is not shown again.
 */
export function createSaveReminder(params: SaveReminderParams) {
  let shown = false
  /** The reminder on screen, and when it went up, until it times out. */
  let onScreen: { id: number; at: number } | undefined

  createEffect(
    on(
      editorCovered,
      (covered) => {
        if (!covered || onScreen === undefined) return
        const { id, at } = onScreen
        onScreen = undefined
        if (Date.now() - at >= REMINDER_SHOWN_MS) return
        params.dismissToast(id)
        shown = false
      },
      { defer: true },
    ),
  )

  /** Show the reminder if it is due.
   *  @param editingSince when the run's editing started, or null. */
  const poll = (editingSince: number | null) => {
    if (
      shown ||
      saveReminderDismissed() ||
      params.agentDriving() ||
      editorCovered() ||
      editingSince === null ||
      Date.now() - editingSince < REMINDER_AFTER_MS
    )
      return
    const id = params.showToast(SAVE_REMINDER, REMINDER_SHOWN_MS, [
      {
        label: "Don't show again",
        onClick: () => {
          onScreen = undefined
          setSaveReminderDismissed(true)
        },
      },
    ])
    // A muted store shows nothing and returns -1, and this is the only
    // reminder the run gets.
    if (id === -1) return
    shown = true
    onScreen = { id, at: Date.now() }
  }

  return { poll }
}
