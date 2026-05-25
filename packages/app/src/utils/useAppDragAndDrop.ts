import { batch } from 'solid-js'
import { useLoadFlameFromFile } from '@/utils/useLoadFlameFromFile'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

export function useAppDragAndDrop(
  history: { replace: (v: FlameDescriptor) => void },
  setLoadedAnimation: (state: {
    flame: FlameDescriptor
    tracks: TimelineTrack[]
  }) => void,
  clearLoadedAnimation: () => void,
) {
  const loadFlameFromFile = useLoadFlameFromFile()

  async function onDrop(file: File) {
    const result = await loadFlameFromFile(file)
    if (!result) return
    batch(() => {
      history.replace(structuredClone(result.flame))
      if (result.animation && result.animation.tracks.length > 0) {
        setLoadedAnimation({
          flame: structuredClone(result.flame),
          tracks: result.animation.tracks.map((t) => ({
            ...t,
            keyframes: t.keyframes.map((kf) => ({ ...kf })),
          })),
        })
      } else {
        clearLoadedAnimation()
      }
    })
  }

  return onDrop
}
