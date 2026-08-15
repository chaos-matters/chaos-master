import { createEffect, onCleanup, untrack } from 'solid-js'
import { createSonificationEngine } from './sonification'
import type { Accessor } from 'solid-js'
import type { SonificationConfig, SonificationEngine } from './sonification'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type SonificationLifecycle = {
  /** Create/resume the silent engine synchronously from a user gesture so a
   * later timed replay step can enable it without violating autoplay policy. */
  prime: () => void
}

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
  effectsDeferred: Accessor<boolean> = () => false,
): SonificationLifecycle {
  let engine: SonificationEngine | undefined
  let interval: ReturnType<typeof setInterval> | undefined
  let lastUpdateRate: number | undefined

  const stopUpdates = () => {
    clearInterval(interval)
    interval = undefined
  }

  const ensureEngine = (config: SonificationConfig): SonificationEngine => {
    if (engine) {
      engine.setConfig(config)
    } else {
      engine = createSonificationEngine(config)
    }
    return engine
  }

  createEffect(() => {
    const enabled = sonificationEnabled() && !effectsDeferred()
    const cfg = enabled ? sonificationConfig() : untrack(sonificationConfig)
    if (!enabled) {
      stopUpdates()
      engine?.setActive(false)
      return
    }

    ensureEngine(cfg).setActive(true)

    if (interval === undefined || cfg.updateRate !== lastUpdateRate) {
      stopUpdates()
      interval = setInterval(() => {
        engine?.update(flameDescriptor)
      }, 1000 / cfg.updateRate)
      lastUpdateRate = cfg.updateRate
    }
  })

  onCleanup(() => {
    stopUpdates()
    engine?.dispose()
    engine = undefined
  })

  return {
    prime: () => {
      const config = untrack(sonificationConfig)
      const currentEngine = ensureEngine(config)
      if (untrack(sonificationEnabled) && !untrack(effectsDeferred)) {
        currentEngine.setActive(true)
      } else {
        currentEngine.prime()
      }
    },
  }
}
