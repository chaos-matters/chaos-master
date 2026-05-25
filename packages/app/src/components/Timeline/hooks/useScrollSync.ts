import { createEffect, onCleanup, Accessor } from 'solid-js'

export function useScrollSync(
  tracksScrollRef: Accessor<HTMLElement | undefined>,
  seekLaneRef: Accessor<HTMLElement | undefined>
) {
  createEffect(() => {
    const tracksEl = tracksScrollRef()
    const seekLane = seekLaneRef()
    if (!tracksEl || !seekLane) return
    
    let syncing = false
    const syncTracksToLane = () => {
      if (syncing) return
      syncing = true
      seekLane.scrollLeft = tracksEl.scrollLeft
      syncing = false
    }
    const syncLaneToTracks = () => {
      if (syncing) return
      syncing = true
      tracksEl.scrollLeft = seekLane.scrollLeft
      syncing = false
    }
    
    tracksEl.addEventListener('scroll', syncTracksToLane, { passive: true })
    seekLane.addEventListener('scroll', syncLaneToTracks, { passive: true })
    onCleanup(() => {
      tracksEl.removeEventListener('scroll', syncTracksToLane)
      seekLane.removeEventListener('scroll', syncLaneToTracks)
    })
  })
}
