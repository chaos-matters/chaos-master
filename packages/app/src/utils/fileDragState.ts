import { createSignal } from 'solid-js'

/**
 * Drag-hover state for a file drop target.
 *
 * `dragenter` and `dragleave` fire for *every* element the pointer crosses and
 * bubble up to the zone, so a plain `setActive(false)` on leave flips off the
 * moment the pointer moves onto a child — an icon, a line of text. The user
 * sees the highlight and the "release to load" copy flicker away while the
 * pointer is still inside the zone, which reads as "this drop is not valid".
 *
 * Count the nesting instead, and treat a leave whose `relatedTarget` lies
 * outside the zone as a real exit regardless of the count, so a missed enter
 * (the pointer entering through a shadow boundary, a drag that starts inside)
 * cannot strand the highlight on.
 *
 * `onDragOver` also sets `dropEffect = 'copy'`: `preventDefault` alone is what
 * makes `drop` fire, but the copy cursor is what tells the user at the OS level
 * that the drop will be accepted.
 */
export function createFileDragState() {
  const [active, setActive] = createSignal(false)
  let depth = 0

  const reset = () => {
    depth = 0
    setActive(false)
  }

  return {
    /** True while a drag is over the zone or any of its descendants. */
    active,
    /** Force the state off — call after `drop`, which never emits `dragleave`. */
    reset,

    onDragEnter: () => {
      depth += 1
      setActive(true)
    },

    onDragLeave: (ev: DragEvent) => {
      const next = ev.relatedTarget
      const zone = ev.currentTarget
      // Browsers that report where the pointer went (Chromium, Firefox) let a
      // leave to outside the zone clear the highlight even if the count drifted;
      // the rest fall back to the counter.
      if (
        zone instanceof Node &&
        next instanceof Node &&
        !zone.contains(next)
      ) {
        reset()
        return
      }
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    },

    onDragOver: (ev: DragEvent) => {
      ev.preventDefault()
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'
    },
  }
}
