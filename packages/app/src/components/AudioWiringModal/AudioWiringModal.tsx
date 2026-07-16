import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { flameTargetKey } from '../../utils/audioAnalysis'
import styles from './AudioWiringModal.module.css'
import { ConnectingBanner } from './ConnectingBanner'
import { HeaderBar } from './HeaderBar'
import { NodeGraphView } from './NodeGraphView'
import { ParamsPanel } from './ParamsPanel'
import { SourceColumn } from './SourceColumn'
import { AUDIO_SOURCE_GROUPS } from './SourceNode'
import { TargetGroupCard } from './TargetGroupCard'
import { AffineCell, buildTargetGroups, TargetCell } from './TargetNode'
import { wireId, WireOverlay } from './WireOverlay'
import type { AudioFeature, AudioMappingEntry, FlameTarget, LiveAudioAnalyzer, TransformInfo, } from '../../utils/audioAnalysis'
import type { SourceNodeData } from './SourceNode'
import type { TargetGroupData } from './TargetNode'
import type { WireConnection } from './WireOverlay'

// ── Module-level constants ──

const ALL_SOURCES: SourceNodeData[] = AUDIO_SOURCE_GROUPS.flatMap(
  (g) => g.sources,
)

const SOURCE_BY_FEATURE = new Map<AudioFeature, SourceNodeData>(
  ALL_SOURCES.map((s) => [s.feature, s]),
)

const SOURCE_COLOR_MAP = new Map<AudioFeature, string>(
  ALL_SOURCES.map((s) => [s.feature, s.color]),
)

/** Default values for new mapping entries. */
const NEW_ENTRY_DEFAULTS = {
  sensitivity: 0.3,
  range: [0, 1] as [number, number],
  zoomRange: [0.5, 1.5] as [number, number],
  attackMs: 40,
  releaseMs: 150,
}

const DEFAULT_PRESETS: Record<string, AudioMappingEntry[]> = {
  clear: [],
  'quick-start': [
    {
      audioFeature: 'bass',
      target: { kind: 'renderSetting', param: 'vibrancy' },
      sensitivity: 0.5,
      range: [0.5, 2.0],
      attackMs: 50,
      releaseMs: 200,
    },
    {
      audioFeature: 'mid',
      target: { kind: 'renderSetting', param: 'exposure' },
      sensitivity: 0.4,
      range: [0.8, 1.5],
      attackMs: 40,
      releaseMs: 150,
    },
    {
      audioFeature: 'onset',
      target: { kind: 'renderSetting', param: 'zoom' },
      sensitivity: 0.3,
      range: [1.0, 1.25],
      attackMs: 10,
      releaseMs: 300,
    },
  ],
  'bass-driven': [
    {
      audioFeature: 'subBass',
      target: { kind: 'renderSetting', param: 'gamma' },
      sensitivity: 0.6,
      range: [0.3, 2.0],
      attackMs: 60,
      releaseMs: 250,
    },
    {
      audioFeature: 'bass',
      target: { kind: 'renderSetting', param: 'vibrancy' },
      sensitivity: 0.55,
      range: [0.4, 2.2],
      attackMs: 50,
      releaseMs: 200,
    },
    {
      audioFeature: 'bass',
      target: { kind: 'renderSetting', param: 'exposure' },
      sensitivity: 0.4,
      range: [0.6, 1.6],
      attackMs: 45,
      releaseMs: 180,
    },
    {
      audioFeature: 'beat',
      target: { kind: 'renderSetting', param: 'zoom' },
      sensitivity: 0.45,
      range: [1.0, 1.35],
      attackMs: 5,
      releaseMs: 250,
    },
    {
      audioFeature: 'beat',
      target: { kind: 'renderSetting', param: 'contrast' },
      sensitivity: 0.35,
      range: [0.75, 1.6],
      attackMs: 5,
      releaseMs: 180,
    },
  ],
  'drum-reactive': [
    {
      audioFeature: 'beat',
      target: { kind: 'renderSetting', param: 'zoom' },
      sensitivity: 0.5,
      range: [1.0, 1.45],
      attackMs: 5,
      releaseMs: 280,
    },
    {
      audioFeature: 'beat',
      target: { kind: 'renderSetting', param: 'highlightPower' },
      sensitivity: 0.65,
      range: [0.4, 2.8],
      attackMs: 5,
      releaseMs: 220,
    },
    {
      audioFeature: 'beat',
      target: { kind: 'renderSetting', param: 'skipIters' },
      sensitivity: 0.4,
      range: [-3, 3],
      attackMs: 3,
      releaseMs: 150,
    },
    {
      audioFeature: 'onset',
      target: { kind: 'renderSetting', param: 'contrast' },
      sensitivity: 0.45,
      range: [0.6, 2.0],
      attackMs: 2,
      releaseMs: 120,
    },
    {
      audioFeature: 'onset',
      target: { kind: 'renderSetting', param: 'gamma' },
      sensitivity: 0.35,
      range: [0.5, 2.2],
      attackMs: 2,
      releaseMs: 140,
    },
    {
      audioFeature: 'subBass',
      target: { kind: 'renderSetting', param: 'vibrancy' },
      sensitivity: 0.4,
      range: [0.6, 1.8],
      attackMs: 70,
      releaseMs: 300,
    },
  ],
  'full-spectrum': [
    {
      audioFeature: 'subBass',
      target: { kind: 'renderSetting', param: 'gamma' },
      sensitivity: 0.45,
      range: [0.3, 2.2],
      attackMs: 40,
      releaseMs: 200,
    },
    {
      audioFeature: 'bass',
      target: { kind: 'renderSetting', param: 'vibrancy' },
      sensitivity: 0.5,
      range: [0.5, 2.0],
      attackMs: 40,
      releaseMs: 200,
    },
    {
      audioFeature: 'lowMid',
      target: { kind: 'renderSetting', param: 'exposure' },
      sensitivity: 0.4,
      range: [0.7, 1.5],
      attackMs: 35,
      releaseMs: 180,
    },
    {
      audioFeature: 'mid',
      target: { kind: 'renderSetting', param: 'contrast' },
      sensitivity: 0.4,
      range: [0.7, 1.5],
      attackMs: 35,
      releaseMs: 180,
    },
    {
      audioFeature: 'hiMid',
      target: { kind: 'renderSetting', param: 'palettePhase' },
      sensitivity: 0.3,
      range: [0, 1],
      attackMs: 30,
      releaseMs: 150,
    },
    {
      audioFeature: 'presence',
      target: { kind: 'renderSetting', param: 'highlightPower' },
      sensitivity: 0.45,
      range: [0.5, 2.0],
      attackMs: 25,
      releaseMs: 150,
    },
    {
      audioFeature: 'brilliance',
      target: { kind: 'renderSetting', param: 'lightPower' },
      sensitivity: 0.4,
      range: [0.5, 2.0],
      attackMs: 20,
      releaseMs: 140,
    },
    {
      audioFeature: 'fullSpectrum',
      target: { kind: 'renderSetting', param: 'depthColorPower' },
      sensitivity: 0.35,
      range: [0.4, 2.2],
      attackMs: 50,
      releaseMs: 250,
    },
  ],
  'energy-flow': [
    {
      audioFeature: 'rms',
      target: { kind: 'renderSetting', param: 'vibrancy' },
      sensitivity: 0.55,
      range: [0.4, 2.2],
      attackMs: 30,
      releaseMs: 200,
    },
    {
      audioFeature: 'rms',
      target: { kind: 'renderSetting', param: 'zoom' },
      sensitivity: 0.3,
      range: [1.0, 1.25],
      attackMs: 20,
      releaseMs: 250,
    },
    {
      audioFeature: 'centroid',
      target: { kind: 'renderSetting', param: 'palettePhase' },
      sensitivity: 0.4,
      range: [0, 1],
      attackMs: 40,
      releaseMs: 300,
    },
    {
      audioFeature: 'centroid',
      target: { kind: 'renderSetting', param: 'paletteSpeed' },
      sensitivity: 0.35,
      range: [0, 1],
      attackMs: 45,
      releaseMs: 280,
    },
    {
      audioFeature: 'flatness',
      target: { kind: 'renderSetting', param: 'exposure' },
      sensitivity: 0.3,
      range: [0.7, 1.5],
      attackMs: 50,
      releaseMs: 200,
    },
  ],
  'chaos-morph': [
    {
      audioFeature: 'bass',
      target: {
        kind: 'transformAffine',
        transformIdx: 0,
        matrix: 'preAffine',
        param: 'a',
      },
      sensitivity: 0.35,
      range: [0.7, 1.3],
      attackMs: 40,
      releaseMs: 200,
    },
    {
      audioFeature: 'mid',
      target: {
        kind: 'transformAffine',
        transformIdx: 0,
        matrix: 'preAffine',
        param: 'd',
      },
      sensitivity: 0.35,
      range: [0.7, 1.3],
      attackMs: 35,
      releaseMs: 180,
    },
    {
      audioFeature: 'hiMid',
      target: {
        kind: 'transformAffine',
        transformIdx: 0,
        matrix: 'preAffine',
        param: 'b',
      },
      sensitivity: 0.25,
      range: [0.85, 1.15],
      attackMs: 30,
      releaseMs: 150,
    },
    {
      audioFeature: 'presence',
      target: {
        kind: 'transformAffine',
        transformIdx: 0,
        matrix: 'preAffine',
        param: 'e',
      },
      sensitivity: 0.25,
      range: [0.85, 1.15],
      attackMs: 25,
      releaseMs: 150,
    },
    {
      audioFeature: 'rms',
      target: {
        kind: 'variationWeight',
        transformIdx: 0,
        variationType: 'linear',
      },
      sensitivity: 0.45,
      range: [0.2, 2.0],
      attackMs: 30,
      releaseMs: 200,
    },
    {
      audioFeature: 'beat',
      target: {
        kind: 'transformProperty',
        transformIdx: 0,
        property: 'probability',
      },
      sensitivity: 0.3,
      range: [0.3, 1.5],
      attackMs: 5,
      releaseMs: 200,
    },
    {
      audioFeature: 'onset',
      target: {
        kind: 'transformProperty',
        transformIdx: 0,
        property: 'colorSpeed',
      },
      sensitivity: 0.4,
      range: [0.5, 2.0],
      attackMs: 2,
      releaseMs: 150,
    },
  ],
}

/** Sensible target pools per audio feature for smart randomization. */
const RANDOMIZE_TARGET_POOLS: Record<AudioFeature, FlameTarget[]> = {
  subBass: [
    { kind: 'renderSetting', param: 'gamma' },
    { kind: 'renderSetting', param: 'vibrancy' },
    { kind: 'renderSetting', param: 'exposure' },
    { kind: 'renderSetting', param: 'contrast' },
  ],
  bass: [
    { kind: 'renderSetting', param: 'vibrancy' },
    { kind: 'renderSetting', param: 'exposure' },
    { kind: 'renderSetting', param: 'gamma' },
    { kind: 'renderSetting', param: 'contrast' },
  ],
  lowMid: [
    { kind: 'renderSetting', param: 'exposure' },
    { kind: 'renderSetting', param: 'contrast' },
    { kind: 'renderSetting', param: 'vibrancy' },
  ],
  mid: [
    { kind: 'renderSetting', param: 'contrast' },
    { kind: 'renderSetting', param: 'palettePhase' },
    { kind: 'renderSetting', param: 'exposure' },
    { kind: 'renderSetting', param: 'vibrancy' },
  ],
  hiMid: [
    { kind: 'renderSetting', param: 'palettePhase' },
    { kind: 'renderSetting', param: 'paletteSpeed' },
    { kind: 'renderSetting', param: 'highlightPower' },
  ],
  presence: [
    { kind: 'renderSetting', param: 'highlightPower' },
    { kind: 'renderSetting', param: 'lightPower' },
    { kind: 'renderSetting', param: 'palettePhase' },
  ],
  brilliance: [
    { kind: 'renderSetting', param: 'lightPower' },
    { kind: 'renderSetting', param: 'depthColorPower' },
    { kind: 'renderSetting', param: 'gamma' },
  ],
  fullSpectrum: [
    { kind: 'renderSetting', param: 'depthColorPower' },
    { kind: 'renderSetting', param: 'vibrancy' },
    { kind: 'renderSetting', param: 'exposure' },
  ],
  rms: [
    { kind: 'renderSetting', param: 'vibrancy' },
    { kind: 'renderSetting', param: 'zoom' },
    { kind: 'renderSetting', param: 'exposure' },
  ],
  centroid: [
    { kind: 'renderSetting', param: 'palettePhase' },
    { kind: 'renderSetting', param: 'paletteSpeed' },
  ],
  flatness: [
    { kind: 'renderSetting', param: 'contrast' },
    { kind: 'renderSetting', param: 'gamma' },
    { kind: 'renderSetting', param: 'exposure' },
  ],
  beat: [
    { kind: 'renderSetting', param: 'zoom' },
    { kind: 'renderSetting', param: 'skipIters' },
    { kind: 'renderSetting', param: 'highlightPower' },
    { kind: 'renderSetting', param: 'contrast' },
  ],
  onset: [
    { kind: 'renderSetting', param: 'contrast' },
    { kind: 'renderSetting', param: 'zoom' },
    { kind: 'renderSetting', param: 'gamma' },
  ],
}

const MIN_DRAG_DISTANCE = 3

// ── Helpers ──

function entryToWire(m: AudioMappingEntry): WireConnection {
  return { sourceFeature: m.audioFeature, target: m.target }
}

/** Stable string key for sorting/comparing preset entries. */
function entryStableKey(m: AudioMappingEntry): string {
  return wireId(entryToWire(m))
}

/** Compare two mapping arrays for equality (order-independent). */
function mappingsEqual(
  a: AudioMappingEntry[],
  b: AudioMappingEntry[],
): boolean {
  if (a.length !== b.length) return false
  const aSorted = [...a].sort((x, y) =>
    entryStableKey(x).localeCompare(entryStableKey(y)),
  )
  const bSorted = [...b].sort((x, y) =>
    entryStableKey(x).localeCompare(entryStableKey(y)),
  )
  return aSorted.every((entry, i) => {
    const b = bSorted[i]!
    return (
      entryStableKey(entry) === entryStableKey(b) &&
      entry.sensitivity === b.sensitivity &&
      entry.range[0] === b.range[0] &&
      entry.range[1] === b.range[1] &&
      (entry.attackMs ?? NEW_ENTRY_DEFAULTS.attackMs) ===
        (b.attackMs ?? NEW_ENTRY_DEFAULTS.attackMs) &&
      (entry.releaseMs ?? NEW_ENTRY_DEFAULTS.releaseMs) ===
        (b.releaseMs ?? NEW_ENTRY_DEFAULTS.releaseMs)
    )
  })
}

// ── Component ──

export function AudioWiringModal(props: {
  mappings: AudioMappingEntry[]
  transforms: TransformInfo[]
  onMappingsChange: (mappings: AudioMappingEntry[]) => void
  presets?: Record<string, AudioMappingEntry[]>
  featureLevels?: Record<string, number>
  liveAnalyzer?: LiveAudioAnalyzer | undefined
  onClose: () => void
}) {
  const [viewMode, setViewMode] = createSignal<'list' | 'graph'>(
    (localStorage.getItem('audioWiringViewMode') as 'list' | 'graph') || 'list',
  )
  const [connectingFrom, setConnectingFrom] = createSignal<AudioFeature | null>(
    null,
  )
  const [selectedWire, setSelectedWire] = createSignal<string | null>(null)
  const [expandedGroups, setExpandedGroups] = createSignal<Set<string>>(
    new Set(['render', 'finalAffine']),
  )
  const [searchQuery, setSearchQuery] = createSignal('')
  const [undoStack, setUndoStack] = createSignal<AudioMappingEntry[][]>([])
  const [redoStack, setRedoStack] = createSignal<AudioMappingEntry[][]>([])
  const MAX_UNDO = 50
  const [copiedWiring, setCopiedWiring] = createSignal<
    { audioFeature: AudioFeature; target: FlameTarget }[] | null
  >(null)
  const [pendingPaste, setPendingPaste] = createSignal<{
    transformIdx: number
  } | null>(null)
  const [hoveredWireId, setHoveredWireId] = createSignal<string | null>(null)
  const [replaceToast, setReplaceToast] = createSignal<{
    sourceLabel: string
    targetKey: string
  } | null>(null)
  const [containerRef, setContainerRef] = createSignal<HTMLElement | null>(null)

  // ── Drag state ──
  const [dragFrom, setDragFrom] = createSignal<AudioFeature | null>(null)
  const [dragFromTarget, setDragFromTarget] = createSignal<FlameTarget | null>(
    null,
  )
  const [dragPos, setDragPos] = createSignal<{ x: number; y: number } | null>(
    null,
  )
  const [dragStartPos, setDragStartPos] = createSignal<{
    x: number
    y: number
  } | null>(null)
  const [hoveredDropKey, setHoveredDropKey] = createSignal<string | null>(null)

  const presets = () => props.presets ?? DEFAULT_PRESETS

  const targetGroups = createMemo(() => buildTargetGroups(props.transforms))

  const filteredGroups = createMemo(() => {
    const q = searchQuery().toLowerCase().trim()
    const groups = targetGroups()
    if (!q) return groups
    return groups
      .map((group) => {
        const matchedSubGroups = group.subGroups
          .map((sg) => ({
            ...sg,
            targets: sg.targets.filter(
              (t) =>
                t.paramLabel.toLowerCase().includes(q) ||
                t.label.toLowerCase().includes(q),
            ),
          }))
          .filter((sg) => sg.targets.length > 0)
        return { ...group, subGroups: matchedSubGroups }
      })
      .filter((g) => g.subGroups.length > 0)
  })

  // Wire connections derived from mappings
  const connections = createMemo(() => props.mappings.map(entryToWire))

  // Maps for quick connection lookup
  const connectionByTarget = createMemo(() => {
    const map = new Map<string, WireConnection>()
    for (const c of connections()) map.set(flameTargetKey(c.target), c)
    return map
  })

  const connectionBySource = createMemo(() => {
    const map = new Map<AudioFeature, WireConnection[]>()
    for (const c of connections()) {
      const existing = map.get(c.sourceFeature) ?? []
      existing.push(c)
      map.set(c.sourceFeature, existing)
    }
    return map
  })

  // ── Target lookup maps ──
  const targetByKey = createMemo(() => {
    const map = new Map<string, FlameTarget>()
    for (const g of targetGroups()) {
      for (const sg of g.subGroups) {
        for (const t of sg.targets) {
          map.set(flameTargetKey(t.target), t.target)
        }
      }
    }
    return map
  })

  /** Human-readable label for each target key (used in banner text). */
  const targetLabelByKey = createMemo(() => {
    const map = new Map<string, string>()
    for (const g of targetGroups()) {
      for (const sg of g.subGroups) {
        for (const t of sg.targets) {
          map.set(flameTargetKey(t.target), t.label)
        }
      }
    }
    return map
  })

  // Highlighted wire — tracking which ports to glow on hover
  const highlightedSource = createMemo((): AudioFeature | null => {
    const id = hoveredWireId()
    if (!id) return null
    const conn = connections().find((c) => wireId(c) === id)
    return conn?.sourceFeature ?? null
  })

  const highlightedTargetKey = createMemo((): string | null => {
    const id = hoveredWireId()
    if (!id) return null
    const conn = connections().find((c) => wireId(c) === id)
    return conn ? flameTargetKey(conn.target) : null
  })

  // Selected mapping entry for the bottom parameter panel
  const selectedEntry = createMemo((): AudioMappingEntry | null => {
    const id = selectedWire()
    if (!id) return null
    return props.mappings.find((m) => wireId(entryToWire(m)) === id) ?? null
  })

  // ── Connection handlers ──

  function startConnection(feature: AudioFeature) {
    if (connectingFrom() === feature) {
      setConnectingFrom(null)
    } else {
      setConnectingFrom(feature)
      setSelectedWire(null)
    }
  }

  function completeConnection(target: FlameTarget) {
    const source = connectingFrom()
    if (!source) return

    doConnect(source, target)
    setConnectingFrom(null)
  }

  function doConnect(source: AudioFeature, target: FlameTarget) {
    const tgtKey = flameTargetKey(target)
    const existingWire = connectionByTarget().get(tgtKey)
    if (existingWire && existingWire.sourceFeature === source) {
      setSelectedWire(wireId(existingWire))
      return
    }

    saveForUndo()
    let next = [...props.mappings]
    if (existingWire) {
      const oldLabel = getSourceLabel(existingWire.sourceFeature)
      next = next.filter((m) => flameTargetKey(m.target) !== tgtKey)
      // Show replacement toast
      setReplaceToast({ sourceLabel: oldLabel, targetKey: tgtKey })
      setTimeout(() => setReplaceToast(null), 2500)
    }

    const isZoom = target.kind === 'renderSetting' && target.param === 'zoom'

    const newEntry: AudioMappingEntry = {
      audioFeature: source,
      target,
      sensitivity: NEW_ENTRY_DEFAULTS.sensitivity,
      range: isZoom
        ? [...NEW_ENTRY_DEFAULTS.zoomRange]
        : [...NEW_ENTRY_DEFAULTS.range],
      attackMs: NEW_ENTRY_DEFAULTS.attackMs,
      releaseMs: NEW_ENTRY_DEFAULTS.releaseMs,
    }
    next.push(newEntry)
    props.onMappingsChange(next)
    setSelectedWire(wireId({ sourceFeature: source, target }))
  }

  function updateSelectedEntry(updates: Partial<AudioMappingEntry>) {
    const id = selectedWire()
    if (!id) return
    const next = props.mappings.map((m) => {
      if (wireId(entryToWire(m)) === id) {
        return { ...m, ...updates }
      }
      return m
    })
    props.onMappingsChange(next)
  }

  function saveForUndo() {
    setUndoStack((stack) => {
      if (stack.length >= MAX_UNDO) {
        stack = stack.slice(1)
      }
      return [...stack, props.mappings]
    })
    setRedoStack([])
  }

  function undo() {
    const stack = undoStack()
    if (stack.length === 0) return
    const prev = stack[stack.length - 1]!
    setUndoStack(stack.slice(0, -1))
    setRedoStack((rs) => [...rs, props.mappings])
    props.onMappingsChange(prev)
    setSelectedWire(null)
  }

  function redo() {
    const stack = redoStack()
    if (stack.length === 0) return
    const next = stack[stack.length - 1]!
    setRedoStack(stack.slice(0, -1))
    setUndoStack((us) => [...us, props.mappings])
    props.onMappingsChange(next)
    setSelectedWire(null)
  }

  function handleDeleteWire(wireIdToDelete: string) {
    saveForUndo()
    const next = props.mappings.filter(
      (m) => wireId(entryToWire(m)) !== wireIdToDelete,
    )
    props.onMappingsChange(next)
    setSelectedWire(null)
  }

  function deleteSelectedEntry() {
    const id = selectedWire()
    if (!id) return
    handleDeleteWire(id)
  }

  // ── Drag handlers ──

  function handleDragStart(feature: AudioFeature, e: MouseEvent) {
    setDragFrom(feature)
    setDragFromTarget(null)
    setConnectingFrom(null)
    setSelectedWire(null)
    setDragStartPos({ x: e.clientX, y: e.clientY })
  }

  function handleTargetDragStart(target: FlameTarget, e: MouseEvent) {
    setDragFromTarget(target)
    setDragFrom(null)
    setConnectingFrom(null)
    setSelectedWire(null)
    setDragStartPos({ x: e.clientX, y: e.clientY })
  }

  function handleMouseMove(e: MouseEvent) {
    if ((!dragFrom() && !dragFromTarget()) || !containerRef()) return
    const rect = containerRef()!.getBoundingClientRect()
    setDragPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })

    // Detect port under cursor for drop target highlighting
    const elUnder = document.elementFromPoint(
      e.clientX,
      e.clientY,
    ) as HTMLElement | null
    if (dragFrom()) {
      // Source → Target: look for target port
      const targetPort = elUnder?.closest(
        '[data-target-port]',
      ) as HTMLElement | null
      setHoveredDropKey(targetPort?.getAttribute('data-target-port') ?? null)
    } else if (dragFromTarget()) {
      // Target → Source: look for source port
      const sourcePort = elUnder?.closest(
        '[data-source-port]',
      ) as HTMLElement | null
      setHoveredDropKey(sourcePort?.getAttribute('data-source-port') ?? null)
    }
  }

  function handleMouseUp(e: MouseEvent) {
    const source = dragFrom()
    const target = dragFromTarget()
    const startPos = dragStartPos()

    if (!source && !target) return

    // Check minimum drag distance
    if (startPos) {
      const dx = e.clientX - startPos.x
      const dy = e.clientY - startPos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < MIN_DRAG_DISTANCE) {
        // Too short — treat as a click, don't complete connection
        setDragFrom(null)
        setDragFromTarget(null)
        setDragPos(null)
        setDragStartPos(null)
        return
      }
    }

    // Temporarily disable pointer-events on SVG wires for elementFromPoint
    const svg = containerRef()?.querySelector('svg') as SVGSVGElement | null
    if (svg) svg.style.pointerEvents = 'none'

    const elUnder = document.elementFromPoint(
      e.clientX,
      e.clientY,
    ) as HTMLElement | null
    if (svg) svg.style.pointerEvents = ''

    if (source) {
      // Source → Target drop: find target port under cursor
      const targetPortEl = elUnder?.closest(
        '[data-target-port]',
      ) as HTMLElement | null
      const targetKey = targetPortEl?.getAttribute('data-target-port')

      if (targetKey) {
        const resolvedTarget = targetByKey().get(targetKey)
        if (resolvedTarget) {
          doConnect(source, resolvedTarget)
        }
      }
    } else if (target) {
      // Target → Source drop: find source port under cursor
      const sourcePortEl = elUnder?.closest(
        '[data-source-port]',
      ) as HTMLElement | null
      const sourceFeature = sourcePortEl?.getAttribute(
        'data-source-port',
      ) as AudioFeature | null

      if (sourceFeature) {
        doConnect(sourceFeature, target)
      }
    }

    // Reset drag state
    setDragFrom(null)
    setDragFromTarget(null)
    setDragPos(null)
    setDragStartPos(null)
    setHoveredDropKey(null)
  }

  // ── Click on overlay background ──

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      setConnectingFrom(null)
      setSelectedWire(null)
      setPendingPaste(null)
    }
  }

  // ── Keyboard ──

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (importPanel()) {
        setImportPanel(null)
      } else if (pendingPaste()) {
        setPendingPaste(null)
      } else if (dragFrom()) {
        setDragFrom(null)
        setDragPos(null)
        setDragStartPos(null)
        setHoveredDropKey(null)
      } else if (dragFromTarget()) {
        setDragFromTarget(null)
        setDragPos(null)
        setDragStartPos(null)
        setHoveredDropKey(null)
      } else if (connectingFrom()) {
        setConnectingFrom(null)
      } else if (selectedWire()) {
        setSelectedWire(null)
      } else {
        props.onClose()
      }
    }
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      if (e.shiftKey) {
        redo()
      } else {
        undo()
      }
      return
    }
    if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      redo()
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      deleteSelectedEntry()
    }
  }

  // ── Collapsible groups ──

  function toggleGroup(kind: string) {
    const next = new Set(expandedGroups())
    if (next.has(kind)) {
      next.delete(kind)
    } else {
      next.add(kind)
    }
    setExpandedGroups(next)
  }

  function expandAll() {
    setExpandedGroups(new Set(targetGroups().map((g) => g.kind)))
  }

  function collapseAll() {
    setExpandedGroups(new Set<string>())
  }

  function copyWiring(transformIdx: number) {
    const entries = props.mappings.filter((m) => {
      const tgt = m.target
      return (
        (tgt.kind === 'transformAffine' && tgt.transformIdx === transformIdx) ||
        (tgt.kind === 'transformProperty' &&
          tgt.transformIdx === transformIdx) ||
        (tgt.kind === 'variationWeight' && tgt.transformIdx === transformIdx)
      )
    })
    setCopiedWiring(
      entries.map((e) => ({ audioFeature: e.audioFeature, target: e.target })),
    )
  }

  function pasteWiring(transformIdx: number) {
    const wiring = copiedWiring()
    if (!wiring || wiring.length === 0) return

    // Check if target transform already has connections → require confirmation
    const hasExisting = props.mappings.some(
      (m) =>
        m.target.kind !== 'renderSetting' &&
        m.target.kind !== 'finalAffine' &&
        (m.target as { transformIdx?: number }).transformIdx === transformIdx,
    )

    if (hasExisting) {
      const pending = pendingPaste()
      if (pending?.transformIdx !== transformIdx) {
        setPendingPaste({ transformIdx })
        return
      }
      setPendingPaste(null)
    }

    for (const entry of wiring) {
      const newTarget = { ...entry.target, transformIdx } as FlameTarget
      doConnect(entry.audioFeature, newTarget)
    }
  }

  // ── Wiring JSON export / import ──

  const [exportCopied, setExportCopied] = createSignal(false)
  let exportCopiedTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    clearTimeout(exportCopiedTimer)
  })

  function exportJSON() {
    const json = JSON.stringify(props.mappings, null, 2)
    globalThis.navigator.clipboard
      .writeText(json)
      .then(() => {
        // Button-local feedback — this overlay sits above every global toast
        // layer, so confirmation must live inside the modal itself.
        setExportCopied(true)
        clearTimeout(exportCopiedTimer)
        exportCopiedTimer = setTimeout(() => setExportCopied(false), 1600)
      })
      .catch(() => {
        // Clipboard unavailable (permissions/insecure context) — last resort.
        prompt('Copy this JSON:', json)
      })
  }

  /** Parse + validate wiring JSON; null when it isn't a mapping array. */
  function parseWiringJSON(text: string): AudioMappingEntry[] | null {
    try {
      const parsed: unknown = JSON.parse(text)
      if (!Array.isArray(parsed)) return null
      const valid = parsed.every((entry: unknown) => {
        if (entry === null || typeof entry !== 'object') return false
        const e = entry as Record<string, unknown>
        return (
          typeof e.audioFeature === 'string' &&
          e.target !== null &&
          typeof e.target === 'object' &&
          typeof (e.target as Record<string, unknown>).kind === 'string' &&
          typeof e.sensitivity === 'number' &&
          Array.isArray(e.range) &&
          e.range.length === 2
        )
      })
      return valid ? (parsed as AudioMappingEntry[]) : null
    } catch {
      return null
    }
  }

  const [importPanel, setImportPanel] = createSignal<{
    text: string
    error: string | null
    fromClipboard: boolean
  } | null>(null)
  let importFileInput: HTMLInputElement | undefined

  /** Open the import panel, pre-filled from the clipboard when it already
   *  holds valid wiring JSON (readText needs a user gesture — this click). */
  function importJSON() {
    void (async () => {
      let text = ''
      let fromClipboard = false
      try {
        const clip = await globalThis.navigator.clipboard.readText()
        if (clip && parseWiringJSON(clip) !== null) {
          text = clip
          fromClipboard = true
        }
      } catch {
        // Read permission denied or unsupported — fall through to manual paste.
      }
      setImportPanel({ text, error: null, fromClipboard })
    })()
  }

  function applyImport() {
    const panel = importPanel()
    if (!panel) return
    const parsed = parseWiringJSON(panel.text)
    if (parsed === null) {
      setImportPanel({
        ...panel,
        error:
          'Invalid wiring JSON — expected an array of mapping entries (audioFeature, target, sensitivity, range).',
      })
      return
    }
    saveForUndo()
    props.onMappingsChange(parsed)
    setSelectedWire(null)
    setConnectingFrom(null)
    setImportPanel(null)
  }

  function loadWiringFile(file: File) {
    void file.text().then((text) => {
      const panel = importPanel()
      if (!panel) return
      setImportPanel({
        text,
        fromClipboard: false,
        error:
          parseWiringJSON(text) === null
            ? 'That file does not contain valid wiring JSON.'
            : null,
      })
    })
  }

  function randomizeWiring() {
    saveForUndo()
    const sources = ALL_SOURCES.map((s) => s.feature)
    // Pick 5-9 random sources
    const count = 5 + Math.floor(Math.random() * 5)
    const shuffled = [...sources].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, count)

    const entries: AudioMappingEntry[] = []
    for (const source of selected) {
      const pool = [...(RANDOMIZE_TARGET_POOLS[source] ?? [])]

      // Add a few transform targets when transforms exist
      if (props.transforms.length > 0) {
        const txIdx = Math.floor(Math.random() * props.transforms.length)
        pool.push(
          {
            kind: 'transformAffine' as const,
            transformIdx: txIdx,
            matrix: 'preAffine',
            param: 'a',
          },
          {
            kind: 'transformAffine' as const,
            transformIdx: txIdx,
            matrix: 'preAffine',
            param: 'd',
          },
          {
            kind: 'transformProperty' as const,
            transformIdx: txIdx,
            property: 'probability',
          },
        )
        if (props.transforms[txIdx]!.variations.length > 0) {
          const v =
            props.transforms[txIdx]!.variations[
              Math.floor(
                Math.random() * props.transforms[txIdx]!.variations.length,
              )
            ]!
          pool.push({
            kind: 'variationWeight' as const,
            transformIdx: txIdx,
            variationType: v.type,
          })
        }
      }

      // Pick 1-2 targets from the pool
      const tgtCount = 1 + Math.floor(Math.random() * 2)
      const tgtShuffled = [...pool].sort(() => Math.random() - 0.5)
      for (let i = 0; i < Math.min(tgtCount, tgtShuffled.length); i++) {
        const target = tgtShuffled[i]!
        const isZoom =
          target.kind === 'renderSetting' && target.param === 'zoom'
        entries.push({
          audioFeature: source,
          target,
          sensitivity: Math.round((0.2 + Math.random() * 0.5) * 100) / 100,
          range: isZoom
            ? [0.95 + Math.random() * 0.1, 1.15 + Math.random() * 0.2]
            : [0.3 + Math.random() * 0.4, 1.3 + Math.random() * 0.9],
          attackMs: 5 + Math.floor(Math.random() * 60),
          releaseMs: 100 + Math.floor(Math.random() * 250),
        })
      }
    }
    props.onMappingsChange(entries)
    setSelectedWire(null)
    setConnectingFrom(null)
  }

  // ── Lifecycle ──

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  })

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  })

  // ── Active preset detection (full comparison) ──

  const activePreset = createMemo(() => {
    for (const [name, entries] of Object.entries(presets())) {
      if (mappingsEqual(props.mappings, entries)) return name
    }
    return ''
  })

  // ── Helpers ──

  function getSourceLabel(feature: AudioFeature): string {
    return SOURCE_BY_FEATURE.get(feature)?.label ?? feature
  }

  function getTargetLabel(target: FlameTarget): string {
    return (
      targetLabelByKey().get(flameTargetKey(target)) ?? flameTargetKey(target)
    )
  }

  // ── Render ──

  function renderAffineCell(
    node: { target: FlameTarget; label: string; paramLabel: string },
    matrixLabel: string,
    isConnectingGlobal: boolean,
    connByTarget: Map<string, { sourceFeature: AudioFeature }>,
    selTgtKey: string | null,
    dragFromFeature: AudioFeature | null,
    hoveredDropKey: string | null,
    highlightedTgtKey: string | null,
    onComplete: (target: FlameTarget) => void,
    onTargetDragStart: (target: FlameTarget, e: MouseEvent) => void,
  ) {
    const key = flameTargetKey(node.target)
    const conn = connByTarget.get(key)
    const connectedSourceLabel = conn
      ? getSourceLabel(conn.sourceFeature)
      : undefined
    const isTargetOfSelected = selTgtKey === key
    const isDropTarget = !!dragFromFeature && hoveredDropKey === key

    return (
      <AffineCell
        label={`${matrixLabel}.${node.paramLabel}`}
        target={node.target}
        isConnecting={isConnectingGlobal}
        isTargetOfSelectedWire={isTargetOfSelected}
        isDropTarget={isDropTarget}
        isHighlighted={highlightedTgtKey === key}
        connectedSourceLabel={connectedSourceLabel}
        onCompleteConnection={onComplete}
        onDragStart={onTargetDragStart}
      />
    )
  }

  function renderTargetCell(
    node: {
      target: FlameTarget
      label: string
      paramLabel: string
    },
    isConnectingGlobal: boolean,
    connByTarget: Map<string, { sourceFeature: AudioFeature }>,
    selTgtKey: string | null,
    dragFromFeature: AudioFeature | null,
    hoveredDropKey: string | null,
    highlightedTgtKey: string | null,
    onComplete: (target: FlameTarget) => void,
    onTargetDragStart: (target: FlameTarget, e: MouseEvent) => void,
  ) {
    const key = flameTargetKey(node.target)
    const conn = connByTarget.get(key)
    const connectedSourceLabel = conn
      ? getSourceLabel(conn.sourceFeature)
      : undefined
    const isTargetOfSelected = selTgtKey === key
    const isDropTarget = !!dragFromFeature && hoveredDropKey === key

    return (
      <TargetCell
        node={node}
        isConnecting={isConnectingGlobal}
        isTargetOfSelectedWire={isTargetOfSelected}
        isDropTarget={isDropTarget}
        isHighlighted={highlightedTgtKey === key}
        connectedSourceLabel={connectedSourceLabel}
        onCompleteConnection={onComplete}
        onDragStart={onTargetDragStart}
      />
    )
  }

  function renderTargetGroup(
    group: TargetGroupData,
    selTgtKey: string | null,
    connectingFromFeature: AudioFeature | null,
    dragFromFeature: AudioFeature | null,
    hoveredDropKey: string | null,
    highlightedTgtKey: string | null,
    connByTarget: Map<string, { sourceFeature: AudioFeature }>,
    onComplete: (target: FlameTarget) => void,
    onTargetDragStart: (target: FlameTarget, e: MouseEvent) => void,
  ) {
    const isConnectingGlobal = !!connectingFromFeature || !!dragFromFeature

    return group.subGroups.map((sg) => {
      if (sg.compact) {
        return (
          <div class={styles.affineBlock}>
            {sg.label && <div class={styles.subSectionLabel}>{sg.label}</div>}
            {sg.targets.map((node) =>
              renderAffineCell(
                node,
                sg.label,
                isConnectingGlobal,
                connByTarget,
                selTgtKey,
                dragFromFeature,
                hoveredDropKey,
                highlightedTgtKey,
                onComplete,
                onTargetDragStart,
              ),
            )}
          </div>
        )
      }
      return (
        <>
          {sg.label && <div class={styles.subSectionLabel}>{sg.label}</div>}
          {sg.targets.map((node) =>
            renderTargetCell(
              node,
              isConnectingGlobal,
              connByTarget,
              selTgtKey,
              dragFromFeature,
              hoveredDropKey,
              highlightedTgtKey,
              onComplete,
              onTargetDragStart,
            ),
          )}
        </>
      )
    })
  }

  return (
    <div class={styles.overlay} onClick={handleOverlayClick}>
      <HeaderBar
        presets={presets()}
        activePreset={activePreset()}
        canUndo={undoStack().length > 0}
        canRedo={redoStack().length > 0}
        totalConnections={props.mappings.length}
        onSelectPreset={(name) => {
          const entries = presets()[name]
          if (entries) {
            saveForUndo()
            props.onMappingsChange(entries)
            setSelectedWire(null)
            setConnectingFrom(null)
          }
        }}
        onUndo={undo}
        onRedo={redo}
        onRandomize={randomizeWiring}
        exportCopied={exportCopied()}
        onExportJSON={exportJSON}
        onImportJSON={importJSON}
        onClose={props.onClose}
      />

      {/* View mode toggle */}
      <div class={styles.viewToggleRow}>
        <button
          type="button"
          class={styles.viewToggleBtn}
          classList={{
            [styles.viewToggleBtnActive as string]: viewMode() === 'list',
          }}
          onClick={() => {
            setViewMode('list')
            localStorage.setItem('audioWiringViewMode', 'list')
          }}
        >
          List
        </button>
        <button
          type="button"
          class={styles.viewToggleBtn}
          classList={{
            [styles.viewToggleBtnActive as string]: viewMode() === 'graph',
          }}
          onClick={() => {
            setViewMode('graph')
            localStorage.setItem('audioWiringViewMode', 'graph')
          }}
        >
          Graph
        </button>
      </div>

      <Show when={viewMode() === 'list'}>
        {/* Main canvas */}
        <div class={styles.main} ref={setContainerRef}>
          <SourceColumn
            featureLevels={props.featureLevels}
            connectingFrom={connectingFrom()}
            dragFrom={dragFrom()}
            dragFromTarget={dragFromTarget()}
            connectionBySource={connectionBySource()}
            selectedWire={selectedWire()}
            hoveredDropKey={hoveredDropKey()}
            highlightedSource={highlightedSource()}
            onStartConnection={startConnection}
            onDragStart={handleDragStart}
          />

          {/* Targets column — using .map() for expandedGroups() reactivity */}
          <div class={styles.targetsColumn}>
            <div class={styles.columnLabel}>Flame Parameters</div>
            <input
              type="text"
              class={styles.searchInput}
              placeholder="Filter targets..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <div class={styles.expandRow}>
              <button
                type="button"
                class={styles.expandBtn}
                onClick={expandAll}
              >
                Expand All
              </button>
              <button
                type="button"
                class={styles.expandBtn}
                onClick={collapseAll}
              >
                Collapse All
              </button>
            </div>
            <Show when={filteredGroups().length === 0}>
              <div class={styles.emptyState}>
                <span class={styles.emptyStateText}>
                  {targetGroups().length === 0
                    ? 'No flame parameters available. Load a fractal to start wiring audio sources to render targets.'
                    : 'No targets match your search.'}
                </span>
              </div>
            </Show>
            {filteredGroups().map((group) => {
              const isOpen =
                searchQuery() !== '' || expandedGroups().has(group.kind)
              const selEntry = selectedEntry()
              const selTgtKey = selEntry
                ? flameTargetKey(selEntry.target)
                : null

              const groupConnCount = group.subGroups.reduce(
                (sum, sg) =>
                  sum +
                  sg.targets.filter((t) =>
                    connectionByTarget().has(flameTargetKey(t.target)),
                  ).length,
                0,
              )

              const txIdx = group.kind.startsWith('tx-')
                ? parseInt(group.kind.slice(3), 10)
                : -1

              return (
                <TargetGroupCard
                  group={group}
                  isOpen={isOpen}
                  groupConnCount={groupConnCount}
                  hasCopiedData={
                    copiedWiring() !== null && copiedWiring()!.length > 0
                  }
                  pendingPasteTransformIdx={
                    pendingPaste()?.transformIdx ?? null
                  }
                  confirmPasteMode={pendingPaste()?.transformIdx === txIdx}
                  onToggle={() => {
                    toggleGroup(group.kind)
                  }}
                  onCopy={() => {
                    copyWiring(txIdx)
                  }}
                  onPaste={() => {
                    pasteWiring(txIdx)
                  }}
                >
                  {renderTargetGroup(
                    group,
                    selTgtKey,
                    connectingFrom(),
                    dragFrom(),
                    hoveredDropKey(),
                    highlightedTargetKey(),
                    connectionByTarget(),
                    completeConnection,
                    handleTargetDragStart,
                  )}
                </TargetGroupCard>
              )
            })}
          </div>

          <WireOverlay
            connections={connections()}
            selectedWire={selectedWire()}
            connectingFrom={connectingFrom()}
            dragFrom={dragFrom()}
            dragFromTarget={dragFromTarget()}
            dragPos={dragPos()}
            containerRef={containerRef()}
            sourceColorMap={SOURCE_COLOR_MAP}
            onSelectWire={(id) => {
              setSelectedWire(id)
              setConnectingFrom(null)
            }}
            onDeleteWire={handleDeleteWire}
            onHoverWire={setHoveredWireId}
          />

          <ConnectingBanner
            connectingSourceLabel={
              connectingFrom()
                ? (SOURCE_BY_FEATURE.get(connectingFrom()!)?.label ?? null)
                : null
            }
            draggingSourceLabel={
              dragFrom()
                ? (SOURCE_BY_FEATURE.get(dragFrom()!)?.label ?? null)
                : null
            }
            draggingTargetLabel={
              dragFromTarget() ? getTargetLabel(dragFromTarget()!) : null
            }
            toast={replaceToast()}
          />
        </div>
      </Show>

      <Show when={viewMode() === 'graph'}>
        <NodeGraphView
          mappings={props.mappings}
          liveAnalyzer={() => props.liveAnalyzer}
          connectionByTarget={connectionByTarget}
          connectionBySource={connectionBySource}
          connectingFrom={() => connectingFrom() ?? undefined}
          selectedWire={() => {
            const id = selectedWire()
            if (!id) return undefined
            const conn = connections().find((c) => wireId(c) === id)
            return conn
              ? {
                  source: conn.sourceFeature,
                  targetKey: flameTargetKey(conn.target),
                }
              : undefined
          }}
          transforms={props.transforms}
          onStartConnection={startConnection}
          onCompleteConnection={completeConnection}
          onSelectWire={(wire) => {
            if (!wire) {
              setSelectedWire(null)
            } else {
              setSelectedWire(`${wire.source}->${wire.targetKey}`)
            }
          }}
          onDeleteWire={(source, targetKey) => {
            handleDeleteWire(`${source}->${targetKey}`)
          }}
        />
      </Show>

      <ParamsPanel
        entry={selectedEntry()}
        sourceByFeature={SOURCE_BY_FEATURE}
        onUpdate={updateSelectedEntry}
        onDelete={deleteSelectedEntry}
      />

      {/* ── Wiring JSON import panel (in-modal replacement for prompt()) ── */}
      <Show when={importPanel()}>
        {(panel) => (
          <div
            class={styles.importScrim}
            onClick={(e) => {
              if (e.target === e.currentTarget) setImportPanel(null)
            }}
          >
            <div class={styles.importPanel}>
              <div class={styles.importTitle}>Import wiring</div>
              <Show when={panel().fromClipboard}>
                <div class={styles.importHint}>
                  Found valid wiring JSON in your clipboard — review and apply.
                </div>
              </Show>
              <textarea
                class={styles.importTextarea}
                placeholder="Paste wiring JSON here…"
                value={panel().text}
                rows={10}
                spellcheck={false}
                onInput={(e) => {
                  setImportPanel({
                    text: e.currentTarget.value,
                    error: null,
                    fromClipboard: false,
                  })
                }}
              />
              <Show when={panel().error}>
                <div class={styles.importError}>{panel().error}</div>
              </Show>
              <div class={styles.importActions}>
                <input
                  ref={importFileInput}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0]
                    if (file) loadWiringFile(file)
                    e.currentTarget.value = ''
                  }}
                />
                <button
                  type="button"
                  class={styles.importFileBtn}
                  onClick={() => importFileInput?.click()}
                >
                  Load from file…
                </button>
                <div class={styles.importActionsSpacer} />
                <button
                  type="button"
                  class={styles.importCancelBtn}
                  onClick={() => setImportPanel(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class={styles.importApplyBtn}
                  disabled={panel().text.trim().length === 0}
                  onClick={applyImport}
                >
                  Apply wiring
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
