import { describe, expect, it } from 'vitest'
import { createFileDragState } from './fileDragState'

/** A `dragleave` whose `relatedTarget` the browser did report. */
function leave(zone: Node, next: Node | null) {
  return { relatedTarget: next, currentTarget: zone } as unknown as DragEvent
}

function makeZone() {
  const zone = document.createElement('div')
  const child = document.createElement('span')
  const grandchild = document.createElement('em')
  child.appendChild(grandchild)
  zone.appendChild(child)
  document.body.appendChild(zone)
  return { zone, child, grandchild }
}

describe('createFileDragState', () => {
  it('starts inactive', () => {
    expect(createFileDragState().active()).toBe(false)
  })

  it('activates on enter', () => {
    const s = createFileDragState()
    s.onDragEnter()
    expect(s.active()).toBe(true)
  })

  // The reported bug: moving the pointer a little up or down inside the zone
  // crosses a child, which fires leave-then-enter on the zone. A plain boolean
  // flips off in between and the "release to load" copy reverts.
  it('stays active while the pointer crosses a child', () => {
    const { zone, child } = makeZone()
    const s = createFileDragState()

    s.onDragEnter() // into the zone
    s.onDragEnter() // onto the child
    s.onDragLeave(leave(zone, child)) // leaving the zone *for* the child
    expect(s.active()).toBe(true)
  })

  it('stays active across a deeper nest', () => {
    const { zone, child, grandchild } = makeZone()
    const s = createFileDragState()

    s.onDragEnter()
    s.onDragEnter()
    s.onDragEnter()
    s.onDragLeave(leave(zone, grandchild))
    s.onDragLeave(leave(zone, child))
    expect(s.active()).toBe(true)
  })

  it('deactivates when the pointer actually leaves', () => {
    const { zone, child } = makeZone()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const s = createFileDragState()

    s.onDragEnter()
    s.onDragEnter()
    s.onDragLeave(leave(zone, child))
    s.onDragLeave(leave(zone, outside))
    expect(s.active()).toBe(false)
  })

  // relatedTarget is null when the pointer leaves the window entirely, and some
  // browsers omit it — the counter has to carry those.
  it('falls back to the counter when relatedTarget is null', () => {
    const { zone } = makeZone()
    const s = createFileDragState()

    s.onDragEnter()
    s.onDragEnter()
    s.onDragLeave(leave(zone, null))
    expect(s.active()).toBe(true)
    s.onDragLeave(leave(zone, null))
    expect(s.active()).toBe(false)
  })

  it('never drives the counter negative', () => {
    const { zone } = makeZone()
    const s = createFileDragState()

    s.onDragLeave(leave(zone, null))
    s.onDragLeave(leave(zone, null))
    s.onDragEnter()
    // One stray enter must light it up, however many leaves preceded it.
    expect(s.active()).toBe(true)
  })

  it('reset clears a nested drag in one call, as drop needs', () => {
    const s = createFileDragState()
    s.onDragEnter()
    s.onDragEnter()
    s.onDragEnter()
    s.reset()
    expect(s.active()).toBe(false)
    // And the next drag starts clean rather than needing 3 leaves first.
    s.onDragEnter()
    expect(s.active()).toBe(true)
  })

  it('an outside relatedTarget clears even if the count drifted high', () => {
    const { zone } = makeZone()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const s = createFileDragState()

    s.onDragEnter()
    s.onDragEnter()
    s.onDragEnter()
    s.onDragLeave(leave(zone, outside))
    expect(s.active()).toBe(false)
  })

  describe('onDragOver', () => {
    it('prevents default so drop can fire at all', () => {
      let prevented = false
      createFileDragState().onDragOver({
        preventDefault: () => {
          prevented = true
        },
        dataTransfer: null,
      } as unknown as DragEvent)
      expect(prevented).toBe(true)
    })

    it('marks the drop as a copy, which is what shows the accept cursor', () => {
      const dataTransfer = { dropEffect: 'none' }
      createFileDragState().onDragOver({
        preventDefault: () => {},
        dataTransfer,
      } as unknown as DragEvent)
      expect(dataTransfer.dropEffect).toBe('copy')
    })

    it('tolerates a missing dataTransfer', () => {
      expect(() => {
        createFileDragState().onDragOver({
          preventDefault: () => {},
          dataTransfer: null,
        } as unknown as DragEvent)
      }).not.toThrow()
    })
  })
})
