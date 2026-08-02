import { createEffect, createMemo, createSignal, For, Index, onCleanup, Show, } from 'solid-js'
import { Cross, MusicNote } from '@/icons'
import { createLiveAnalyzer, decodeAudioFile, getAudioFeatureNormalized, } from '@/utils/audioAnalysis'
import { buildFlamePreset, buildPreset, FLAME_PRESET_IDS, PRESET_DESCRIPTIONS, PRESET_LABELS, randomizeMappings, RENDER_PRESET_IDS, RENDER_PRESETS, } from '@/utils/audioWiringPresets'
import { AudioWiringModal } from '../AudioWiringModal/AudioWiringModal'
import ui from './AudioReactivePanel.module.css'
import { computeBeatFrames, drawWaveform } from './audioWaveform'
import type { Accessor } from 'solid-js'
import type { AffineKey, AudioAnalyzer, AudioFeature, FlameTarget, LiveAudioAnalyzer, RenderSettingKey, TransformInfo, TransformPropertyKey, } from '@/utils/audioAnalysis'
import type { WiringPresetId } from '@/utils/audioWiringPresets'

// Re-export for consumers (MainWorkspace etc.)
export type { AudioFeature, FlameTarget, TransformInfo }

// --- Types ---

export type ParamMapping = {
  audioFeature: AudioFeature
  target: FlameTarget
  sensitivity: number
  range: [number, number]
  /** Attack time in ms — how fast the value rises (0 = instant). */
  attackMs?: number
  /** Release time in ms — how fast the value falls (0 = instant). */
  releaseMs?: number
}

export type AudioMapping = {
  preset: AudioPreset
  mappings: ParamMapping[]
}

/**
 * Which quick-start wiring is selected. `custom` means the mappings were
 * hand-edited or randomised and no longer match any preset.
 *
 * The set itself lives in utils/audioWiringPresets.ts, because half of it is
 * COMPUTED from the loaded flame rather than declared.
 */
export type AudioPreset = WiringPresetId | 'custom'

type AudioReactivePanelProps = {
  onClose: () => void
  audioBuffer: Accessor<AudioBuffer | undefined>
  onAudioChange: (buffer: AudioBuffer | undefined) => void
  audioMapping: Accessor<AudioMapping>
  onMappingChange: (mapping: AudioMapping) => void
  audioEnabled: Accessor<boolean>
  onEnabledChange: (enabled: boolean) => void
  audioSource: Accessor<'file' | 'mic'>
  onSourceChange: (source: 'file' | 'mic') => void
  onLiveAnalyzerChange: (analyzer: LiveAudioAnalyzer | undefined) => void
  liveAnalyzer: Accessor<LiveAudioAnalyzer | undefined>
  playbackPaused: Accessor<boolean>
  onPausedChange: (paused: boolean) => void
  playbackTime: Accessor<number>
  onSeek: (seconds: number) => void
  fileAnalyzer: Accessor<AudioAnalyzer | undefined>
  /**
   * Progress of the post-decode analysis pass, 0-1, or null when nothing is
   * being analysed. Owned by MainWorkspace, which runs the pass.
   */
  analysisProgress: Accessor<number | null>
  /** Name of the flame being driven, for the status bar. */
  flameName?: string
  /**
   * Whether audio should survive this panel being closed. Default OFF: a track
   * playing from a panel you cannot see has no visible cause and no obvious
   * stop button.
   */
  keepPlayingWhenClosed: Accessor<boolean>
  onKeepPlayingChange: (keep: boolean) => void
  /** Available transforms (id+label) for per-transform target selectors. */
  transforms: TransformInfo[]
}

// --- Feature / param labels ---

const AUDIO_FEATURE_LABELS: Record<AudioFeature, string> = {
  subBass: 'Sub-Bass',
  bass: 'Bass',
  lowMid: 'Low-Mid',
  mid: 'Mid',
  hiMid: 'Hi-Mid',
  presence: 'Presence',
  brilliance: 'Brilliance',
  fullSpectrum: 'Full Spectrum',
  rms: 'RMS',
  centroid: 'Centroid',
  flatness: 'Flatness',
  beat: 'Beat',
  onset: 'Onset',
}

const RENDER_SETTING_LABELS: Record<RenderSettingKey, string> = {
  vibrancy: 'Vibrancy',
  exposure: 'Exposure',
  palettePhase: 'Palette Phase',
  paletteSpeed: 'Palette Speed',
  contrast: 'Contrast',
  gamma: 'Gamma',
  highlightPower: 'Highlight Power',
  lightPower: 'Light Power',
  depthColorPower: 'Depth Color',
  zoom: 'Zoom',
  skipIters: 'Skip Iters',
}

const AFFINE_KEY_LABELS: Record<AffineKey, string> = {
  a: 'a',
  b: 'b',
  c: 'c',
  d: 'd',
  e: 'e',
  f: 'f',
}

const TRANSFORM_PROP_LABELS: Record<TransformPropertyKey, string> = {
  probability: 'Probability',
  colorX: 'Color X',
  colorY: 'Color Y',
  colorSpeed: 'Color Speed',
}

const ALL_FEATURES: AudioFeature[] = [
  'subBass',
  'bass',
  'lowMid',
  'mid',
  'hiMid',
  'presence',
  'brilliance',
  'fullSpectrum',
  'rms',
  'centroid',
  'flatness',
  'beat',
  'onset',
]

const ALL_RENDER_PARAMS: RenderSettingKey[] = [
  'vibrancy',
  'exposure',
  'palettePhase',
  'paletteSpeed',
  'contrast',
  'gamma',
  'highlightPower',
  'lightPower',
  'depthColorPower',
  'zoom',
  'skipIters',
]

const ALL_AFFINE_KEYS: AffineKey[] = ['a', 'b', 'c', 'd', 'e', 'f']

const ALL_TRANSFORM_PROPS: TransformPropertyKey[] = [
  'probability',
  'colorX',
  'colorY',
  'colorSpeed',
]

type TargetCategory = FlameTarget['kind']
const TARGET_CATEGORIES: TargetCategory[] = [
  'renderSetting',
  'transformAffine',
  'transformProperty',
  'variationWeight',
  'finalAffine',
]
const TARGET_CATEGORY_LABELS: Record<TargetCategory, string> = {
  renderSetting: 'Render',
  transformAffine: 'Affine',
  transformProperty: 'Prop',
  variationWeight: 'Var Wt',
  finalAffine: 'Final',
}

/** Build a default target for a given category. */
export function defaultTarget(
  category: TargetCategory,
  transformIdx?: number,
): FlameTarget {
  switch (category) {
    case 'renderSetting':
      return { kind: 'renderSetting', param: 'vibrancy' }
    case 'transformAffine':
      return {
        kind: 'transformAffine',
        transformIdx: transformIdx ?? 0,
        matrix: 'postAffine',
        param: 'a',
      }
    case 'transformProperty':
      return {
        kind: 'transformProperty',
        transformIdx: transformIdx ?? 0,
        property: 'probability',
      }
    case 'variationWeight':
      return {
        kind: 'variationWeight',
        transformIdx: transformIdx ?? 0,
        variationType: '',
      }
    case 'finalAffine':
      return { kind: 'finalAffine', param: 'a' }
  }
}

const SUPPORTED_AUDIO =
  '.mp3,.wav,.ogg,.flac,audio/mpeg,audio/wav,audio/ogg,audio/flac'

// --- Variation weight pill picker ---

function VariationWeightPills(props: {
  mapping: ParamMapping
  transforms: TransformInfo[]
  onSelect: (variationType: string) => void
}) {
  const txIdx =
    props.mapping.target.kind === 'variationWeight'
      ? props.mapping.target.transformIdx
      : 0
  const info = props.transforms.find((t) => t.index === txIdx)
  const vars = info?.variations ?? []

  return (
    <div class={ui.variationPillsRow}>
      {vars.length === 0 ? (
        <span class={ui.noVariations}>No variations</span>
      ) : (
        <For each={vars}>
          {(v) => (
            <button
              type="button"
              class={ui.variationPill}
              classList={{
                [ui.variationPillActive as string]:
                  props.mapping.target.kind === 'variationWeight' &&
                  props.mapping.target.variationType === v.type,
              }}
              title={v.type}
              aria-label={v.type}
              onClick={() => {
                props.onSelect(v.type)
              }}
            >
              {v.type}
            </button>
          )}
        </For>
      )}
    </div>
  )
}

// --- Component ---

export function AudioReactivePanel(props: AudioReactivePanelProps) {
  const [dragOver, setDragOver] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  /**
   * What the panel is actually doing right now.
   *
   * Loading a track is two jobs, not one: decode (browser-owned, no progress to
   * report) and the analysis pass that builds the frame data (MainWorkspace,
   * reports per-frame). Only the first was ever surfaced, so an 18-minute file
   * showed "Loading..." for a moment and then a silent, apparently-dead panel
   * for the minute that the second job took.
   *
   * Playback is deliberately NOT part of this: the transport works as soon as
   * the buffer decodes (see useAudioReactive), so the track is playable and
   * scrubbable while the analysis is still running — only the modulation has to
   * wait.
   */
  const loadPhase = () => {
    if (loading()) return 'decoding' as const
    const progress = props.analysisProgress()
    if (progress !== null) return 'analyzing' as const
    return 'idle' as const
  }
  const loadLabel = () =>
    loadPhase() === 'decoding'
      ? 'Decoding audio…'
      : 'Drop audio file or click to browse'

  /**
   * The one percentage the overlay shows: the analysis pass while it runs, then
   * the beat scan that follows it. Two sequential jobs, one bar — the user is
   * waiting on "is the track ready", not on which internal stage is running.
   */
  const analyzePercent = () =>
    isAnalyzing()
      ? Math.round((props.analysisProgress() ?? 0) * 100)
      : beatProgress()
  const [beatProgress, setBeatProgress] = createSignal(0)
  const [audioFileName, setAudioFileName] = createSignal<string | null>(null)
  const [micError, setMicError] = createSignal<string | null>(null)
  const [micConnecting, setMicConnecting] = createSignal(false)
  const [showWiringModal, setShowWiringModal] = createSignal(false)
  const [liveFeatureLevels, setLiveFeatureLevels] = createSignal<
    Record<string, number>
  >({})

  const [waveformCanvas, setWaveformCanvas] = createSignal<HTMLCanvasElement>()
  let fileInput!: HTMLInputElement

  const [scrubbing, setScrubbing] = createSignal(false)

  // Derived: true while the shared analyzer is being built (FFT pass)
  /*
   * Both of these signals hold `undefined`, never `null` — so the original
   * `fileAnalyzer() === null` was always FALSE and this memo always returned
   * false. The "Analyzing audio…" overlay it gates has therefore never
   * rendered: loading a long track showed a decoded-but-silent panel with no
   * indication that a minute of analysis was still running.
   */
  const isAnalyzing = createMemo(() => {
    const buf = props.audioBuffer()
    return buf !== undefined && props.fileAnalyzer() === undefined
  })

  function formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds))
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function seekFromEvent(e: MouseEvent) {
    const rect = waveformCanvas()!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    const duration = props.audioBuffer()?.duration ?? 0
    props.onSeek(percent * duration)
  }

  function handleWaveformClick(e: MouseEvent) {
    seekFromEvent(e)
  }

  function handleScrubStart(e: MouseEvent) {
    setScrubbing(true)
    seekFromEvent(e)
    e.preventDefault()
  }

  // Draw waveform when shared analyzer is ready
  createEffect(() => {
    const buffer = props.audioBuffer()
    const analyzer = props.fileAnalyzer()
    const _src = props.audioSource()
    const canvas = waveformCanvas()
    if (!buffer || !analyzer || !canvas) return

    setBeatProgress(0)
    // Yield so UI paints the progress state before scanning beat frames
    setTimeout(async () => {
      const { beatFrames, totalFrames } = await computeBeatFrames(
        analyzer,
        (current, total) => {
          setBeatProgress(Math.round((current / total) * 100))
        },
      )
      drawWaveform(canvas, buffer, beatFrames, totalFrames, 0)
      setBeatProgress(0)
    }, 30)
  })

  // Scrubbing: window-level mousemove/mouseup while dragging
  let scrubMoveHandler: ((e: MouseEvent) => void) | undefined
  let scrubUpHandler: (() => void) | undefined

  createEffect(() => {
    if (!scrubbing()) return
    scrubMoveHandler = (e: MouseEvent) => {
      seekFromEvent(e)
    }
    scrubUpHandler = () => setScrubbing(false)
    window.addEventListener('mousemove', scrubMoveHandler)
    window.addEventListener('mouseup', scrubUpHandler)
    onCleanup(() => {
      if (scrubMoveHandler)
        window.removeEventListener('mousemove', scrubMoveHandler)
      if (scrubUpHandler) window.removeEventListener('mouseup', scrubUpHandler)
    })
  })

  // Poll live analyzer for wiring modal meters
  createEffect(() => {
    const isOpen = showWiringModal()
    const analyzer = props.liveAnalyzer()
    if (!isOpen || !analyzer) {
      if (!isOpen) setLiveFeatureLevels({})
      return
    }
    const interval = setInterval(() => {
      const frame = analyzer.getFrameData()
      const features: AudioFeature[] = [
        'subBass',
        'bass',
        'lowMid',
        'mid',
        'hiMid',
        'presence',
        'brilliance',
        'fullSpectrum',
        'rms',
        'centroid',
        'flatness',
        'beat',
        'onset',
      ]
      const levels: Record<string, number> = {}
      for (const f of features) {
        levels[f] = getAudioFeatureNormalized(frame, f)
      }
      setLiveFeatureLevels(levels)
    }, 50)
    onCleanup(() => {
      clearInterval(interval)
    })
  })

  function handleFile(file: File) {
    if (!file) return
    setError(null)
    setLoading(true)
    setAudioFileName(file.name)
    decodeAudioFile(file)
      .then((buffer) => {
        props.onAudioChange(buffer)
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to decode audio')
        setLoading(false)
        setAudioFileName(null)
      })
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file) handleFile(file)
    input.value = ''
  }

  function enableMic() {
    setMicError(null)
    setMicConnecting(true)
    createLiveAnalyzer(30)
      .then((analyzer) => {
        setMicConnecting(false)
        props.onLiveAnalyzerChange(analyzer)
        props.onSourceChange('mic')
      })
      .catch((e: unknown) => {
        setMicConnecting(false)
        setMicError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Microphone access denied. Check browser permissions.'
            : e instanceof Error
              ? e.message
              : 'Failed to access microphone',
        )
      })
  }

  function disableMic() {
    const a = props.liveAnalyzer()
    if (a) {
      a.dispose()
      props.onLiveAnalyzerChange(undefined)
    }
    props.onSourceChange('file')
  }

  function closePanel() {
    const a = props.liveAnalyzer()
    if (a) {
      a.dispose()
      props.onLiveAnalyzerChange(undefined)
    }
    props.onClose()
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closePanel()
      return
    }
    // Spacebar toggles audio play/pause (not animation).
    // Only when audio is loaded and the user isn't typing in an input.
    if (e.key === ' ' || e.code === 'Space') {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (!props.audioBuffer()) return
      e.preventDefault()
      props.onPausedChange(!props.playbackPaused())
    }
  }

  function applyPreset(preset: AudioPreset) {
    if (preset === 'custom') return
    // Built against the CURRENT flame: a flame-aware preset names transform
    // indices and variation types that only exist for this descriptor, so it
    // cannot be looked up from a table.
    props.onMappingChange({
      preset,
      mappings: buildPreset(preset, props.transforms),
    })
  }

  /**
   * What the wiring editor offers in its own preset list: the render presets,
   * plus whichever flame-aware ones this flame can actually satisfy. Computed,
   * so the editor and the panel never disagree about what exists.
   */
  const wiringPresets = createMemo(() => {
    const out: Record<string, ParamMapping[]> = { ...RENDER_PRESETS }
    for (const id of FLAME_PRESET_IDS) {
      const built = buildFlamePreset(id, props.transforms)
      if (built.length > 0) {
        out[id] = built
      }
    }
    return out
  })

  function randomizeCurrentWiring() {
    props.onMappingChange({
      preset: 'custom',
      mappings: randomizeMappings(props.transforms),
    })
  }

  function updateMapping(index: number, updates: Partial<ParamMapping>) {
    const current = props.audioMapping()
    const next = current.mappings.map((m, i) =>
      i === index ? { ...m, ...updates } : m,
    )
    // Switch to custom when user modifies a preset
    const preset = current.preset !== 'custom' ? 'custom' : current.preset
    props.onMappingChange({ preset, mappings: next })
  }

  function removeMapping(index: number) {
    const current = props.audioMapping()
    const next = current.mappings.filter((_, i) => i !== index)
    props.onMappingChange({ preset: 'custom', mappings: next })
  }

  function addMapping() {
    const current = props.audioMapping()
    props.onMappingChange({
      preset: 'custom',
      mappings: [
        ...current.mappings,
        {
          audioFeature: 'bass',
          target: { kind: 'renderSetting', param: 'vibrancy' },
          sensitivity: 1,
          range: [0.5, 1.5],
        },
      ],
    })
  }

  window.addEventListener('keydown', handleKey)
  onCleanup(() => {
    window.removeEventListener('keydown', handleKey)
  })

  const fileName = createMemo(() => {
    return audioFileName() ?? 'Audio Track'
  })

  return (
    <div class={ui.container}>
      <div class={ui.header}>
        <span class={ui.title}>Audio Reactive</span>
        <div class={ui.sourceToggle}>
          <button
            class={
              ui.sourceBtn +
              (props.audioSource() === 'file' ? ` ${ui.sourceBtnActive}` : '')
            }
            onClick={() => {
              disableMic()
            }}
            aria-label="Switch to file audio source"
          >
            File
          </button>
          <button
            class={
              ui.sourceBtn +
              (props.audioSource() === 'mic' ? ` ${ui.sourceBtnActive}` : '')
            }
            onClick={() => {
              if (props.audioSource() !== 'mic') enableMic()
            }}
            aria-label="Switch to microphone audio source"
          >
            Mic
          </button>
        </div>
        <button
          class={ui.closeBtn}
          onClick={() => {
            closePanel()
          }}
          title="Close (Esc)"
          aria-label="Close audio reactive panel"
        >
          <Cross />
        </button>
      </div>

      <div class={ui.body}>
        {/* Mic mode */}
        <Show when={props.audioSource() === 'mic'}>
          <div class={ui.micSection}>
            <Show
              when={!micConnecting() && !micError() && props.liveAnalyzer()}
              fallback={
                <Show when={micConnecting()}>
                  <div class={ui.micStatus}>
                    <span class={`${ui.micDot} ${ui.micDotPulse}`} />
                    Requesting microphone access...
                  </div>
                </Show>
              }
            >
              <div class={ui.micStatus}>
                <span class={ui.micDot} />
                Live — fractal reacts to ambient sound
              </div>
            </Show>
            <Show when={micError()}>
              <div class={ui.micError}>{micError()}</div>
            </Show>
          </div>
        </Show>

        {/* File mode: drop zone or waveform */}
        <Show when={props.audioSource() === 'file'}>
          <Show
            when={!props.audioBuffer()}
            fallback={
              <>
                {/* Audio loaded state */}
                <div class={ui.audioInfo}>
                  <span class={ui.audioFileName}>{fileName()}</span>
                  <span class={ui.audioDuration}>
                    {props.audioBuffer()!.duration.toFixed(1)}s
                  </span>
                  <button
                    class={ui.clearAudioBtn}
                    onClick={() => {
                      props.onAudioChange(undefined)
                      setAudioFileName(null)
                    }}
                    aria-label="Clear audio file"
                  >
                    Clear
                  </button>
                </div>

                {/* Playback controls */}
                <div class={ui.playbackRow}>
                  <button
                    class={ui.playPauseBtn}
                    onClick={() => {
                      props.onPausedChange(!props.playbackPaused())
                    }}
                    title={props.playbackPaused() ? 'Play' : 'Pause'}
                    aria-label={
                      props.playbackPaused() ? 'Play audio' : 'Pause audio'
                    }
                  >
                    {props.playbackPaused() ? '▶' : '⏸'}
                  </button>
                  <span class={ui.timeText}>
                    {formatTime(props.playbackTime())}
                    {' / '}
                    {formatTime(props.audioBuffer()!.duration)}
                  </span>
                  {/* Live Preview sits WITH the transport, not in a footer at
                      the far end of a long scrolling panel. It is the switch
                      you reach for immediately after pressing play — "I can
                      hear it, now drive the flame with it" — and it belongs
                      next to the thing it follows. */}
                  <label class={`${ui.enableToggle} ${ui.enableToggleInline}`}>
                    <button
                      class={
                        ui.toggleSwitch +
                        (props.audioEnabled() ? ` ${ui.toggleSwitchOn}` : '')
                      }
                      onClick={() => {
                        props.onEnabledChange(!props.audioEnabled())
                      }}
                      aria-label="Toggle audio reactive preview"
                      title="Drive the flame from this audio"
                    >
                      <span class={ui.toggleKnob} />
                    </button>
                    Live Preview
                  </label>
                </div>

                {/* Waveform */}
                <div class={ui.waveformWrap}>
                  <Show when={isAnalyzing() || beatProgress() > 0}>
                    <div class={ui.analyzeOverlay}>
                      <span class={ui.analyzeLabel}>
                        {isAnalyzing()
                          ? 'Analyzing audio — playable already, mappings when it finishes'
                          : 'Scanning beats...'}
                      </span>
                      {/* The bar was hard-wired to `beatProgress`, which stays
                          0 for the whole analysis pass — so even if the overlay
                          had rendered it would have sat at 0% for a minute.
                          The analysis reports per frame; use it. */}
                      <div class={ui.progressTrack}>
                        <div
                          class={ui.progressFill}
                          style={{ width: `${analyzePercent()}%` }}
                        />
                      </div>
                      <Show when={analyzePercent() > 0}>
                        <span class={ui.analyzePercent}>
                          {analyzePercent()}%
                        </span>
                      </Show>
                    </div>
                  </Show>
                  <canvas
                    ref={setWaveformCanvas}
                    class={
                      ui.waveform +
                      (isAnalyzing() ? ` ${ui.waveformHidden}` : '') +
                      (isAnalyzing() ? '' : ` ${ui.waveformInteractive}`)
                    }
                    onClick={handleWaveformClick}
                    onMouseDown={handleScrubStart}
                  />
                  {/* Playhead overlay line */}
                  <Show when={!isAnalyzing()}>
                    <div
                      class={ui.playhead}
                      style={{
                        left: `${((props.playbackTime() / (props.audioBuffer()!.duration || 1)) * 100).toFixed(2)}%`,
                      }}
                    />
                  </Show>
                </div>
              </>
            }
          >
            <div
              class={ui.dropZone + (dragOver() ? ` ${ui.dropZoneActive}` : '')}
              onClick={() => {
                fileInput.click()
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <div class={ui.dropIcon}>
                <MusicNote />
              </div>
              {/* Decode only — once the buffer exists this whole drop zone is
                  replaced by the waveform, and the analysis progress belongs to
                  the overlay there. */}
              <div class={ui.dropLabel}>{loadLabel()}</div>
              <div class={ui.dropFormats}>MP3, WAV, OGG, FLAC</div>
              <Show when={error()}>
                <div style="color: #ff5a5a; font-size: 12px; margin-top: 8px;">
                  {error()!}
                </div>
              </Show>
            </div>
            <input
              ref={(el) => {
                fileInput = el
              }}
              type="file"
              accept={SUPPORTED_AUDIO}
              style="display:none"
              onChange={handleFileInput}
              aria-label="Upload audio file"
            />
          </Show>
        </Show>

        {/* Presets — render-only first, then the ones built from THIS flame.
            Split because they answer different questions: the first three work
            anywhere, the second three reach into the loaded flame's transforms
            and are the ones that visibly restructure it. */}
        <div>
          <div class={ui.sectionLabel}>Preset</div>
          <div
            class={ui.presetRow}
            role="radiogroup"
            aria-label="Audio reactive presets"
          >
            <For each={RENDER_PRESET_IDS}>
              {(preset) => (
                <button
                  class={
                    ui.presetBtn +
                    (props.audioMapping().preset === preset
                      ? ` ${ui.presetBtnActive}`
                      : '')
                  }
                  onClick={() => {
                    applyPreset(preset)
                  }}
                  aria-label={`${PRESET_LABELS[preset]} preset`}
                  title={PRESET_DESCRIPTIONS[preset]}
                  role="radio"
                  aria-checked={props.audioMapping().preset === preset}
                >
                  {PRESET_LABELS[preset]}
                </button>
              )}
            </For>
          </div>

          <div class={ui.sectionLabel} style="margin-top: 10px;">
            From this flame
          </div>
          <div
            class={ui.presetRow}
            role="radiogroup"
            aria-label="Flame-aware presets"
          >
            <For each={FLAME_PRESET_IDS}>
              {(preset) => {
                // Offered only when the flame can actually satisfy them —
                // a disabled button that explains itself beats one that
                // silently wires nothing.
                const available = () =>
                  buildFlamePreset(preset, props.transforms).length > 0
                return (
                  <button
                    class={
                      ui.presetBtn +
                      (props.audioMapping().preset === preset
                        ? ` ${ui.presetBtnActive}`
                        : '')
                    }
                    disabled={!available()}
                    onClick={() => {
                      applyPreset(preset)
                    }}
                    aria-label={`${PRESET_LABELS[preset]} preset`}
                    title={
                      available()
                        ? PRESET_DESCRIPTIONS[preset]
                        : 'This flame has nothing for this preset to drive'
                    }
                    role="radio"
                    aria-checked={props.audioMapping().preset === preset}
                  >
                    {PRESET_LABELS[preset]}
                  </button>
                )
              }}
            </For>
          </div>
        </div>

        {/* Mappings */}
        <div>
          <div class={ui.mappingsHeader}>
            <div class={ui.sectionLabel}>Mappings</div>
            {/* Randomize lives HERE, not only inside the wiring editor: it
                rewrites exactly the list below, and having to open a modal to
                reroll the thing you are looking at is a detour. */}
            <button
              class={ui.randomizeBtn}
              onClick={randomizeCurrentWiring}
              title="Reroll the wiring for this flame"
            >
              Randomize
            </button>
          </div>
          <div class={ui.mappingsList} role="list">
            <Index each={props.audioMapping().mappings}>
              {(mapping, index) => {
                // Narrow-friendly reads: TS re-widens the target union on every
                // mapping() call, so each helper narrows one snapshot.
                const transformIdxOf = () => {
                  const t = mapping().target
                  return 'transformIdx' in t ? t.transformIdx : 0
                }
                const matrixOf = () => {
                  const t = mapping().target
                  return t.kind === 'transformAffine' ? t.matrix : 'preAffine'
                }
                const paramValueOf = () => {
                  const t = mapping().target
                  if (
                    t.kind === 'renderSetting' ||
                    t.kind === 'transformAffine' ||
                    t.kind === 'finalAffine'
                  ) {
                    return t.param
                  }
                  return t.kind === 'transformProperty' ? t.property : ''
                }
                return (
                  <div class={ui.mappingRow} role="listitem">
                    {/* Top row: routing — source -> target category chain */}
                    <div class={ui.mappingTopRow}>
                      <select
                        class={`${ui.mappingSelect} ${ui.sourceSelect}`}
                        aria-label="Audio source feature"
                        value={mapping().audioFeature}
                        onChange={(e) => {
                          updateMapping(index, {
                            audioFeature: e.currentTarget.value as AudioFeature,
                          })
                        }}
                      >
                        <For each={ALL_FEATURES}>
                          {(f) => (
                            <option value={f}>{AUDIO_FEATURE_LABELS[f]}</option>
                          )}
                        </For>
                      </select>
                      <span class={ui.arrow}>→</span>
                      <select
                        class={ui.mappingSelect}
                        aria-label="Target category"
                        value={mapping().target.kind}
                        onChange={(e) => {
                          const cat = e.currentTarget.value as TargetCategory
                          updateMapping(index, {
                            target: defaultTarget(cat, transformIdxOf()),
                          })
                        }}
                      >
                        <For each={TARGET_CATEGORIES}>
                          {(c) => (
                            <option value={c}>
                              {TARGET_CATEGORY_LABELS[c]}
                            </option>
                          )}
                        </For>
                      </select>
                      {props.transforms.length > 0 &&
                        mapping().target.kind !== 'renderSetting' &&
                        mapping().target.kind !== 'finalAffine' && (
                          <select
                            class={ui.mappingSelect}
                            aria-label="Transform"
                            value={transformIdxOf()}
                            onChange={(e) => {
                              const ti = parseInt(e.currentTarget.value)
                              updateMapping(index, {
                                target: {
                                  ...mapping().target,
                                  transformIdx: ti,
                                } as FlameTarget,
                              })
                            }}
                          >
                            <For each={props.transforms}>
                              {(t) => (
                                <option value={t.index}>{t.label}</option>
                              )}
                            </For>
                          </select>
                        )}
                      {mapping().target.kind === 'transformAffine' && (
                        <select
                          class={`${ui.mappingSelect} ${ui.matrixSelect}`}
                          aria-label="Affine matrix"
                          value={matrixOf()}
                          onChange={(e) => {
                            updateMapping(index, {
                              target: {
                                ...mapping().target,
                                matrix: e.currentTarget.value as
                                  | 'preAffine'
                                  | 'postAffine',
                              } as FlameTarget,
                            })
                          }}
                        >
                          <option value="preAffine">Pre</option>
                          <option value="postAffine">Post</option>
                        </select>
                      )}
                      <button
                        class={ui.removeMappingBtn}
                        onClick={() => {
                          removeMapping(index)
                        }}
                        title="Remove mapping"
                        aria-label="Remove mapping"
                      >
                        ×
                      </button>
                    </div>

                    {/* Bottom row: param + sensitivity */}
                    <div class={ui.mappingBottomRow}>
                      {mapping().target.kind === 'variationWeight' ? (
                        <VariationWeightPills
                          mapping={mapping()}
                          transforms={props.transforms}
                          onSelect={(variationType) => {
                            updateMapping(index, {
                              target: {
                                ...mapping().target,
                                variationType,
                              } as FlameTarget,
                            })
                          }}
                        />
                      ) : (
                        <select
                          class={ui.mappingSelect}
                          aria-label="Target parameter"
                          value={paramValueOf()}
                          onChange={(e) => {
                            const val = e.currentTarget.value
                            const t = mapping().target
                            if (t.kind === 'renderSetting') {
                              updateMapping(index, {
                                target: {
                                  ...t,
                                  param: val as RenderSettingKey,
                                },
                              })
                            } else if (
                              t.kind === 'transformAffine' ||
                              t.kind === 'finalAffine'
                            ) {
                              updateMapping(index, {
                                target: { ...t, param: val as AffineKey },
                              })
                            } else if (t.kind === 'transformProperty') {
                              updateMapping(index, {
                                target: {
                                  ...t,
                                  property: val as TransformPropertyKey,
                                },
                              })
                            }
                          }}
                        >
                          {mapping().target.kind === 'renderSetting' && (
                            <For each={ALL_RENDER_PARAMS}>
                              {(p) => (
                                <option value={p}>
                                  {RENDER_SETTING_LABELS[p]}
                                </option>
                              )}
                            </For>
                          )}
                          {(mapping().target.kind === 'transformAffine' ||
                            mapping().target.kind === 'finalAffine') && (
                            <For each={ALL_AFFINE_KEYS}>
                              {(k) => (
                                <option value={k}>
                                  {AFFINE_KEY_LABELS[k]}
                                </option>
                              )}
                            </For>
                          )}
                          {mapping().target.kind === 'transformProperty' && (
                            <For each={ALL_TRANSFORM_PROPS}>
                              {(p) => (
                                <option value={p}>
                                  {TRANSFORM_PROP_LABELS[p]}
                                </option>
                              )}
                            </For>
                          )}
                        </select>
                      )}
                      <span class={ui.sensitivityLabel}>
                        {mapping().sensitivity.toFixed(1)}x
                      </span>
                      <input
                        type="range"
                        class={ui.sensitivitySlider}
                        min="0.1"
                        max="2"
                        step="0.1"
                        value={mapping().sensitivity}
                        onInput={(e) => {
                          updateMapping(index, {
                            sensitivity: parseFloat(e.currentTarget.value),
                          })
                        }}
                        aria-label="Sensitivity"
                      />
                    </div>
                  </div>
                )
              }}
            </Index>
          </div>
          <div class={ui.mappingActions}>
            <button
              class={ui.addMappingBtn}
              onClick={addMapping}
              aria-label="Add audio mapping"
            >
              + Add mapping
            </button>
            <button
              class={ui.wiringBtn}
              onClick={() => setShowWiringModal(true)}
              aria-label="Open wiring editor"
            >
              Edit Wiring
            </button>
          </div>
        </div>
      </div>

      {/* Status bar — what is loaded and what it is doing. The Live Preview
          toggle used to live down here, a scroll away from the transport it
          belongs to; this space is worth more as the answer to "what am I
          looking at". */}
      <div class={ui.bottomBar}>
        {/* Controls first, on their own row; the read-only facts span the full
            width beneath. Mixed on one line, whichever toggle did not fit
            wrapped onto a row by itself and read as an afterthought rather
            than as part of a set. */}
        <div class={ui.statusToggles}>
          {/* Closing the panel stops the audio, unless you say otherwise. A
              track left playing from a panel you cannot see is a sound with no
              visible cause and no obvious way to stop it — so this defaults
              OFF, and is opt-in for when you DO want to keep listening while
              working on the flame. */}
          <label class={ui.enableToggle}>
            <button
              class={
                ui.toggleSwitch +
                (props.keepPlayingWhenClosed() ? ` ${ui.toggleSwitchOn}` : '')
              }
              onClick={() => {
                props.onKeepPlayingChange(!props.keepPlayingWhenClosed())
              }}
              aria-label="Keep audio playing after closing this panel"
              title="Keep playing after this panel is closed"
            >
              <span class={ui.toggleKnob} />
            </button>
            Keep playing when closed
          </label>
        </div>
        <div class={ui.statusMeta}>
          <span class={ui.statusItem} title="Flame being driven">
            {props.flameName?.trim() || 'Untitled'}
          </span>
          <Show
            when={props.audioSource() === 'file'}
            fallback={<span class={ui.statusDim}>Microphone</span>}
          >
            <span class={ui.statusItem} title="Loaded track">
              {audioFileName() ?? 'No track'}
            </span>
            <Show when={props.audioBuffer()}>
              {(buffer) => (
                <span class={ui.statusDim}>
                  {formatTime(buffer().duration)} ·{' '}
                  {Math.round(buffer().sampleRate / 1000)} kHz
                </span>
              )}
            </Show>
          </Show>
          <span class={ui.statusDim}>
            {props.audioMapping().mappings.length} mapping
            {props.audioMapping().mappings.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Wiring modal overlay */}
      <Show when={showWiringModal()}>
        <AudioWiringModal
          mappings={props.audioMapping().mappings}
          transforms={props.transforms}
          presets={wiringPresets()}
          featureLevels={liveFeatureLevels()}
          liveAnalyzer={props.liveAnalyzer()}
          onMappingsChange={(mappings) => {
            props.onMappingChange({
              preset: 'custom',
              mappings,
            })
          }}
          onClose={() => setShowWiringModal(false)}
        />
      </Show>
    </div>
  )
}
