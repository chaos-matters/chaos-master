import { onCleanup } from 'solid-js'
import { Cross } from '@/icons'
import ui from './SonificationPanel.module.css'
import type { SonificationConfig, SonificationModel, } from '@/utils/sonification'

type SonificationPanelProps = {
  onClose: () => void
  enabled: () => boolean
  onEnabledChange: (enabled: boolean) => void
  config: () => SonificationConfig
  onConfigChange: (config: SonificationConfig) => void
}

const MODEL_LABELS: Record<SonificationModel, { label: string; desc: string }> =
  {
    orchestral: {
      label: 'Orchestral',
      desc: 'Transforms → notes',
    },
    ambient: {
      label: 'Ambient',
      desc: 'Complexity → drone',
    },
    percussive: {
      label: 'Percussive',
      desc: 'Transforms → drums',
    },
  }

const MODEL_INFO: Record<SonificationModel, string> = {
  orchestral:
    'Each visible transform becomes a voice playing notes in the selected scale. Transform colors map to pitch and stereo position, weights control velocity, and variation counts shape the waveform.',
  ambient:
    'A continuous harmonic drone built from the fractal structure. Transform complexity determines harmonic density, camera zoom drives filter cutoff, and the palette shapes the tonal character.',
  percussive:
    'Transforms fire as percussive events — kicks, snares, hi-hats, and toms. Weights determine trigger probability, colors pan the stereo field, and the fractal structure drives rhythmic patterns.',
}

const SCALE_LABELS: Record<string, string> = {
  pentatonicMajor: 'Major',
  pentatonicMinor: 'Minor',
  chromatic: 'Chromatic',
}

const MODELS: SonificationModel[] = ['orchestral', 'ambient', 'percussive']
const SCALES = ['pentatonicMajor', 'pentatonicMinor', 'chromatic']

export function SonificationPanel(props: SonificationPanelProps) {
  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') props.onClose()
  }

  window.addEventListener('keydown', handleKey)
  onCleanup(() => {
    window.removeEventListener('keydown', handleKey)
  })

  function updateConfig(patch: Partial<SonificationConfig>) {
    props.onConfigChange({ ...props.config(), ...patch })
  }

  return (
    <div class={ui.container}>
      <div class={ui.header}>
        <span class={ui.title}>Sonification</span>
        <button class={ui.closeBtn} onClick={props.onClose} title="Close (Esc)">
          <Cross />
        </button>
      </div>

      <div class={ui.body}>
        <p class={ui.description}>
          Hear your fractals — flame structure generates real-time audio via the
          Web Audio API.
        </p>

        {/* Model selector */}
        <div>
          <div class={ui.sectionLabel}>Model</div>
          <div class={ui.modelRow}>
            {MODELS.map((model) => (
              <button
                class={
                  ui.modelBtn +
                  (props.config().model === model
                    ? ` ${ui.modelBtnActive}`
                    : '')
                }
                onClick={() => {
                  updateConfig({ model })
                }}
              >
                <span class={ui.modelLabel}>{MODEL_LABELS[model].label}</span>
                <span class={ui.modelDesc}>{MODEL_LABELS[model].desc}</span>
              </button>
            ))}
          </div>
          <div class={ui.modelInfo} style="margin-top: 8px;">
            {MODEL_INFO[props.config().model]}
          </div>
        </div>

        {/* Scale selector */}
        <div>
          <div class={ui.sectionLabel}>Scale</div>
          <div class={ui.scaleRow}>
            {SCALES.map((scale) => (
              <button
                class={
                  ui.scaleBtn +
                  (props.config().scale === scale
                    ? ` ${ui.scaleBtnActive}`
                    : '')
                }
                onClick={() => {
                  updateConfig({
                    scale: scale as SonificationConfig['scale'],
                  })
                }}
              >
                {SCALE_LABELS[scale] ?? scale}
              </button>
            ))}
          </div>
        </div>

        {/* Volume */}
        <div class={ui.sliderGroup}>
          <div class={ui.sliderHeader}>
            <span class={ui.sliderLabel}>Volume</span>
            <span class={ui.sliderValue}>
              {Math.round(props.config().volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            class={ui.sliderInput}
            min="0"
            max="1"
            step="0.05"
            value={props.config().volume}
            onInput={(e) => {
              updateConfig({ volume: parseFloat(e.currentTarget.value) })
            }}
          />
        </div>

        {/* Spatial spread */}
        <div class={ui.sliderGroup}>
          <div class={ui.sliderHeader}>
            <span class={ui.sliderLabel}>Spatial Spread</span>
            <span class={ui.sliderValue}>
              {Math.round(props.config().spatialSpread * 100)}%
            </span>
          </div>
          <input
            type="range"
            class={ui.sliderInput}
            min="0"
            max="1"
            step="0.05"
            value={props.config().spatialSpread}
            onInput={(e) => {
              updateConfig({
                spatialSpread: parseFloat(e.currentTarget.value),
              })
            }}
          />
        </div>

        {/* Reverb mix */}
        <div class={ui.sliderGroup}>
          <div class={ui.sliderHeader}>
            <span class={ui.sliderLabel}>Reverb Mix</span>
            <span class={ui.sliderValue}>
              {Math.round(props.config().reverbMix * 100)}%
            </span>
          </div>
          <input
            type="range"
            class={ui.sliderInput}
            min="0"
            max="1"
            step="0.05"
            value={props.config().reverbMix}
            onInput={(e) => {
              updateConfig({ reverbMix: parseFloat(e.currentTarget.value) })
            }}
          />
        </div>

        {/* Model-specific controls */}
        {props.config().model === 'orchestral' && (
          <div class={ui.sliderGroup}>
            <div class={ui.sliderHeader}>
              <span class={ui.sliderLabel}>Voice Count</span>
              <span class={ui.sliderValue}>{props.config().voiceCount}</span>
            </div>
            <input
              type="range"
              class={ui.sliderInput}
              min="2"
              max="16"
              step="1"
              value={props.config().voiceCount}
              onInput={(e) => {
                updateConfig({ voiceCount: parseInt(e.currentTarget.value) })
              }}
            />
          </div>
        )}

        {props.config().model === 'ambient' && (
          <div class={ui.sliderGroup}>
            <div class={ui.sliderHeader}>
              <span class={ui.sliderLabel}>Harmonic Density</span>
              <span class={ui.sliderValue}>
                {props.config().harmonicDensity.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              class={ui.sliderInput}
              min="0.2"
              max="3"
              step="0.1"
              value={props.config().harmonicDensity}
              onInput={(e) => {
                updateConfig({
                  harmonicDensity: parseFloat(e.currentTarget.value),
                })
              }}
            />
          </div>
        )}

        {props.config().model === 'percussive' && (
          <div class={ui.sliderGroup}>
            <div class={ui.sliderHeader}>
              <span class={ui.sliderLabel}>Trigger Rate</span>
              <span class={ui.sliderValue}>
                {props.config().triggerRate.toFixed(0)}/s
              </span>
            </div>
            <input
              type="range"
              class={ui.sliderInput}
              min="1"
              max="16"
              step="1"
              value={props.config().triggerRate}
              onInput={(e) => {
                updateConfig({
                  triggerRate: parseInt(e.currentTarget.value),
                })
              }}
            />
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div class={ui.bottomBar}>
        <label class={ui.enableToggle}>
          <button
            class={
              ui.toggleSwitch + (props.enabled() ? ` ${ui.toggleSwitchOn}` : '')
            }
            onClick={() => {
              props.onEnabledChange(!props.enabled())
            }}
            aria-label="Toggle sonification"
          >
            <span class={ui.toggleKnob} />
          </button>
          Enable Audio
        </label>
      </div>
    </div>
  )
}
