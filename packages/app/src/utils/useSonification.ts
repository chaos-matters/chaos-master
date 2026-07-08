import { createEffect, onCleanup, untrack } from 'solid-js'
import { createSonificationEngine } from './sonification'
import type { Accessor } from 'solid-js'
import type { SonificationConfig } from './sonification'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Sonification effect hook: creates a Web Audio engine that reads flame
 * descriptor properties and synthesizes audio in real-time.
 *
 * Extracted from MainWorkspace to keep the component manageable.
 */
export function useSonification(
  sonificationEnabled: Accessor<boolean>,
  sonificationConfig: Accessor<SonificationConfig>,
  flameDescriptor: FlameDescriptor,
): void {
  createEffect(() => {
    const enabled = sonificationEnabled()
    if (!enabled) return

    const cfg = untrack(sonificationConfig)
    const engine = createSonificationEngine(cfg)

    let interval = setInterval(() => {
      engine.update(flameDescriptor)
    }, 1000 / cfg.updateRate)

    let lastUpdateRate = cfg.updateRate
    createEffect(() => {
      const newCfg = sonificationConfig()
      if (newCfg.updateRate !== lastUpdateRate) {
        clearInterval(interval)
        interval = setInterval(() => {
          engine.update(flameDescriptor)
        }, 1000 / newCfg.updateRate)
        lastUpdateRate = newCfg.updateRate
      }
      engine.setConfig(newCfg)
    })

    onCleanup(() => {
      clearInterval(interval)
      engine.dispose()
    })
  })
}
