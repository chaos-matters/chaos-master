import styles from './AudioWiringModal.module.css'
import type { AudioFeature } from '../../utils/audioAnalysis'

export type SourceNodeData = {
  feature: AudioFeature
  label: string
  group: string
  color: string
}

export const AUDIO_SOURCE_GROUPS: {
  label: string
  sources: SourceNodeData[]
}[] = [
  {
    label: 'Frequency Bands',
    sources: [
      {
        feature: 'subBass',
        label: 'Sub Bass',
        group: 'Frequency Bands',
        color: '#7c3aed',
      },
      {
        feature: 'bass',
        label: 'Bass',
        group: 'Frequency Bands',
        color: '#6d28d9',
      },
      {
        feature: 'lowMid',
        label: 'Low Mid',
        group: 'Frequency Bands',
        color: '#5b21b6',
      },
      {
        feature: 'mid',
        label: 'Mid',
        group: 'Frequency Bands',
        color: '#4f46e5',
      },
      {
        feature: 'hiMid',
        label: 'High Mid',
        group: 'Frequency Bands',
        color: '#2563eb',
      },
      {
        feature: 'presence',
        label: 'Presence',
        group: 'Frequency Bands',
        color: '#0891b2',
      },
      {
        feature: 'brilliance',
        label: 'Brilliance',
        group: 'Frequency Bands',
        color: '#0d9488',
      },
      {
        feature: 'fullSpectrum',
        label: 'Full Spectrum',
        group: 'Frequency Bands',
        color: '#6366f1',
      },
    ],
  },
  {
    label: 'Energy',
    sources: [
      { feature: 'rms', label: 'RMS', group: 'Energy', color: '#f59e0b' },
      {
        feature: 'centroid',
        label: 'Centroid',
        group: 'Energy',
        color: '#d97706',
      },
      {
        feature: 'flatness',
        label: 'Flatness',
        group: 'Energy',
        color: '#b45309',
      },
    ],
  },
  {
    label: 'Events',
    sources: [
      { feature: 'beat', label: 'Beat', group: 'Events', color: '#ef4444' },
      { feature: 'onset', label: 'Onset', group: 'Events', color: '#dc2626' },
    ],
  },
]

export function SourceNode(props: {
  source: SourceNodeData
  level: number
  connectionCount: number
  isConnecting: boolean
  isSourceOfSelectedWire: boolean
  isDropTarget: boolean
  isHighlighted: boolean
  onStartConnection: (feature: AudioFeature) => void
  onDragStart: (feature: AudioFeature, e: MouseEvent) => void
}) {
  return (
    <div
      class={styles.sourceCard}
      classList={{
        [styles.sourceCardActive as string]: props.isSourceOfSelectedWire,
        [styles.sourceCardHighlighted as string]: props.isHighlighted,
      }}
    >
      <div
        class={styles.sourceColorBar}
        style={{ background: props.source.color }}
      />
      <span class={styles.sourceName}>{props.source.label}</span>
      <div class={styles.sourceMeter}>
        <div
          class={styles.sourceMeterFill}
          style={{
            width: `${Math.min(100, props.level * 100)}%`,
            background: props.source.color,
          }}
        />
      </div>
      <div class={styles.portWrapper}>
        <div
          class={styles.port}
          classList={{
            [styles.portConnecting as string]: props.isConnecting,
            [styles.portActive as string]: props.isSourceOfSelectedWire,
            [styles.portDropTarget as string]: props.isDropTarget,
            [styles.portHighlighted as string]: props.isHighlighted,
          }}
          role="button"
          tabIndex={0}
          aria-label={`Connect ${props.source.label}`}
          data-source-port={props.source.feature}
          onMouseDown={(e) => {
            e.preventDefault()
            props.onDragStart(props.source.feature, e)
          }}
          onClick={() => {
            props.onStartConnection(props.source.feature)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              props.onStartConnection(props.source.feature)
            }
          }}
        />
        {props.connectionCount > 0 && (
          <span
            class={styles.sourceBadge}
            style={{ background: props.source.color }}
          >
            {props.connectionCount}
          </span>
        )}
      </div>
    </div>
  )
}
