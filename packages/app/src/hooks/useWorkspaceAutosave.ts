import { onCleanup } from 'solid-js'
import { autosaveIntervalMin, autosaveRecents, saveReminderDismissed, setAutosaveRecents, setSaveReminderDismissed, } from '@/utils/autosaveSettings'
import { upsertRecentFlame } from '@/utils/recentFlames'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

export interface UseWorkspaceAutosaveParams {
  flameDescriptor: FlameDescriptor
  getTracks: () => TimelineTrack[] | undefined
  agentDriving: () => boolean
  showToast: (
    message: string,
    duration?: number | 'sticky',
    actions?: Array<{ label: string; onClick: () => void }>,
  ) => void
}

export function useWorkspaceAutosave(params: UseWorkspaceAutosaveParams) {
  const { flameDescriptor, getTracks, agentDriving, showToast } = params

  const newAutosaveId = () =>
    `autosave-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  let autosaveSessionId = newAutosaveId()
  const autosaveSnapshot = () =>
    JSON.stringify({ flame: flameDescriptor, tracks: getTracks() })
  let autosaveBaseline = autosaveSnapshot()
  let editingSince: number | null = null
  let lastAutosaveAt = 0
  let reminderShown = false
  let autosavePromptShown = false

  const isFlameDirty = () => autosaveSnapshot() !== autosaveBaseline
  const markSavedBaseline = () => {
    autosaveBaseline = autosaveSnapshot()
  }
  const markLoadedBaseline = () => {
    autosaveBaseline = autosaveSnapshot()
    editingSince = null
    autosaveSessionId = newAutosaveId()
  }

  const autosaveNow = () => {
    const saved = upsertRecentFlame(
      autosaveSessionId,
      flameDescriptor,
      undefined,
      getTracks(),
    )
    if (!saved) return
    lastAutosaveAt = Date.now()
    markSavedBaseline()
  }

  const flushDirtyToRecents = () => {
    if (isFlameDirty()) autosaveNow()
  }

  const saveOnPagehide = () => {
    flushDirtyToRecents()
  }
  window.addEventListener('pagehide', saveOnPagehide)
  onCleanup(() => {
    window.removeEventListener('pagehide', saveOnPagehide)
  })

  const AUTOSAVE_POLL_MS = 30_000
  const REMINDER_AFTER_MS = 5 * 60_000
  const autosavePoll = setInterval(() => {
    const dirty = isFlameDirty()
    if (dirty && editingSince === null) editingSince = Date.now()

    if (
      dirty &&
      autosaveRecents() === 'unset' &&
      !autosavePromptShown &&
      !agentDriving()
    ) {
      autosavePromptShown = true
      showToast('Auto-save your flames to Recents while you edit?', 'sticky', [
        {
          label: 'Yes',
          onClick: () => {
            setAutosaveRecents('on')
            flushDirtyToRecents()
          },
        },
        { label: 'No', onClick: () => setAutosaveRecents('off') },
      ])
      return
    }

    if (dirty && autosaveRecents() === 'on') {
      const intervalMs = Math.max(1, autosaveIntervalMin()) * 60_000
      if (Date.now() - lastAutosaveAt >= intervalMs) autosaveNow()
    }

    if (
      !reminderShown &&
      !saveReminderDismissed() &&
      !agentDriving() &&
      editingSince !== null &&
      Date.now() - editingSince >= REMINDER_AFTER_MS
    ) {
      reminderShown = true
      showToast(
        'Enjoying this flame? Save it for later, export a PNG, or share a link from the actions bar.',
        12000,
        [
          {
            label: "Don't show again",
            onClick: () => setSaveReminderDismissed(true),
          },
        ],
      )
    }
  }, AUTOSAVE_POLL_MS)

  onCleanup(() => {
    clearInterval(autosavePoll)
  })

  return {
    isFlameDirty,
    markSavedBaseline,
    markLoadedBaseline,
    autosaveNow,
    flushDirtyToRecents,
  }
}
