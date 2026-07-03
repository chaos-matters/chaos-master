import { createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export function useScrollSync(
  tracksScrollRef: Accessor<HTMLElement | undefined>,
  seekLaneRef: Accessor<HTMLElement | undefined>,
) {
  createEffect(() => {
    const tracksEl = tracksScrollRef()
    const seekLane = seekLaneRef()
    if (!tracksEl || !seekLane) return

    // Value-guarded, not flag-guarded: a programmatic scrollLeft write fires
    // its scroll event asynchronously, long after any "syncing" flag has been
    // reset, so a flag can't stop echoes — and a stale echo can overwrite a
    // newer position. Comparing values makes the sync idempotent (assigning an
    // equal scrollLeft fires no event, so the echo chain terminates).
    const syncTracksToLane = () => {
      if (seekLane.scrollLeft !== tracksEl.scrollLeft) {
        seekLane.scrollLeft = tracksEl.scrollLeft
      }
    }
    const syncLaneToTracks = () => {
      if (tracksEl.scrollLeft !== seekLane.scrollLeft) {
        tracksEl.scrollLeft = seekLane.scrollLeft
      }
    }

    tracksEl.addEventListener('scroll', syncTracksToLane, { passive: true })
    seekLane.addEventListener('scroll', syncLaneToTracks, { passive: true })
    onCleanup(() => {
      tracksEl.removeEventListener('scroll', syncTracksToLane)
      seekLane.removeEventListener('scroll', syncLaneToTracks)
    })
  })
}
