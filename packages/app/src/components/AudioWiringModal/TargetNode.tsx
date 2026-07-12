import { flameTargetKey } from '../../utils/audioAnalysis'
import styles from './AudioWiringModal.module.css'
import type { FlameTarget, TransformInfo } from '../../utils/audioAnalysis'

export type TargetNodeData = {
  target: FlameTarget
  label: string
  paramLabel: string
}

/** A sub-group within a target group (e.g. "Pre-Affine", "Properties"). */
export type TargetSubGroup = {
  label: string
  kind: 'simple' | 'affine' | 'property' | 'variation'
  targets: TargetNodeData[]
  /** When true, render with AffineCell (compact). When false, TargetCell (full-width). */
  compact: boolean
}

export type TargetGroupData = {
  label: string
  kind: string
  subGroups: TargetSubGroup[]
}

export function buildTargetGroups(
  transforms: TransformInfo[],
): TargetGroupData[] {
  const groups: TargetGroupData[] = []

  // Render settings → single sub-group
  groups.push({
    label: 'Render Settings',
    kind: 'render',
    subGroups: [
      {
        label: '',
        kind: 'simple',
        compact: false,
        targets: (
          [
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
          ] as const
        ).map((param) => ({
          target: { kind: 'renderSetting' as const, param },
          label: `Render / ${param}`,
          paramLabel: param,
        })),
      },
    ],
  })

  // Final affine → single sub-group
  const finalAffineParams = ['a', 'b', 'c', 'd', 'e', 'f'] as const
  groups.push({
    label: 'Final Transform',
    kind: 'finalAffine',
    subGroups: [
      {
        label: '',
        kind: 'simple',
        compact: false,
        targets: finalAffineParams.map((param) => ({
          target: { kind: 'finalAffine' as const, param },
          label: `Final / ${param}`,
          paramLabel: param,
        })),
      },
    ],
  })

  // Per-transform groups
  for (const tx of transforms) {
    const preAffine: TargetNodeData[] = []
    const postAffine: TargetNodeData[] = []
    const properties: TargetNodeData[] = []
    const variations: TargetNodeData[] = []

    // Affine matrices
    for (const matrix of ['preAffine', 'postAffine'] as const) {
      for (const param of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        const node: TargetNodeData = {
          target: {
            kind: 'transformAffine' as const,
            transformIdx: tx.index,
            matrix,
            param,
          },
          label: `${tx.label} / ${matrix} / ${param}`,
          paramLabel: `${matrix === 'preAffine' ? 'Pre' : 'Post'}.${param}`,
        }
        if (matrix === 'preAffine') preAffine.push(node)
        else postAffine.push(node)
      }
    }

    // Transform properties
    const propNames = ['probability', 'colorX', 'colorY', 'colorSpeed'] as const
    for (const prop of propNames) {
      properties.push({
        target: {
          kind: 'transformProperty' as const,
          transformIdx: tx.index,
          property: prop,
        },
        label: `${tx.label} / ${prop}`,
        paramLabel: prop,
      })
    }

    // Variation weights
    for (const v of tx.variations) {
      variations.push({
        target: {
          kind: 'variationWeight' as const,
          transformIdx: tx.index,
          variationType: v.type,
        },
        label: `${tx.label} / ${v.type} weight`,
        paramLabel: v.type,
      })
    }

    const subGroups: TargetSubGroup[] = []
    if (preAffine.length > 0) {
      subGroups.push({
        label: 'Pre-Affine',
        kind: 'affine',
        compact: true,
        targets: preAffine,
      })
    }
    if (postAffine.length > 0) {
      subGroups.push({
        label: 'Post-Affine',
        kind: 'affine',
        compact: true,
        targets: postAffine,
      })
    }
    if (properties.length > 0) {
      subGroups.push({
        label: 'Properties',
        kind: 'property',
        compact: false,
        targets: properties,
      })
    }
    if (variations.length > 0) {
      subGroups.push({
        label: 'Variations',
        kind: 'variation',
        compact: false,
        targets: variations,
      })
    }

    groups.push({
      label: tx.label,
      kind: `tx-${tx.index}`,
      subGroups,
    })
  }

  return groups
}

/** Full-width target cell used for properties and variations. */
export function TargetCell(props: {
  node: TargetNodeData
  isConnecting: boolean
  isTargetOfSelectedWire: boolean
  isDropTarget: boolean
  isHighlighted: boolean
  connectedSourceLabel?: string
  onCompleteConnection: (target: FlameTarget) => void
  onDragStart: (target: FlameTarget, e: MouseEvent) => void
}) {
  const key = flameTargetKey(props.node.target)

  return (
    <div
      class={styles.targetCell}
      classList={{
        [styles.targetCellConnected as string]: !!props.connectedSourceLabel,
      }}
    >
      <div
        class={styles.targetPort}
        classList={{
          [styles.targetPortConnecting as string]: props.isConnecting,
          [styles.targetPortActive as string]: props.isTargetOfSelectedWire,
          [styles.targetPortDropTarget as string]: props.isDropTarget,
          [styles.targetPortHighlighted as string]: props.isHighlighted,
        }}
        role="button"
        tabIndex={0}
        aria-label={`Connect to ${props.node.label}`}
        data-target-port={key}
        onMouseDown={(e) => {
          e.preventDefault()
          props.onDragStart(props.node.target, e)
        }}
        onClick={() => {
          props.onCompleteConnection(props.node.target)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            props.onCompleteConnection(props.node.target)
          }
        }}
      />
      <span class={styles.targetArrow}>→</span>
      <span
        class={styles.targetName}
        classList={{
          [styles.targetNameConnected as string]: !!props.connectedSourceLabel,
        }}
      >
        {props.node.paramLabel}
      </span>
      {props.connectedSourceLabel && (
        <span class={styles.targetSourceBadge}>
          {props.connectedSourceLabel}
        </span>
      )}
    </div>
  )
}

/** Compact cell for affine coefficients (used in the affine sub-grid). */
export function AffineCell(props: {
  label: string
  target: FlameTarget
  isConnecting: boolean
  isTargetOfSelectedWire: boolean
  isDropTarget: boolean
  isHighlighted: boolean
  connectedSourceLabel?: string
  onCompleteConnection: (target: FlameTarget) => void
  onDragStart: (target: FlameTarget, e: MouseEvent) => void
}) {
  const key = flameTargetKey(props.target)

  return (
    <div
      class={styles.affineCell}
      classList={{
        [styles.affineCellConnected as string]: !!props.connectedSourceLabel,
      }}
    >
      <div
        class={styles.affineCellPort}
        classList={{
          [styles.affineCellPortConnecting as string]: props.isConnecting,
          [styles.affineCellPortActive as string]: props.isTargetOfSelectedWire,
          [styles.affineCellPortDropTarget as string]: props.isDropTarget,
          [styles.affineCellPortHighlighted as string]: props.isHighlighted,
        }}
        role="button"
        tabIndex={0}
        aria-label={`Connect to ${props.label}`}
        data-target-port={key}
        onMouseDown={(e) => {
          e.preventDefault()
          props.onDragStart(props.target, e)
        }}
        onClick={() => {
          props.onCompleteConnection(props.target)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            props.onCompleteConnection(props.target)
          }
        }}
      />
      <span class={styles.affineCellLabel}>{props.label}</span>
      {props.connectedSourceLabel && (
        <span class={styles.affineCellBadge}>{props.connectedSourceLabel}</span>
      )}
    </div>
  )
}
