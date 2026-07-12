import { createEffect, onCleanup } from 'solid-js'
import { applyAudioMappingsToFlame } from './audioAnalysis'
import type { Accessor } from 'solid-js'
import type { AudioAnalyzer, LiveAudioAnalyzer, MappingSmoothingState, } from './audioAnalysis'
import type { AudioMapping } from '@/components/AudioReactivePanel/AudioReactivePanel'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

type SetFlameDescriptor = (fn: (draft: FlameDescriptor) => void) => void

/**
 * Audio-reactive effect hook: plays audio through AudioContext and drives
 * flame renderSettings at 30fps synced to playback time.
 *
 * Supports two modes:
 * - File mode: when `audioBuffer` is set, decodes and plays the file.
 * - Mic mode: when `liveAnalyzer` is set, reads frames from the mic.
 *
 * Playback control:
 * - `playbackPaused`: suspend/resume AudioContext (keeps it alive)
 * - `seekTarget`: time in seconds to jump to (null = no pending seek)
 * - `onPlaybackTime`: callback for current playback position display
 *
 * Shared analyzer:
 * - `fileAnalyzer`: pre-built analyzer shared with waveform panel
 */
export function useAudioReactive(
  audioEnabled: Accessor<boolean>,
  audioBuffer: Accessor<AudioBuffer | undefined>,
  audioMapping: Accessor<AudioMapping>,
  setFlameDescriptor: SetFlameDescriptor,
  liveAnalyzer: Accessor<LiveAudioAnalyzer | undefined>,
  audioSource: Accessor<'file' | 'mic'>,
  playbackPaused: Accessor<boolean>,
  seekTarget: Accessor<number | null>,
  onPlaybackTime: (seconds: number) => void,
  fileAnalyzer: Accessor<AudioAnalyzer | undefined>,
): void {
  // --- Closure-scope mutable state (persists across effect re-runs) ---
  let audioCtx: AudioContext | undefined
  let sourceNode: AudioBufferSourceNode | undefined
  let analyzer: AudioAnalyzer | undefined
  let interval: ReturnType<typeof setInterval> | undefined
  let sourceStartTime = 0
  let seekBaseOffset = 0
  let lastSeekTarget: number | null = null
  let paused = false
  const smoothingState: MappingSmoothingState = new Map()
  let lastTickTime: number | undefined

  // ---- helpers ----

  function stopSource() {
    if (!sourceNode) return
    try {
      sourceNode.stop()
    } catch {
      /* already stopped */
    }
    sourceNode.disconnect()
    sourceNode = undefined
  }

  function createSource(buffer: AudioBuffer, offset: number) {
    if (!audioCtx) return false
    stopSource()
    sourceNode = audioCtx.createBufferSource()
    sourceNode.buffer = buffer
    sourceNode.loop = true
    sourceNode.connect(audioCtx.destination)
    sourceNode.start(0, offset)
    sourceStartTime = audioCtx.currentTime
    seekBaseOffset = offset
    return true
  }

  function fullCleanup() {
    if (interval !== undefined) {
      clearInterval(interval)
      interval = undefined
    }
    stopSource()
    void audioCtx?.close()
    audioCtx = undefined
    analyzer = undefined
    smoothingState.clear()
    lastTickTime = undefined
  }

  // ---- main setup/teardown effect ----

  createEffect(() => {
    const enabled = audioEnabled()
    if (!enabled) {
      fullCleanup()
      return
    }

    const source = audioSource()
    const buffer = audioBuffer()
    const mic = liveAnalyzer()

    if (source === 'file') {
      if (!buffer) return

      // Use shared analyzer (built by MainWorkspace), wait if not ready yet
      const sharedAnalyzer = fileAnalyzer()
      if (!sharedAnalyzer) return
      analyzer = sharedAnalyzer

      // Create AudioContext
      try {
        audioCtx = new AudioContext()
      } catch {
        audioCtx = undefined
      }

      if (audioCtx) {
        const offset = seekBaseOffset
        createSource(buffer, offset)
        if (paused) {
          void audioCtx.suspend()
        }
      }

      // Interval: apply mappings at 30fps
      const tickMs = 1000 / 30
      interval = setInterval(() => {
        // Check for seek
        const st = seekTarget()
        if (
          st !== null &&
          st !== lastSeekTarget &&
          audioCtx &&
          buffer &&
          analyzer
        ) {
          lastSeekTarget = st
          createSource(buffer, st)
          if (paused) {
            void audioCtx.suspend()
          }
        }

        const mappings = audioMapping().mappings
        if (!audioCtx || !analyzer) {
          // No audio context (autoplay blocked) — just tick a blind counter
          onPlaybackTime(seekBaseOffset)
          return
        }

        const currentTime =
          audioCtx.currentTime - sourceStartTime + seekBaseOffset
        const duration = buffer?.duration ?? 0
        const displayTime = duration > 0 ? currentTime % duration : currentTime
        onPlaybackTime(displayTime)

        if (paused) return

        const frame = Math.floor(currentTime * 30)
        const wrapped =
          analyzer.totalFrames > 0
            ? ((frame % analyzer.totalFrames) + analyzer.totalFrames) %
              analyzer.totalFrames
            : frame

        if (mappings.length > 0) {
          const now = globalThis.performance.now()
          const dt =
            lastTickTime !== undefined ? (now - lastTickTime) / 1000 : 1 / 30
          lastTickTime = now
          const frameData = analyzer.getFrameData(
            wrapped % analyzer.totalFrames,
          )
          setFlameDescriptor((draft) => {
            applyAudioMappingsToFlame(
              draft,
              frameData,
              mappings,
              smoothingState,
              dt,
            )
          })
        }
      }, tickMs)

      onCleanup(() => {
        fullCleanup()
        // Reset for next setup
        seekBaseOffset = 0
        sourceStartTime = 0
        lastSeekTarget = null
        paused = false
        onPlaybackTime(0)
      })
      return
    }

    // --- Mic mode ---
    if (source === 'mic' && mic) {
      const tickMs = 1000 / 30
      interval = setInterval(() => {
        const mappings = audioMapping().mappings
        if (mappings.length === 0) return
        const now = globalThis.performance.now()
        const dt =
          lastTickTime !== undefined ? (now - lastTickTime) / 1000 : 1 / 30
        lastTickTime = now
        const frameData = mic.getFrameData()
        setFlameDescriptor((draft) => {
          applyAudioMappingsToFlame(
            draft,
            frameData,
            mappings,
            smoothingState,
            dt,
          )
        })
      }, tickMs)

      onCleanup(() => {
        clearInterval(interval)
        interval = undefined
        lastTickTime = undefined
      })
    }
  })

  // ---- pause/resume effect ----

  createEffect(() => {
    const shouldPause = playbackPaused()
    paused = shouldPause
    if (!audioCtx) return

    if (shouldPause) {
      void audioCtx.suspend()
    } else {
      void audioCtx.resume()
      // Adjust sourceStartTime so time calculation doesn't jump
      sourceStartTime = audioCtx.currentTime - seekBaseOffset
    }
  })
}
