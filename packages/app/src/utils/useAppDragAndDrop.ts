import { batch } from 'solid-js'
import { deepClone } from '@/utils/clone'
import { defaultConfig as defaultTimelineConfig } from '@/utils/timeline'
import { useLoadFlameFromFile } from '@/utils/useLoadFlameFromFile'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { RecordedSession } from '@/recorder/schema'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

export function useAppDragAndDrop(
  history: {
    replace: (v: FlameDescriptor, label?: string) => void
    /**
     * Settle whether the open document may be replaced, before anything
     * here touches it. At the cap that is the user's question to answer -
     * the only way to save the outgoing flame is to evict the oldest one
     * they kept - and the answer can be no (lib/documentLoad.ts).
     *
     * Awaited here rather than at `history.replace`, because that call sits
     * inside the batch below with the animation seed: a decision awaited
     * from in there would let the seed's effect take the load-boundary
     * baseline while the outgoing flame was still on screen.
     *
     * Optional, so a caller that settles nothing drops files exactly as it
     * always has.
     */
    prepareReplace?: () => Promise<boolean>
  },
  setLoadedAnimation: (state: {
    flame: FlameDescriptor
    tracks: TimelineTrack[]
    /** The timeline the dropped document belongs on. Not optional in
     *  practice: a load that says nothing about it leaves the workspace
     *  running the previous flame's frame rate and end frame. */
    config?: TimelineConfig
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
    // The open document's unsaved work has to be somewhere it survives
    // before the batch below drops it. A no leaves the dropped file
    // unloaded and that work on screen, which is the point of asking - and
    // the session the file may carry stays unoffered with it, because
    // replaying it would replace the document just kept.
    if ((await history.prepareReplace?.()) === false) return
    batch(() => {
      history.replace(deepClone(flame), 'Drop flame')
      if (result.animation && result.animation.tracks.length > 0) {
        setLoadedAnimation({
          flame: deepClone(flame),
          tracks: result.animation.tracks.map((t) => ({
            ...t,
            keyframes: t.keyframes.map((kf) => ({ ...kf })),
          })),
          // The file says what frame rate and end frame its keyframes were
          // authored at, and dropping that read the timing out of the file
          // and then threw it away - the animation played back at whatever
          // the previous document was running at.
          ...(result.animation.config
            ? { config: result.animation.config }
            : {}),
        })
      } else {
        // Route through setLoadedAnimation like the LoadFlame modal: clears
        // stale timeline tracks from the previous flame and resets dirty
        // tracking (a plain drop is a load, not an edit). The timeline goes
        // back to its defaults for the same reason the tracks do - a plain
        // flame has no claim on the last one's 60fps over 300 frames.
        setLoadedAnimation({
          flame: deepClone(flame),
          tracks: [],
          config: defaultTimelineConfig(),
        })
      }
    })
    // After the flame is in place, so replaying starts from the same
    // document the file describes.
    if (result.session) await onSessionDropped?.(result.session, file)
  }

  return onDrop
}
