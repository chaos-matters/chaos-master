# Plan: Node-Graph Wiring View

## Context

Repo: `/chaos-master-fp-audit` | Branch: `feat/audio-fractals`

Add a **toggled alternative view** inside `AudioWiringModal` that renders audio→target
connections as a draggable node-graph canvas, inspired by Blender's shader editor.
The existing column-based wiring view (mode 1) remains the default; the new node-graph
view (mode 2) is the alternative. Both views share the same connection state,
undo/redo stack, preset logic, and live analyzer data.

## Goals

1. **Toggle switch** in the header bar: "List" (current) ↔ "Graph" (new)
2. **Draggable nodes** on a pannable/zoomable canvas
3. **Bezier-curve wires** between source output ports and target input ports,
   correctly scaled across browser zoom (Ctrl+/-) and canvas zoom
4. **Live color/value preview** — when a wire carries an audio feature to a
   color-related parameter, the target node renders the current value as a
   visible color swatch or gradient. During live mic/file playback the preview
   updates at ~30 fps so users can inspect the audio→visual mapping in real time.
5. **Reuse 100% of existing wiring logic** — `doConnect`, `startConnection`,
   `completeConnection`, `connectionByTarget`, `connectionBySource`,
   `mappings`, undo/redo, presets, import/export, keyboard shortcuts.

---

## Architecture

### Shared State (no duplication)

Both views live inside `AudioWiringModal.tsx`. A single `viewMode` signal
(`'list' | 'graph'`) switches between them. All connection state, undo/redo,
and mapping signals remain at the modal level — neither view owns this state.

```tsx
// AudioWiringModal.tsx (additions)
const [viewMode, setViewMode] = createSignal<'list' | 'graph'>('list')
```

```
AudioWiringModal
├── HeaderBar          ← receives onToggleView + viewMode; adds segmented toggle
├── <Show when={viewMode() === 'list'}>
│   ├── SourceColumn   ← existing column-based sources
│   ├── TargetsColumn  ← existing expandable target groups
│   └── WireOverlay    ← existing SVG wire overlay
└── <Show when={viewMode() === 'graph'}>
    └── NodeGraphView  ← NEW: canvas + nodes + wires (replaces SourceColumn+TargetsColumn+WireOverlay)
```

The `ParamsPanel` (bottom) stays visible in both modes — it reads `selectedWire`
and edits mappings identically regardless of view.

### New Files

| File | Purpose |
|------|---------|
| `NodeGraphView.tsx` | Canvas container with pan/zoom, manages node layout, renders `<GraphNode>` + SVG wires |
| `NodeGraphView.module.css` | Canvas, node card, port styles |

#### NodeGraphView.tsx — Component API

```tsx
function NodeGraphView(props: {
  // Connection state (same as existing modal)
  mappings: Accessor<AudioMappingEntry[]>
  liveAnalyzer: Accessor<LiveAudioAnalyzer | undefined>
  connectionByTarget: Accessor<Map<string, { source: AudioFeature; entry: AudioMappingEntry }>>
  connectionBySource: Accessor<Map<AudioFeature, FlameTarget[]>>
  connectingFrom: Accessor<AudioFeature | undefined>
  selectedWire: Accessor<{ source: AudioFeature; targetKey: string } | undefined>

  // Actions (same as existing modal)
  onStartConnection: (feature: AudioFeature) => void
  onCompleteConnection: (target: FlameTarget) => void
  onSelectWire: (wire: { source: AudioFeature; targetKey: string } | undefined) => void
  onDeleteWire: (source: AudioFeature, targetKey: string) => void
})
```

### Component Details

#### 1. Canvas (NodeGraphView)

The canvas is a `<div>` with `overflow: hidden` and a child `<div>` that carries
a CSS transform:

```tsx
const [viewTransform, setViewTransform] = createSignal({ x: 0, y: 0, scale: 1 })
```

```css
.canvasWorld {
  transform: translate(${x}px, ${y}px) scale(${s});
  transform-origin: 0 0;
}
```

**Pan**: Mousedown on empty canvas area → drag to translate `(x, y)`.
**Zoom**: Wheel event → adjust `scale` around the mouse position (so the point
under the cursor stays put).
**Touch**: Pinch-to-zoom + two-finger pan via standard gesture handling.

All nodes and the SVG wire layer are children of `.canvasWorld`, so they inherit
the pan/zoom transform automatically.

**Why CSS transform over SVG viewBox?**
- HTML nodes (div cards with text, color swatches, level meters) are easier to
  style and animate than foreignObject
- CSS transforms are GPU-accelerated
- Mouse-to-canvas coordinate conversion is straightforward: divide by scale,
  subtract translation

#### 2. Graph Nodes

Each node is a draggable card component with:

**Source nodes** (audio features):
```
┌──────────────────────┐
│ 🟣 Sub Bass    ████ │──○  ← output port (right side)
│      level: 0.72    │
└──────────────────────┘
```

**Target nodes** (render params, grouped):
```
    ○──│  Gamma          │
       │  ▪ color swatch │  ← shows live color/value from audio
       │  ▪ value: 0.43  │
       └────────────────┘
```

Nodes are positioned absolutely within `.canvasWorld`. Initial layout:
- Source nodes: stacked vertically on the left (x ≈ 40, y spaced by 120px)
- Target nodes: arranged in a column/grid on the right (x ≈ 500, y spaced per group)

Node positions are stored in a `Map<string, {x: number, y: number}>` signal so
positions persist across view toggles.

**Dragging**: onMouseDown on the node header → track delta, update position signal.

#### 3. Wires (bezier curves in SVG)

An `<svg>` element fills the entire `.canvasWorld` (positioned behind nodes
via z-index). Wires are cubic bezier paths:

```
M sourcePort.x sourcePort.y
C cp1.x cp1.y, cp2.x cp2.y, targetPort.x targetPort.y
```

Control points extend horizontally from each port by ±120px (scaled by canvas zoom).

**Port position resolution**: Each node has a ref on its port element.
`getBoundingClientRect()` gives CSS-pixel coordinates. These are converted
to canvas-world coordinates:

```ts
function toCanvasCoords(clientX: number, clientY: number, canvasRect: DOMRect) {
  return {
    x: (clientX - canvasRect.left) / scale - translateX / scale,
    y: (clientY - canvasRect.top) / scale - translateY / scale,
  }
}
// Simplified: divide by scale, subtract world offset
```

**Browser zoom handling** (Ctrl+/-): This is handled automatically because:
- `getBoundingClientRect()` returns CSS pixels — already accounts for
  `devicePixelRatio`
- The canvas world transform uses CSS pixels throughout
- No `devicePixelRatio` math needed in wire rendering

**Wire interactions**:
- Hover: highlight wire (wider, brighter)
- Click: select wire → shows in ParamsPanel
- Delete key: remove selected wire
- Dragging from port: shows preview bezier from port to cursor

#### 4. Live Color/Value Preview

The critical feature: when an audio wire maps to a color parameter, the target
node renders a live visual preview.

**Color-related parameters** (the ones we show swatches for):
- `vibrancy` → saturation
- `exposure` → brightness
- `gamma` → midtone shift
- `contrast` → contrast
- `palettePhase` → hue rotation
- `colorX` / `colorY` → palette coordinate
- `colorSpeed` → palette animation speed

**Implementation**: `createEffect` polls `liveAnalyzer().getFrameData()` at
requestAnimationFrame rate (only when live playback or mic is active).
For each connected target:
1. Resolve the target's current mapping entry
2. Call `getAudioFeatureNormalized(frameData, entry.audioFeature)` → 0-1 value
3. For color params, map the normalized value to a CSS color:
   - `vibrancy`: grayscale(100% - value) filter preview
   - `gamma`: darken/lighten a neutral swatch
   - `palettePhase`: HSL hue rotation
   - `colorX`/`colorY`: 2D palette position as a small gradient swatch
   - `exposure`/`contrast`: brightness/contrast on a reference gradient
4. Render the color swatch inside the target node card

The polling uses `requestAnimationFrame` → read frame → update signal → re-render
only the affected node's swatch. Nodes without color params just show the numeric
value (0.00–1.00) as a text label and thin progress bar.

**Performance**: The rAF loop runs even when no wires map to color params.
We guard with an early exit: if the target's param isn't color-related,
skip the swatch computation. Also throttle to ~30fps by skipping frames
when `performance.now() - lastUpdate < 33ms`.

#### 5. Drag-to-Connect

Works identically to the existing view but adapted for canvas coordinates:

1. **mousedown** on a source port → calls `onStartConnection(feature)`,
   sets `dragFrom` state with the port's canvas position
2. **mousemove** (on canvas) → updates `dragPos` (in canvas coords),
   renders a preview bezier from source port to cursor
3. **mouseup** on a target port → calls `onCompleteConnection(target)`,
   which runs the existing `completeConnection` logic (including conflict
   resolution, undo push, etc.)
4. **mouseup** on empty canvas → cancels drag (calls `setConnectingFrom(undefined)`)

Port collision detection: on mouseup, check `document.elementFromPoint(x, y)`
for `[data-target-port]` attribute. The `mousemove` handler also highlights
drop targets by checking `elementFromPoint`.

### CSS Architecture

**Node card design** (dark theme matching the modal's `rgba(0,0,0,0.92)` overlay):

```css
.graphNode {
  position: absolute;
  min-width: 140px;
  background: rgba(30, 30, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: grab;
  user-select: none;
  backdrop-filter: blur(8px);
}
.graphNodeHeader {
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 7px 7px 0 0;
  /* colored per source/target type */
}
.graphNodePort {
  width: 12px; height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3);
  cursor: crosshair;
  /* positioned absolutely on the edge */
}
.graphNodePortRight { right: -6px; top: 50%; }
.graphNodePortLeft { left: -6px; top: 50%; }
.graphNodeColorSwatch {
  width: 24px; height: 14px;
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.15);
  /* background-color set dynamically from live value */
}
```

### Node Grouping Strategy

Rather than one node per target parameter (which would be ~50+ nodes), targets
are **grouped by transform** (matching the existing `TargetGroupData` structure):

- **Render Settings** node: ports for vibrancy, exposure, palettePhase, etc.
- **Final Transform** node: ports for a, b, c, d, e, f
- **Per-transform nodes** (e.g., "Transform 1"): sub-groups for pre-affine,
  post-affine, properties, variations — each as a compact grid of ports
  within the node body

Source nodes are individual (one per audio feature: 13 nodes).

**Connected ports** show a small colored dot matching the source's color.

### Browser Zoom Correctness

Browser zoom (Ctrl+/-) changes `window.devicePixelRatio` in most browsers.
Key invariants:
1. `getBoundingClientRect()` always returns CSS pixels — these are
   **independent of devicePixelRatio**.
2. Mouse events (`clientX`, `clientY`) are also in CSS pixels.
3. Canvas transform operates in CSS pixels.

Therefore: **no devicePixelRatio correction is needed**. The entire system
(port positions, wire SVG coordinates, mouse hit-testing) works in CSS-pixel
space, which is what the DOM uses natively.

The one edge case: if we used a `<canvas>` element for rendering, we'd need
`devicePixelRatio` for crispness. But we use SVG + HTML divs, so it's a non-issue.

### Keyboard & Accessibility

- **Escape**: close modal (existing behavior, unchanged)
- **Ctrl+Z / Ctrl+Y**: undo/redo (existing, unchanged)
- **Delete**: remove selected wire (existing, unchanged)
- **Tab**: focus next node port (new)
- **Enter/Space**: connect from focused port (new — on target node, completes
  the pending connection)
- **Arrow keys**: nudge selected node by 10px (new, when a node is focused)
- **F**: frame all nodes (new — resets pan/zoom to fit all nodes)

### Edge Cases

1. **No mappings yet** (empty state): Both views show an empty-state message.
   Node-graph view still shows all source and target nodes, just no wires.

2. **Large number of transforms** (e.g., 10+): Source nodes stack on left,
   target nodes wrap into columns. Frame-all ensures everything is visible.
   Scrollbars on the canvas container handle overflow when zoomed in.

3. **Window resize**: Node positions are in canvas space; the canvas
   container resizes but the world transform is independent. On extreme
   resize (e.g., mobile), nodes may need re-layout — initially we accept
   that some nodes may be outside the viewport until the user pans.

4. **Rapid toggle between views**: Both views read the same signals; toggling
   is instantaneous because nothing is destroyed — `<Show>` conditionally
   renders, but signals persist.

5. **Node overlap after drag**: Nodes can overlap. This is acceptable (and
   expected in node editors). Users can drag nodes apart.

6. **Missing live analyzer**: When no file/mic is active, color swatches show
   the static mapped value (from `mapping.range` midpoint) instead of a live
   value. The swatch is grayed out to indicate "no live data".

7. **Canvas zoom at extreme values**: Clamp scale to [0.1, 3.0] to prevent
   nodes becoming invisible or wires breaking visually.

---

## Implementation Order

### Phase 1: Canvas + Draggable Nodes (no wires)
1. Create `NodeGraphView.tsx` + `NodeGraphView.module.css`
2. Implement canvas with pan (drag background) + zoom (wheel)
3. Create `GraphNode` component (header + body + ports)
4. Layout source nodes (left column) and target group nodes (right columns)
5. Implement node dragging (mousedown on header → update position signal)

### Phase 2: Wires + Connection
6. Add SVG overlay for bezier wires
7. Implement port position tracking (refs → canvas coords)
8. Render existing connections as bezier paths
9. Implement drag-to-connect (preview wire, drop target detection)
10. Wire selection (click → ParamsPanel), wire deletion (Delete key)

### Phase 3: Live Preview
11. Add rAF polling loop for live analyzer data
12. Compute per-target normalized values
13. Render color swatches for color-params
14. Render value bars for non-color params
15. Handle "no live data" fallback state

### Phase 4: Toggle + Polish
16. Add segmented toggle button to HeaderBar
17. Wire `<Show>` to switch between views
18. Add "F" key to frame-all
19. Add arrow-key node nudging
20. Test: pnpm check, manual smoke test with live mic
21. Commit & push

### Files Changed

| File | Change |
|------|--------|
| `AudioWiringModal.tsx` | +15 lines: add `viewMode` signal, toggle in header, `<Show>` wrapper, pass shared props to `NodeGraphView` |
| `AudioWiringModal.module.css` | +40 lines: toggle button styles, `.nodeGraphContainer` |
| `NodeGraphView.tsx` | ~300 lines (NEW): canvas, pan/zoom, node layout, wire SVG, drag-to-connect |
| `NodeGraphView.module.css` | ~200 lines (NEW): node cards, ports, color swatches, wire styles |

### Key Types

```ts
// NodeGraphView.tsx
interface NodePosition {
  x: number
  y: number
}

interface SourceGraphNode {
  kind: 'source'
  feature: AudioFeature
  label: string
  color: string        // from AUDIO_SOURCE_GROUPS
}

interface TargetGraphNode {
  kind: 'target'
  groupLabel: string   // e.g. "Render Settings", "Transform 1"
  targets: TargetNodeData[]  // from buildTargetGroups
}

type GraphNodeData = SourceGraphNode | TargetGraphNode
```

---

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| rAF polling at 30fps for live preview could jank | Throttle to 30fps; skip computation when no color params are connected |
| Many transforms = many nodes = visual clutter | Group nodes by transform; default to compact layout |
| Canvas coordinate math bugs | Extract `toCanvasCoords`/`toScreenCoords` helpers; unit test |
| Wire rendering jank during pan/zoom | Use `will-change: transform` on canvas world; debounce wire recalc |
| Feature parity between views | Both views share the same connection state signals — can't diverge |

---

## Success Criteria

1. Toggle switches between list view and node-graph view without losing state
2. Nodes are draggable and positions persist across toggles
3. Wires render as bezier curves, correctly positioned at all canvas zoom levels
4. Drag-to-connect works: drag from source port → drop on target port → wire appears
5. Color-param target nodes show live-updating color swatches during mic/file playback
6. Clicking a wire selects it and shows editing controls in ParamsPanel
7. Keyboard shortcuts work identically in both views (Escape, Ctrl+Z/Y, Delete)
8. `pnpm check` passes with zero new errors
9. Existing list view continues to work exactly as before
