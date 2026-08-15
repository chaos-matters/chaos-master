/**
 * Bracket a continuous input so recorder coalescing cannot leak across two
 * separate drags/key gestures. The helper is intentionally UI-only: audio
 * wiring has no document-history preview whose lifecycle could provide this
 * boundary automatically.
 */
export function createMappingGestureBoundary(onBoundary: () => void) {
  const active = new Set<EventTarget>()

  return {
    begin(target: EventTarget) {
      if (active.has(target)) return
      active.add(target)
      onBoundary()
    },
    end(target: EventTarget) {
      if (!active.delete(target)) return
      onBoundary()
    },
    endAll() {
      if (active.size === 0) return
      active.clear()
      onBoundary()
    },
  }
}
