// The auto-save question: asked once a run in the editor, and held while a view with its own top bar covers the editor.
import { createEffect, on } from 'solid-js'
import { editorCovered } from '@/arcade/editorCover'
import { setAutosaveRecents } from '@/utils/autosaveSettings'

export const AUTOSAVE_QUESTION =
  'Auto-save your flames to Recents while you edit?'

export interface AutosaveQuestionParams {
  agentDriving: () => boolean
  /** The toast store's: returns the id, or -1 when nothing was shown. */
  showToast: (
    message: string,
    duration?: number | 'sticky',
    actions?: Array<{ label: string; onClick: () => void }>,
  ) => number
  dismissToast: (id: number) => void
  /** Yes was answered, and the setting is already on. */
  onYes: () => void
}

/**
 * On a real GPU the question landed over the Arena, in the toast column at
 * the top right where the Arena's own top bar is, and took the click meant
 * for Exit Arena. So while a view with its own top bar covers the editor
 * (arcade/editorCover.ts) the question waits, and one already on screen is
 * taken down and asked again once the viewer is back in the editor. Only the
 * timing changes: the answer and where it is stored stay as they were.
 */
export function createAutosaveQuestion(params: AutosaveQuestionParams) {
  let asked = false
  /** The question on screen, until it is answered or taken down. */
  let toastId: number | undefined

  createEffect(
    on(
      editorCovered,
      (covered) => {
        if (!covered || toastId === undefined) return
        params.dismissToast(toastId)
        toastId = undefined
        asked = false
      },
      { defer: true },
    ),
  )

  /** Ask, unless it was asked already or the editor is not in view.
   *  @returns whether this call asked. */
  const ask = (): boolean => {
    if (asked || params.agentDriving() || editorCovered()) return false
    asked = true
    const id = params.showToast(AUTOSAVE_QUESTION, 'sticky', [
      {
        label: 'Yes',
        onClick: () => {
          toastId = undefined
          setAutosaveRecents('on')
          params.onYes()
        },
      },
      {
        label: 'No',
        onClick: () => {
          toastId = undefined
          setAutosaveRecents('off')
        },
      },
    ])
    if (id !== -1) toastId = id
    return true
  }

  return { ask }
}
