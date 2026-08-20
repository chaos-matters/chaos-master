import { batch } from 'solid-js'
import { deepClone } from '@/utils/clone'
import { useLoadFlameFromFile } from '@/utils/useLoadFlameFromFile'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { RecordedSession } from '@/recorder/schema'
import type { TimelineTrack } from '@/utils/timeline'

export function useAppDragAndDrop(
  history: { replace: (v: FlameDescriptor, label?: string) => void },
  setLoadedAnimation: (state: {
    flame: FlameDescriptor
    tracks: TimelineTrack[]
  }) => void,
  /** Offered the session and source file carried by a dropped artifact. */
  onSessionDropped?: (
    session: RecordedSession,
    sourceFile: File,
  ) => Promise<void> | void,
) {
  const loadFlameFromFile = useLoadFlameFromFile()

  async function onDrop(file: File) {
    const result = await loadFlameFromFile(file)
    if (!result) return
    // A bare .steps.json carries no flame: there is nothing to load, only a
    // session to offer against whatever is already open.
    if (!result.flame) {
      if (result.session) await onSessionDropped?.(result.session, file)
      return
    }
    const flame = result.flame
    batch(() => {
      history.replace(deepClone(flame), 'Drop flame')
      if (result.animation && result.animation.tracks.length > 0) {
        setLoadedAnimation({
          flame: deepClone(flame),
          tracks: result.animation.tracks.map((t) => ({
            ...t,
            keyframes: t.keyframes.map((kf) => ({ ...kf })),
          })),
        })
      } else {
        // Route through setLoadedAnimation like the LoadFlame modal: clears
        // stale timeline tracks from the previous flame and resets dirty
        // tracking (a plain drop is a load, not an edit).
        setLoadedAnimation({ flame: deepClone(flame), tracks: [] })
      }
    })
    // After the flame is in place, so replaying starts from the same
    // document the file describes.
    if (result.session) await onSessionDropped?.(result.session, file)
  }

  return onDrop
}
