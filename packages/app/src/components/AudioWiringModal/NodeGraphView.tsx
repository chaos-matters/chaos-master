import { createEffect, createMemo, createSignal, For, onCleanup, Show, } from 'solid-js'
import { flameTargetKey, getAudioFeatureNormalized, } from '../../utils/audioAnalysis'
import styles from './NodeGraphView.module.css'
import { AUDIO_SOURCE_GROUPS } from './SourceNode'
import { buildTargetGroups } from './TargetNode'
import type { Accessor } from 'solid-js'
import type { AudioFeature, AudioMappingEntry, FlameTarget, LiveAudioAnalyzer, TransformInfo, } from '../../utils/audioAnalysis'

// ── Types ───────────────────────────────────────────────────────────

export interface WireConnectionSimple {
  sourceFeature: AudioFeature
  target: FlameTarget
}

interface Props {
  mappings: AudioMappingEntry[]
  liveAnalyzer: Accessor<LiveAudioAnalyzer | undefined>
  connectionByTarget: Accessor<Map<string, WireConnectionSimple>>
  connectionBySource: Accessor<Map<AudioFeature, WireConnectionSimple[]>>
  connectingFrom: Accessor<AudioFeature | undefined>
  selectedWire: Accessor<
    { source: AudioFeature; targetKey: string } | undefined
  >
  transforms: TransformInfo[]
  onStartConnection: (feature: AudioFeature) => void
  onCompleteConnection: (target: FlameTarget) => void
  onSelectWire: (
    wire: { source: AudioFeature; targetKey: string } | undefined,
  ) => void
  onDeleteWire: (source: AudioFeature, targetKey: string) => void
}

interface NodePos {
  x: number
  y: number
}

interface WireEndpoint {
  id: string
  x: number
  y: number
}

interface WireDef {
  sourceId: string
  targetId: string
  sourceFeature: AudioFeature
  targetKey: string
  color: string
  sx: number
  sy: number
  tx: number
  ty: number
}

// ── Color-param detection ───────────────────────────────────────────

const COLOR_PARAMS = new Set([
  'vibrancy',
  'exposure',
  'gamma',
  'contrast',
  'palettePhase',
  'paletteSpeed',
  'colorX',
  'colorY',
  'highlightPower',
  'lightPower',
  'depthColorPower',
])

function isColorParam(target: FlameTarget): boolean {
  if (target.kind === 'renderSetting') return COLOR_PARAMS.has(target.param)
  if (
    target.kind === 'transformProperty' &&
    (target.property === 'colorX' || target.property === 'colorY')
  )
    return true
  return false
}

// ── Source color lookup ─────────────────────────────────────────────

const sourceColorMap: Record<AudioFeature, string> = {} as Record<
  AudioFeature,
  string
>
for (const g of AUDIO_SOURCE_GROUPS) {
  for (const s of g.sources) {
    sourceColorMap[s.feature] = s.color
  }
}

// ── Layout constants ─────────────────────────────────────────────────

const SOURCE_NODE_W = 160
const TARGET_NODE_MIN_W = 180
const TARGET_HEADER_H = 30
const TARGET_PORT_ROW_H = 20
const TARGET_PORT_ROW_PAD = 10 // padding-top of body

// ── Helpers ──────────────────────────────────────────────────────────

/** Cubic bezier path string from (sx,sy) to (tx,ty). */
function bezierPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = Math.abs(tx - sx) * 0.5
  const cp = Math.max(40, dx)
  return `M ${sx} ${sy} C ${sx + cp} ${sy}, ${tx - cp} ${ty}, ${tx} ${ty}`
}

// ── Node ID helpers ──────────────────────────────────────────────────

function sourceNodeId(feature: AudioFeature): string {
  return `src-${feature}`
}

function targetNodeId(groupIdx: number): string {
  return `tgt-${groupIdx}`
}

function portId(nodeId: string, param: string): string {
  return `${nodeId}:${param}`
}

// ── Component ────────────────────────────────────────────────────────

export function NodeGraphView(props: Props) {
  // ── Pan / zoom state ────────────────────────────────────────────
  const [viewX, setViewX] = createSignal(0)
  const [viewY, setViewY] = createSignal(0)
  const [viewScale, setViewScale] = createSignal(1)

  // ── Node positions (persist across toggles) ──────────────────────
  const [nodePositions, setNodePositions] = createSignal<Map<string, NodePos>>(
    new Map(),
  )

  // ── Drag state: canvas pan ──────────────────────────────────────
  const [isPanning, setIsPanning] = createSignal(false)
  let panStart = { x: 0, y: 0, vx: 0, vy: 0 }

  // ── Drag state: node move ───────────────────────────────────────
  const [draggingNode, setDraggingNode] = createSignal<string | undefined>(
    undefined,
  )
  let nodeDragOff = { x: 0, y: 0 }

  // ── Drag state: wire connection ─────────────────────────────────
  const [wireDragFrom, setWireDragFrom] = createSignal<
    WireEndpoint | undefined
  >(undefined)
  const [wireDragPos, setWireDragPos] = createSignal<
    { x: number; y: number } | undefined
  >(undefined)
  const [wireDropTarget, setWireDropTarget] = createSignal<string | undefined>(
    undefined,
  )

  // ── Live value cache (updated by rAF) ───────────────────────────
  const [liveValues, setLiveValues] = createSignal<Map<string, number>>(
    new Map(),
  )

  // ── Collapse state for sub-groups within target nodes ────────────
  const [collapsedSubGroups, setCollapsedSubGroups] = createSignal<Set<string>>(
    new Set(),
  )

  // ── Layout version (bumped after DOM paint for wire positions) ──
  const [layoutVersion, setLayoutVersion] = createSignal(0)

  // ── Refs ─────────────────────────────────────────────────────────
  let canvasRef!: HTMLDivElement
  let worldRef!: HTMLDivElement

  // ── Derived: target groups ──────────────────────────────────────
  const targetGroups = createMemo(() => buildTargetGroups(props.transforms))

  // ── Source feature list ─────────────────────────────────────────
  const allSources = createMemo(() =>
    AUDIO_SOURCE_GROUPS.flatMap((g) => g.sources),
  )

  // ── Connected source features (for highlighting) ────────────────
  const connectedSources = createMemo(() => {
    const set = new Set<AudioFeature>()
    for (const m of props.mappings) {
      set.add(m.audioFeature)
    }
    return set
  })

  // ── Coordinate conversion ────────────────────────────────────────

  function toCanvasCoords(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const rect = canvasRef.getBoundingClientRect()
    return {
      x: (clientX - rect.left - viewX()) / viewScale(),
      y: (clientY - rect.top - viewY()) / viewScale(),
    }
  }

  // ── Default layout ───────────────────────────────────────────────

  function getDefaultLayout(): Map<string, NodePos> {
    const m = new Map<string, NodePos>()
    const sources = allSources()
    for (let i = 0; i < sources.length; i++) {
      const f = sources[i]!
      m.set(sourceNodeId(f.feature), { x: 40, y: 40 + i * 70 })
    }
    const groups = targetGroups()
    // Layout target nodes in a grid (2 per row) to use horizontal space.
    const TARGETS_PER_ROW = 2
    const COL_X = [440, 700]
    const rowHeights: number[] = []
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!
      const portCount = g.subGroups.reduce(
        (acc, sg) => acc + sg.targets.length,
        0,
      )
      const subGroupLabels = g.subGroups.filter((sg) => sg.label).length
      const h =
        TARGET_HEADER_H +
        portCount * TARGET_PORT_ROW_H +
        TARGET_PORT_ROW_PAD +
        subGroupLabels * 10 +
        8
      const col = i % TARGETS_PER_ROW
      const row = Math.floor(i / TARGETS_PER_ROW)
      // Track the tallest node in each row for y positioning
      if (rowHeights.length <= row) {
        rowHeights.push(h)
      } else {
        rowHeights[row] = Math.max(rowHeights[row]!, h)
      }
      let y = 40
      for (let r = 0; r < row; r++) {
        y += (rowHeights[r] ?? 200) + 24
      }
      m.set(targetNodeId(i), { x: COL_X[col]!, y })
    }
    return m
  }

  // ── Ensure positions exist ────────────────────────────────────────
  // One-time layout: fill in default positions for any node missing one.
  createMemo(() => {
    // Touch the sources + targets so we react to changes
    const _s = allSources()
    const _g = targetGroups()
    const defaults = getDefaultLayout()
    const current = nodePositions()
    let changed = false
    const next = new Map(current)
    for (const [id, pos] of defaults) {
      if (!next.has(id)) {
        next.set(id, pos)
        changed = true
      }
    }
    if (changed) setNodePositions(next)
  })

  // Bump layout version after DOM settles so wireDefs re-queries
  // actual port element positions (instead of using math estimates).
  createEffect(() => {
    const _pos = nodePositions()
    const _vx = viewX()
    const _vy = viewY()
    const _scale = viewScale()
    const _groups = targetGroups()
    const _collapsed = collapsedSubGroups()
    void _pos
    void _vx
    void _vy
    void _scale
    void _groups
    void _collapsed
    requestAnimationFrame(() => setLayoutVersion((v) => v + 1))
  })

  // ── Pan handlers ──────────────────────────────────────────────────

  function onCanvasMouseDown(e: MouseEvent) {
    // Only pan on background (not on nodes or ports)
    const target = e.target as HTMLElement
    if (
      target.closest('[data-graph-node]') ||
      target.closest('[data-graph-port]')
    )
      return

    setIsPanning(true)
    panStart = { x: e.clientX, y: e.clientY, vx: viewX(), vy: viewY() }
    e.preventDefault()
  }

  function onCanvasMouseMove(e: MouseEvent) {
    // Wire dragging
    if (wireDragFrom()) {
      const pos = toCanvasCoords(e.clientX, e.clientY)
      setWireDragPos(pos)

      // Detect drop target
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const portEl = el?.closest('[data-graph-port]') as HTMLElement | null
      setWireDropTarget(portEl?.dataset.graphPort ?? undefined)
      return
    }

    // Node dragging
    const dn = draggingNode()
    if (dn) {
      const pos = toCanvasCoords(e.clientX, e.clientY)
      setNodePositions((prev) => {
        const next = new Map(prev)
        next.set(dn, {
          x: pos.x - nodeDragOff.x,
          y: pos.y - nodeDragOff.y,
        })
        return next
      })
      return
    }

    // Pan
    if (isPanning()) {
      const dx = e.clientX - panStart.x
      const dy = e.clientY - panStart.y
      setViewX(panStart.vx + dx)
      setViewY(panStart.vy + dy)
    }
  }

  function onCanvasMouseUp(_e: MouseEvent) {
    // Wire drop
    if (wireDragFrom()) {
      const dropId = wireDropTarget()
      if (dropId) {
        // Parse nodeId:param from the port ID
        const parts = dropId.split(':')
        // Find the target from buildTargetGroups
        const groups = targetGroups()
        const groupIdx = parseInt(parts[0]?.replace('tgt-', '') ?? '', 10)
        if (!isNaN(groupIdx) && groups[groupIdx]) {
          const paramLabel = parts[1]
          const sg = groups[groupIdx].subGroups
          for (const sub of sg) {
            const tgt = sub.targets.find((t) => t.paramLabel === paramLabel)
            if (tgt) {
              // completeConnection will call onStartConnection if needed
              const fromFeature = wireDragFrom()!.id as AudioFeature
              // Ensure connecting is set
              if (props.connectingFrom() !== fromFeature) {
                props.onStartConnection(fromFeature)
              }
              props.onCompleteConnection(tgt.target)
              break
            }
          }
        }
      }
      setWireDragFrom(undefined)
      setWireDragPos(undefined)
      setWireDropTarget(undefined)
      return
    }

    // Node drag end
    if (draggingNode()) {
      setDraggingNode(undefined)
      return
    }

    // Pan end
    setIsPanning(false)
  }

  // ── Wheel zoom ────────────────────────────────────────────────────

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const rect = canvasRef.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const oldScale = viewScale()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const newScale = Math.max(0.1, Math.min(3, oldScale * factor))

    // Zoom toward mouse position
    const worldX = (mx - viewX()) / oldScale
    const worldY = (my - viewY()) / oldScale
    setViewX(mx - worldX * newScale)
    setViewY(my - worldY * newScale)
    setViewScale(newScale)
  }

  // ── Node drag start ──────────────────────────────────────────────

  function onNodeHeaderDown(nodeId: string, e: MouseEvent) {
    e.preventDefault()
    const pos = nodePositions().get(nodeId)
    if (!pos) return
    const canvasPos = toCanvasCoords(e.clientX, e.clientY)
    nodeDragOff = {
      x: canvasPos.x - pos.x,
      y: canvasPos.y - pos.y,
    }
    setDraggingNode(nodeId)
  }

  // ── Port drag start (for wire connection) ────────────────────────

  function onSourcePortDown(feature: AudioFeature, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const world = worldRef
    if (!world) return
    const worldRect = world.getBoundingClientRect()
    const scale = viewScale()
    const portEl = (e.target as HTMLElement).closest('[data-graph-port]')
    if (!portEl) return
    const rect = portEl.getBoundingClientRect()
    const pos = {
      x: (rect.left + rect.width / 2 - worldRect.left) / scale,
      y: (rect.top + rect.height / 2 - worldRect.top) / scale,
    }
    setWireDragFrom({ id: feature, x: pos.x, y: pos.y })
    setWireDragPos({ x: pos.x, y: pos.y })
    props.onStartConnection(feature)
  }

  function onTargetPortDown(target: FlameTarget, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const tkey = flameTargetKey(target)
    const world = worldRef
    if (!world) return
    const worldRect = world.getBoundingClientRect()
    const scale = viewScale()
    const portEl = (e.target as HTMLElement).closest('[data-graph-port]')
    if (!portEl) return
    const rect = portEl.getBoundingClientRect()
    const pos = {
      x: (rect.left + rect.width / 2 - worldRect.left) / scale,
      y: (rect.top + rect.height / 2 - worldRect.top) / scale,
    }
    setWireDragFrom({ id: tkey, x: pos.x, y: pos.y })
    setWireDragPos({ x: pos.x, y: pos.y })
  }

  // ── Port canvas position helpers ──────────────────────────────────

  // ── Wire definitions (computed from DOM port positions) ──────────

  const wireDefs = createMemo<WireDef[]>(() => {
    const conns = props.connectionByTarget()
    const groups = targetGroups()
    // Re-compute after DOM paint so port element positions are valid
    void layoutVersion()
    const defs: WireDef[] = []

    const world = worldRef
    if (!world) return defs

    const worldRect = world.getBoundingClientRect()
    const scale = viewScale()

    // Query actual DOM port positions (handles scrolling, collapsed rows, etc.)
    const portPositions = new Map<string, { x: number; y: number }>()
    const portEls = world.querySelectorAll('[data-graph-port]')
    for (const el of portEls) {
      const htmlEl = el as HTMLElement
      const pid = htmlEl.dataset.graphPort
      if (!pid) continue
      const rect = htmlEl.getBoundingClientRect()
      portPositions.set(pid, {
        x: (rect.left + rect.width / 2 - worldRect.left) / scale,
        y: (rect.top + rect.height / 2 - worldRect.top) / scale,
      })
    }

    // Query collapsed-group divider positions for wire routing
    const collapsedDivPositions = new Map<string, { x: number; y: number }>()
    const collapsedEls = world.querySelectorAll('[data-graph-port-collapsed]')
    for (const el of collapsedEls) {
      const htmlEl = el as HTMLElement
      const cid = htmlEl.dataset.graphPortCollapsed
      if (!cid) continue
      const rect = htmlEl.getBoundingClientRect()
      collapsedDivPositions.set(cid, {
        x: (rect.left + 14 - worldRect.left) / scale,
        y: (rect.top + rect.height / 2 - worldRect.top) / scale,
      })
    }

    const collapsed = collapsedSubGroups()

    // Build a lookup for which group+subGroup+target each targetKey maps to
    const targetMeta = new Map<
      string,
      { groupIdx: number; subIdx: number; label: string }
    >()
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]!
      for (let si = 0; si < g.subGroups.length; si++) {
        const sg = g.subGroups[si]!
        for (let ri = 0; ri < sg.targets.length; ri++) {
          const t = sg.targets[ri]!
          targetMeta.set(flameTargetKey(t.target), {
            groupIdx: gi,
            subIdx: si,
            label: t.paramLabel,
          })
        }
      }
    }

    for (const [targetKey, conn] of conns) {
      const meta = targetMeta.get(targetKey)
      if (!meta) continue
      const srcPortId = `${sourceNodeId(conn.sourceFeature)}:out`
      const srcPos = portPositions.get(srcPortId)
      if (!srcPos) continue

      // If the sub-group is collapsed, route to the divider instead of individual port
      const collapseKey = `${targetNodeId(meta.groupIdx)}:${meta.subIdx}`
      let tgtPos: { x: number; y: number } | undefined
      if (collapsed.has(collapseKey)) {
        tgtPos = collapsedDivPositions.get(collapseKey)
      } else {
        const tgtPortId = portId(targetNodeId(meta.groupIdx), meta.label)
        tgtPos = portPositions.get(tgtPortId)
      }
      if (!tgtPos) continue

      defs.push({
        sourceId: sourceNodeId(conn.sourceFeature),
        targetId: targetNodeId(meta.groupIdx),
        sourceFeature: conn.sourceFeature,
        targetKey,
        color: sourceColorMap[conn.sourceFeature] ?? '#7c6ff7',
        sx: srcPos.x,
        sy: srcPos.y,
        tx: tgtPos.x,
        ty: tgtPos.y,
      })
    }

    return defs
  })

  // ── Live value polling ────────────────────────────────────────────

  onCleanup(() => {
    // cleanup effect
  })

  createEffect(() => {
    const analyzer = props.liveAnalyzer()
    if (!analyzer) {
      setLiveValues(new Map())
      return
    }

    let running = true
    let lastUpdate = 0

    function tick() {
      if (!running) return

      const now = globalThis.performance.now()
      if (now - lastUpdate < 33) {
        // ~30 fps
        requestAnimationFrame(tick)
        return
      }
      lastUpdate = now

      try {
        const frame = analyzer!.getFrameData()
        const conns = props.connectionByTarget()
        const next = new Map<string, number>()

        for (const [targetKey, conn] of conns) {
          const val = getAudioFeatureNormalized(frame, conn.sourceFeature)
          next.set(targetKey, val)
        }

        setLiveValues(next)
      } catch {
        // analyzer may be disposed mid-frame
      }

      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)

    onCleanup(() => {
      running = false
    })
  })

  // ── Color swatch computation ──────────────────────────────────────

  function getLiveColor(target: FlameTarget, normalized: number): string {
    if (target.kind === 'renderSetting') {
      switch (target.param) {
        case 'vibrancy':
          return `hsl(280, ${Math.round(normalized * 100)}%, 55%)`
        case 'exposure':
          return `hsl(0, 0%, ${Math.round(30 + normalized * 60)}%)`
        case 'gamma':
          return `hsl(0, 0%, ${Math.round(20 + (1 - normalized) * 50)}%)`
        case 'contrast':
          return `hsl(0, 0%, ${Math.round(normalized * 100)}%)`
        case 'palettePhase':
          return `hsl(${Math.round(normalized * 360)}, 70%, 55%)`
        case 'paletteSpeed':
          return `hsl(${Math.round(normalized * 360)}, 50%, 60%)`
        case 'highlightPower':
          return `hsl(45, 80%, ${Math.round(40 + normalized * 50)}%)`
        case 'lightPower':
          return `hsl(45, 60%, ${Math.round(40 + normalized * 50)}%)`
        case 'depthColorPower':
          return `hsl(220, 60%, ${Math.round(30 + normalized * 40)}%)`
        default:
          return ''
      }
    }
    if (target.kind === 'transformProperty' && target.property === 'colorX') {
      return `hsl(${Math.round(normalized * 360)}, 60%, 55%)`
    }
    if (target.kind === 'transformProperty' && target.property === 'colorY') {
      return `hsl(${Math.round(normalized * 360)}, 60%, 55%)`
    }
    return ''
  }

  // ── Port click on target (no-drag connect) ────────────────────────

  function onTargetPortClick(target: FlameTarget) {
    const cfrom = props.connectingFrom()
    if (cfrom) {
      props.onCompleteConnection(target)
    }
  }

  // ── Wire click (select / delete) ──────────────────────────────────

  function onWireClick(source: AudioFeature, targetKey: string, e: MouseEvent) {
    e.stopPropagation()
    if (e.shiftKey) {
      props.onDeleteWire(source, targetKey)
    } else {
      const sel = props.selectedWire()
      if (sel?.source === source && sel?.targetKey === targetKey) {
        props.onSelectWire(undefined)
      } else {
        props.onSelectWire({ source, targetKey })
      }
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
      // Frame all: reset view
      setViewX(0)
      setViewY(0)
      setViewScale(1)
    }
    if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
      setViewX(0)
      setViewY(0)
      setViewScale(1)
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div
      ref={canvasRef}
      class={styles.canvas}
      classList={{
        [styles.canvasDragging as string]: isPanning(),
      }}
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onCanvasMouseMove}
      onMouseUp={onCanvasMouseUp}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <div
        ref={worldRef}
        class={styles.world}
        style={{
          transform: `translate(${viewX()}px, ${viewY()}px) scale(${viewScale()})`,
        }}
      >
        {/* ── SVG wire layer ── */}
        <svg class={styles.wireSvg}>
          {/* Existing connections */}
          <For each={wireDefs()}>
            {(wire) => {
              const d = bezierPath(wire.sx, wire.sy, wire.tx, wire.ty)
              const isSelected =
                props.selectedWire()?.source === wire.sourceFeature &&
                props.selectedWire()?.targetKey === wire.targetKey
              return (
                <path
                  d={d}
                  class={styles.wirePath}
                  classList={{
                    [styles.wirePathSelected as string]: isSelected,
                  }}
                  style={{ stroke: wire.color }}
                  data-wire={`${wire.sourceFeature}:${wire.targetKey}`}
                  onMouseDown={(e) => {
                    onWireClick(wire.sourceFeature, wire.targetKey, e)
                  }}
                />
              )
            }}
          </For>

          {/* Preview wire during drag */}
          <Show when={wireDragFrom() && wireDragPos()}>
            <path
              d={bezierPath(
                wireDragFrom()!.x,
                wireDragFrom()!.y,
                wireDragPos()!.x,
                wireDragPos()!.y,
              )}
              class={styles.wirePreview}
              style={{
                stroke:
                  sourceColorMap[wireDragFrom()!.id as AudioFeature] ??
                  '#7c6ff7',
              }}
            />
          </Show>
        </svg>

        {/* ── Source nodes ── */}
        <For each={allSources()}>
          {(src) => {
            const nid = sourceNodeId(src.feature)
            const pos = createMemo(() => nodePositions().get(nid))
            const connCount = createMemo(() => {
              const s = props.connectionBySource().get(src.feature)
              return s ? s.length : 0
            })
            const lv = createMemo(() => {
              // Live value: find connected targets and average their normalized values
              const bySource = props.connectionBySource().get(src.feature)
              if (!bySource || bySource.length === 0) return undefined
              const vals = props.mappings
                .filter((m) => m.audioFeature === src.feature)
                .map((m) => liveValues().get(flameTargetKey(m.target)))
                .filter((v): v is number => v !== undefined)
              if (vals.length === 0) return undefined
              return vals.reduce((a, b) => a + b, 0) / vals.length
            })

            return (
              <Show when={pos()}>
                {(p) => (
                  <div
                    class={styles.node}
                    classList={{
                      [styles.nodeSelected as string]:
                        props.connectingFrom() === src.feature,
                    }}
                    style={{
                      left: `${p().x}px`,
                      top: `${p().y}px`,
                      width: `${SOURCE_NODE_W}px`,
                    }}
                    data-graph-node={nid}
                    onMouseDown={(e) => {
                      const t = e.target as HTMLElement
                      if (t.closest('[data-graph-port]')) return
                      onNodeHeaderDown(nid, e)
                    }}
                  >
                    <div
                      class={`${styles.nodeHeader} ${styles.nodeHeaderSource}`}
                      style={{
                        background: `linear-gradient(135deg, ${src.color}22, transparent)`,
                      }}
                    >
                      <span
                        class={styles.nodeHeaderDot}
                        style={{ background: src.color }}
                      />
                      <span class={styles.nodeHeaderLabel}>{src.label}</span>
                      <Show when={connCount() > 0}>
                        <span class={styles.sourceConnCount}>
                          {connCount()}
                        </span>
                      </Show>
                    </div>
                    <div class={styles.sourceMeter}>
                      <div class={styles.sourceMeterBar}>
                        <div
                          class={styles.sourceMeterFill}
                          style={{
                            width: `${Math.min(100, (lv() ?? 0) * 100)}%`,
                            background: src.color,
                          }}
                        />
                      </div>
                      <span class={styles.sourceMeterValue}>
                        {lv() !== undefined ? (lv()! * 100).toFixed(0) : '--'}
                      </span>
                    </div>
                    {/* Output port (right side) */}
                    <div
                      class={`${styles.singlePort} ${styles.singlePortRight}`}
                      classList={{
                        [styles.singlePortConnecting as string]:
                          props.connectingFrom() === src.feature,
                        [styles.singlePortActive as string]:
                          connectedSources().has(src.feature),
                      }}
                      data-graph-port={`${nid}:out`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Connect ${src.label}`}
                      onMouseDown={(e) => {
                        onSourcePortDown(src.feature, e)
                      }}
                    />
                  </div>
                )}
              </Show>
            )
          }}
        </For>

        {/* ── Target group nodes ── */}
        <For each={targetGroups()}>
          {(group, groupIdx) => {
            const nid = targetNodeId(groupIdx())
            const pos = createMemo(() => nodePositions().get(nid))

            // Compute total height
            const portCount = group.subGroups.reduce(
              (acc, sg) => acc + sg.targets.length,
              0,
            )
            const subGroupCount = group.subGroups.filter(
              (sg) => sg.label,
            ).length
            const nodeH =
              TARGET_HEADER_H +
              portCount * TARGET_PORT_ROW_H +
              TARGET_PORT_ROW_PAD +
              subGroupCount * 10 +
              8

            return (
              <Show when={pos()}>
                {(p) => (
                  <div
                    class={styles.node}
                    style={{
                      left: `${p().x}px`,
                      top: `${p().y}px`,
                      width: `${Math.max(TARGET_NODE_MIN_W, TARGET_NODE_MIN_W)}px`,
                      height: `${nodeH}px`,
                    }}
                    data-graph-node={nid}
                    onMouseDown={(e) => {
                      const t = e.target as HTMLElement
                      if (t.closest('[data-graph-port]')) return
                      if (t.closest(`.${styles.subGroupDivider}`)) return
                      onNodeHeaderDown(nid, e)
                    }}
                  >
                    <div
                      class={`${styles.nodeHeader} ${styles.nodeHeaderTarget}`}
                    >
                      <span class={styles.nodeHeaderLabel}>{group.label}</span>
                    </div>
                    <div
                      class={styles.nodeBody}
                      onWheel={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      <For each={group.subGroups}>
                        {(sg, sgIdx) => {
                          const collapseKey = `${nid}:${sgIdx()}`
                          const collapsed = createMemo(() =>
                            collapsedSubGroups().has(collapseKey),
                          )
                          const connectedInGroup = createMemo(() => {
                            if (!sg.label) return 0
                            let count = 0
                            for (const t of sg.targets) {
                              if (
                                props
                                  .connectionByTarget()
                                  .has(flameTargetKey(t.target))
                              )
                                count++
                            }
                            return count
                          })
                          return (
                            <>
                              <Show when={sg.label}>
                                <div
                                  class={styles.subGroupDivider}
                                  classList={{
                                    [styles.subGroupCollapsed as string]:
                                      collapsed(),
                                  }}
                                  data-graph-port-collapsed={
                                    collapsed() ? collapseKey : undefined
                                  }
                                  onClick={() => {
                                    setCollapsedSubGroups((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(collapseKey)) {
                                        next.delete(collapseKey)
                                      } else {
                                        next.add(collapseKey)
                                      }
                                      return next
                                    })
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`${collapsed() ? 'Expand' : 'Collapse'} ${sg.label}`}
                                >
                                  <span class={styles.collapseChevron}>
                                    {collapsed() ? '▸' : '▾'}
                                  </span>
                                  <span>{sg.label}</span>
                                  <Show when={connectedInGroup() > 0}>
                                    <span class={styles.collapseConnCount}>
                                      {connectedInGroup()}
                                    </span>
                                  </Show>
                                </div>
                              </Show>
                              <Show when={!collapsed()}>
                                <For each={sg.targets}>
                                  {(tgt) => {
                                    const tkey = flameTargetKey(tgt.target)
                                    const conn = createMemo(() =>
                                      props.connectionByTarget().get(tkey),
                                    )
                                    const isColor = isColorParam(tgt.target)
                                    const liveVal = createMemo(() => {
                                      const v = liveValues().get(tkey)
                                      return v !== undefined ? v : undefined
                                    })
                                    const liveColor = createMemo(() => {
                                      const v = liveVal()
                                      if (v === undefined) return ''
                                      return getLiveColor(tgt.target, v)
                                    })

                                    return (
                                      <div
                                        class={styles.portRow}
                                        classList={{
                                          [styles.portRowConnected as string]:
                                            !!conn(),
                                        }}
                                        style={{
                                          position: 'relative',
                                        }}
                                      >
                                        {/* Input port (left side) */}
                                        <div
                                          class={styles.port}
                                          classList={{
                                            [styles.portConnecting as string]:
                                              !!props.connectingFrom() &&
                                              !!wireDropTarget() &&
                                              wireDropTarget() ===
                                                portId(nid, tgt.paramLabel),
                                            [styles.portDropTarget as string]:
                                              wireDropTarget() ===
                                              portId(nid, tgt.paramLabel),
                                            [styles.portActive as string]:
                                              !!conn(),
                                          }}
                                          data-graph-port={portId(
                                            nid,
                                            tgt.paramLabel,
                                          )}
                                          role="button"
                                          tabIndex={0}
                                          aria-label={`Connect to ${tgt.label}`}
                                          onMouseDown={(e) => {
                                            onTargetPortDown(tgt.target, e)
                                          }}
                                          onClick={() => {
                                            onTargetPortClick(tgt.target)
                                          }}
                                        />
                                        <span
                                          class={styles.portLabel}
                                          classList={{
                                            [styles.portLabelConnected as string]:
                                              !!conn(),
                                          }}
                                        >
                                          {tgt.paramLabel}
                                        </span>
                                        {/* Color swatch for color params */}
                                        <Show when={isColor && liveColor()}>
                                          <div
                                            class={styles.colorSwatch}
                                            style={{
                                              'background-color': liveColor(),
                                            }}
                                            title={
                                              liveVal() !== undefined
                                                ? liveVal()!.toFixed(3)
                                                : ''
                                            }
                                          />
                                        </Show>
                                        {/* Value bar for non-color params with live data */}
                                        <Show
                                          when={
                                            !isColor && liveVal() !== undefined
                                          }
                                        >
                                          <div class={styles.valueBar}>
                                            <div
                                              class={styles.valueBarFill}
                                              style={{
                                                width: `${(liveVal()! * 100).toFixed(0)}%`,
                                                background: conn()
                                                  ?.sourceFeature
                                                  ? (sourceColorMap[
                                                      conn()!.sourceFeature
                                                    ] ?? '#7c6ff7')
                                                  : '#7c6ff7',
                                              }}
                                            />
                                          </div>
                                          <span class={styles.valueLabel}>
                                            {liveVal()!.toFixed(2)}
                                          </span>
                                        </Show>
                                        {/* Connected source badge */}
                                        <Show when={conn()}>
                                          <span class={styles.portSourceBadge}>
                                            {sourceLabel(conn()!.sourceFeature)}
                                          </span>
                                        </Show>
                                      </div>
                                    )
                                  }}
                                </For>
                              </Show>
                            </>
                          )
                        }}
                      </For>
                    </div>
                  </div>
                )}
              </Show>
            )
          }}
        </For>
      </div>

      {/* Zoom indicator (outside world, fixed position) */}
      <div class={styles.zoomIndicator}>{Math.round(viewScale() * 100)}%</div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

function sourceLabel(feature: AudioFeature): string {
  for (const g of AUDIO_SOURCE_GROUPS) {
    for (const s of g.sources) {
      if (s.feature === feature) return s.label
    }
  }
  return feature
}
