import { createSignal, onCleanup, onMount } from 'solid-js'
import { vec2f } from 'typegpu/data'
import type { v2f } from 'typegpu/data'

/**
 * Cursor parallax for a live flame: returns a reactive camera-position accessor
 * (feed it to FlameView/FlameStage `cameraPosition`). The camera eases toward the
 * cursor while you move over `selector`, and settles when still so the flame
 * re-converges. Shared by the hero and the Studio viewport.
 */
export function createFlameParallax(opts: {
  selector: string
  base: readonly [number, number]
  amount?: number
}): () => v2f {
  const amount = opts.amount ?? 0.18
  const [pos, setPos] = createSignal(vec2f(opts.base[0], opts.base[1]))

  onMount(() => {
    const el = document.querySelector<HTMLElement>(opts.selector)
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0

    let raf = 0
    let running = false
    const tick = () => {
      cx += (tx - cx) * 0.06
      cy += (ty - cy) * 0.06
      const nx = opts.base[0] + cx * amount
      const ny = opts.base[1] - cy * amount
      const cur = pos()
      const moved = Math.abs(nx - cur.x) > 5e-4 || Math.abs(ny - cur.y) > 5e-4
      if (moved) setPos(vec2f(nx, ny))
      // Keep going while still easing toward the target; otherwise stop the loop
      // so an idle cursor doesn't spin rAF forever (restarts on next pointermove).
      if (moved || Math.abs(tx - cx) > 1e-3 || Math.abs(ty - cy) > 1e-3) {
        raf = requestAnimationFrame(tick)
      } else {
        running = false
      }
    }
    const ensureRunning = () => {
      if (running) return
      running = true
      raf = requestAnimationFrame(tick)
    }

    const onMove = (e: PointerEvent) => {
      const r = el?.getBoundingClientRect()
      if (!r) return
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1
      if (nx < -1.2 || nx > 1.2 || ny < -1.2 || ny > 1.2) return
      tx = nx
      ty = ny
      ensureRunning()
    }
    window.addEventListener('pointermove', onMove)

    onCleanup(() => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    })
  })

  return pos
}
