import { batch } from 'solid-js'
import { deepClone } from '@/utils/clone'
import { useLoadFlameFromFile } from '@/utils/useLoadFlameFromFile'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

export function useAppDragAndDrop(
  history: { replace: (v: FlameDescriptor) => void },
  setLoadedAnimation: (state: {
    flame: FlameDescriptor
    tracks: TimelineTrack[]
  }) => void,
) {
  const loadFlameFromFile = useLoadFlameFromFile()

  async function onDrop(file: File) {
    const result = await loadFlameFromFile(file)
    if (!result) return
    batch(() => {
      history.replace(deepClone(result.flame))
      if (result.animation && result.animation.tracks.length > 0) {
        setLoadedAnimation({
          flame: deepClone(result.flame),
          tracks: result.animation.tracks.map((t) => ({
            ...t,
            keyframes: t.keyframes.map((kf) => ({ ...kf })),
          })),
        })
      } else {
        // Route through setLoadedAnimation like the LoadFlame modal: clears
        // stale timeline tracks from the previous flame and resets dirty
        // tracking (a plain drop is a load, not an edit).
        setLoadedAnimation({ flame: deepClone(result.flame), tracks: [] })
      }
    })
  }

  return onDrop
}
