# Node Graph Wire Fixes & Transform Node Polish

## 1. Fix Wire Binding Points (DOM-query approach)

### Problem

`NodeGraphView.tsx` `wireDefs` memo computes port positions mathematically from node
positions + hardcoded offsets (`SOURCE_PORT_X_OFF`, `SOURCE_PORT_Y_OFF`,
`TARGET_HEADER_H`, etc). These constants don't match actual rendered DOM positions
because:

- Source node height is content-driven (no fixed height), so `SOURCE_PORT_Y_OFF=28`
  doesn't match the actual `top: 50%` port position.
- Target node header height varies from the constant.
- Scrolling inside `.nodeBody` (max-height: 320px, overflow-y: auto) offsets port
  positions.

The **list view** (`WireOverlay.tsx`) already does this correctly — it queries
`[data-source-port]` / `[data-target-port]` elements via `getBoundingClientRect()`.

### Fix

Mirror the WireOverlay approach in NodeGraphView:

1. **Add `layoutVersion` signal** — bumped whenever node positions, zoom, pan, or
   target groups change. This invalidates the wire position cache.

2. **Port position resolver helpers** — query `[data-graph-port]` elements relative
   to `worldRef`:

   ```ts
   function getPortCenterWorld(worldEl: HTMLElement, portId: string) {
     const el = worldEl.querySelector(
       `[data-graph-port="${portId}"]`,
     ) as HTMLElement | null
     if (!el) return null
     const worldRect = worldEl.getBoundingClientRect()
     const rect = el.getBoundingClientRect()
     return {
       x: rect.left - worldRect.left + rect.width / 2,
       y: rect.top - worldRect.top + rect.height / 2,
     }
   }
   ```

3. **Rewrite `wireDefs` memo** — use `layoutVersion()` as a dep, query actual port
   positions instead of computing from node offsets. Cache lookups by port ID within
   a single layoutVersion pass.

4. **Bump `layoutVersion`** in the right places:
   - When `nodePositions` change (node drag)
   - When `viewX/Y/Scale` change (pan/zoom)
   - When `targetGroups` change (new nodes added)

5. **Use `requestAnimationFrame`** before querying — ensures DOM is painted after
   React/Solid state updates. The memo can use a `portPositions` signal that's set
   inside a `createEffect` with rAF.

### Approach detail

```tsx
// Signal for cached port positions (world-relative)
const [portPositions, setPortPositions] = createSignal<
  Map<string, { x: number; y: number }>
>(new Map())

// Effect: after layout changes, query DOM for all port positions
createEffect(() => {
  // Track dependencies
  const _pos = nodePositions()
  const _groups = targetGroups()
  const _vx = viewX()
  const _vy = viewY()
  const _scale = viewScale()

  // Wait for DOM paint
  requestAnimationFrame(() => {
    if (!worldRef) return
    const next = new Map<string, { x: number; y: number }>()
    const ports = worldRef.querySelectorAll('[data-graph-port]')
    const worldRect = worldRef.getBoundingClientRect()
    for (const el of ports) {
      const id = (el as HTMLElement).dataset.graphPort
      if (!id) continue
      const rect = el.getBoundingClientRect()
      next.set(id, {
        x: rect.left - worldRect.left + rect.width / 2,
        y: rect.top - worldRect.top + rect.height / 2,
      })
    }
    setPortPositions(next)
  })
})

// Wire defs from actual DOM positions
const wireDefs = createMemo(() => {
  const portPos = portPositions()
  const conns = props.connectionByTarget()
  // ...build defs using portPos.get(sourceNodeId(feature) + ':out') etc.
})
```

This way wires always connect to the actual circle handle positions, regardless of
node height, scrolling, or zoom level.

---

## 2. Collapsible Sub-Groups in Transform Nodes

### Problem

Transform nodes have many sub-groups (Pre-Affine 6, Post-Affine 6, Properties 4,
Variations N). Each port row is 20px. With many variations, a node can easily
exceed the 320px max-height and scroll. Users can't easily see all connections.

### Fix

Add collapse toggles to each sub-group divider in target nodes:

1. **Collapse state** — `createSignal<Set<string>>()` tracking collapsed sub-group
   keys like `"tgt-0:Pre-Affine"`, `"tgt-1:Variations"`, etc.

2. **Sub-group divider becomes a toggle button** — clicking the divider collapses
   or expands that sub-group. A small arrow/chevron icon indicates state.

3. **When collapsed**:
   - Port rows are hidden via `display: none`
   - The divider shows a chevron + count: `"▸ Variations (4)"`
   - Wire endpoints for collapsed ports point to the **divider element's center**
     (the wires "bundle" to the group header). This avoids broken wire positions
     since `display:none` elements return 0×0 rects.
   - The divider gets `data-graph-port-collapsed="tgt-0:Pre-Affine"` so the wire
     position resolver can find it and route all collapsed-group wires there.
   - Node height shrinks accordingly

4. **CSS** — collapsed port rows: `display: none`. Divider gets
   `cursor: pointer` and hover highlight. Chevron rotates on expand.

5. **Wire position resolver** — when looking up a target port:
   - First try the individual `[data-graph-port]` element
   - If not found (collapsed), look for the parent sub-group's collapse anchor
     `[data-graph-port-collapsed]` on the divider Use a derived computation:
   ```ts
   const visiblePortCount = group.subGroups.reduce((acc, sg, si) => {
     if (collapsed.has(`${nid}:${sg.label}`)) return acc
     return acc + sg.targets.length
   }, 0)
   ```

---

## 3. Persist View Mode in localStorage

### Problem

The `viewMode` signal always defaults to `'list'`. Users who prefer the graph view
must toggle every time they open the modal.

### Fix

In `AudioWiringModal.tsx`:

```tsx
const STORAGE_KEY = 'audioWiringViewMode'

function loadViewMode(): 'list' | 'graph' {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'list' || v === 'graph') return v
  } catch {
    /* private mode / blocked */
  }
  return 'list'
}

// In the component:
const [viewMode, setViewMode] = createSignal<'list' | 'graph'>(loadViewMode())

// Wrap setViewMode to persist:
function setViewModePersisted(mode: 'list' | 'graph') {
  setViewMode(mode)
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {}
}
```

The toggle buttons call `setViewModePersisted` instead of `setViewMode`.

---

## Files Changed

- `packages/app/src/components/AudioWiringModal/NodeGraphView.tsx` — wire positions + collapsible sub-groups
- `packages/app/src/components/AudioWiringModal/NodeGraphView.module.css` — collapse styles
- `packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx` — localStorage persistence

## Risk

- DOM queries for wire positions add one frame of latency after node drag. This is
  standard in node editors (Blender, Houdini, etc.) and imperceptible at 60fps.
- Collapsed port rows with `display:none` still have `getBoundingClientRect()` return
  a 0×0 rect at (0,0). **Mitigation**: when computing wire positions for collapsed
  ports, use the sub-group divider's position instead.
