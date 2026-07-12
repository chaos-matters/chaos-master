import styles from './AudioWiringModal.module.css'
import { AUDIO_SOURCE_GROUPS, SourceNode } from './SourceNode'
import { wireId } from './WireOverlay'
import type { AudioFeature } from '../../utils/audioAnalysis'
import type { WireConnection } from './WireOverlay'

export { AUDIO_SOURCE_GROUPS }

export function SourceColumn(props: {
  featureLevels: Record<string, number> | undefined
  connectingFrom: AudioFeature | null
  dragFrom: AudioFeature | null
  dragFromTarget: unknown // truthy check only
  connectionBySource: Map<AudioFeature, WireConnection[]>
  selectedWire: string | null
  hoveredDropKey: string | null
  highlightedSource: AudioFeature | null
  onStartConnection: (feature: AudioFeature) => void
  onDragStart: (feature: AudioFeature, e: MouseEvent) => void
}) {
  return (
    <div class={styles.sourcesColumn}>
      <div class={styles.columnLabel}>Audio Sources</div>
      {AUDIO_SOURCE_GROUPS.map((group) => (
        <div class={styles.sourceGroup}>
          <div class={styles.sourceGroupLabel}>{group.label}</div>
          {group.sources.map((source) => {
            const isConnecting = props.connectingFrom === source.feature
            const isDragging = props.dragFrom === source.feature
            const isTargetDrag = props.dragFromTarget !== null
            const sourceConns =
              props.connectionBySource.get(source.feature) ?? []
            const isSourceOfSelected =
              props.selectedWire !== null &&
              sourceConns.some((c) => wireId(c) === props.selectedWire)
            const isDropTarget =
              props.dragFromTarget !== null &&
              props.hoveredDropKey === source.feature

            return (
              <SourceNode
                source={source}
                level={props.featureLevels?.[source.feature] ?? 0.3}
                connectionCount={sourceConns.length}
                isConnecting={isConnecting || isDragging || isTargetDrag}
                isSourceOfSelectedWire={isSourceOfSelected}
                isDropTarget={isDropTarget}
                isHighlighted={props.highlightedSource === source.feature}
                onStartConnection={props.onStartConnection}
                onDragStart={props.onDragStart}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
