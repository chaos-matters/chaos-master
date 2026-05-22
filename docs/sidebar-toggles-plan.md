# Sidebar Collapse Toggles Plan

## Problem

The sidebar has many sections (affine editor, palette selector, transform cards,
render settings, action buttons) but no way to collapse any of them. On smaller
screens or with many transforms, the sidebar becomes a long scroll. Users should
be able to collapse sections they're not actively editing.

## Current Sidebar Structure (App.tsx lines 806-1393)

```
sidebar
├── playbackOverlay (conditional)
├── AffineEditor
├── FlameColorEditor
├── PaletteSelector
├── <For each transform>
│   └── transformGrid (color circle, probability, variations, add variation)
├── Card: Add Transform button
├── Card: Exposure, SkipIters, Draw Mode, Color Init, Point Init, Vibrancy,
│         Palette Speed, Palette Phase, Background Color, Quality
├── Card: Animation toggle, Timeline toggle, Adaptive filter, Compact UI
└── actionButtons: Load Flame, Save for Later, Render/Quick Export, Share Link
```

Sections that should each get a collapse toggle:

| Section | Header Text | Default State |
|---------|------------|---------------|
| AffineEditor | "Affine" | Expanded |
| Color + Palette (FlameColorEditor + PaletteSelector) | "Color & Palette" | Expanded |
| Each transform | "{readableId} Transform" | Expanded |
| Render settings | "Render Settings" | Expanded |
| Display/Toggles | "Display" | Expanded |
| Action buttons | "Actions" | Expanded |

## Design

### CollapsibleCard Component

Wrap existing `<Card>` content in a new component that adds a collapsible header:

```tsx
function CollapsibleCard(props: ParentProps<{
  title: string
  defaultOpen?: boolean
  class?: string
}>) {
  const [isOpen, setIsOpen] = createSignal(props.defaultOpen ?? true)
  return (
    <Card class={props.class}>
      <button class={ui.collapseHeader} onClick={() => setIsOpen(p => !p)}>
        <span class={ui.collapseTitle}>{props.title}</span>
        <svg class={ui.chevron} classList={{ [ui.chevronOpen]: isOpen() }}>
          {/* chevron-down SVG */}
        </svg>
      </button>
      <Show when={isOpen()}>
        <div class={ui.collapseContent}>
          {props.children}
        </div>
      </Show>
    </Card>
  )
}
```

**File**: `packages/app/src/components/CollapsibleCard/CollapsibleCard.tsx` (new)
**File**: `packages/app/src/components/CollapsibleCard/CollapsibleCard.module.css` (new)

### Visual Design

- Header: full-width button with title on left, chevron icon on right
- Chevron: `chevron-down.svg` icon, rotates 180° when collapsed (CSS transition)
- Header background: slightly darker/lighter than card background
- Header height: ~28-32px compact, matching sidebar density
- Content area: `display: none` when collapsed (not just hidden — avoid GPU work)
- Use `<Show>` for conditional rendering — collapsed content doesn't render at all

### CSS

```css
.collapseHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.collapseHeader:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.chevron {
  width: 14px;
  height: 14px;
  transition: transform 0.15s ease;
  transform: rotate(0deg);
}

.chevronOpen {
  transform: rotate(180deg);
}

.collapseContent {
  /* Content renders inside Card content area */
}
```

### Section Grouping Strategy

Combine related items that share a card into logical groups:

1. **Affine** — wraps existing `<AffineEditor>` in a CollapsibleCard
2. **Color & Palette** — wraps `FlameColorEditor` + `PaletteSelector` together
3. **Per Transform** — each `transformGrid` gets its own CollapsibleCard with
   the transform's readable ID as the title
4. **Render** — wraps the big settings card (Exposure through Quality)
5. **Display** — wraps the toggles card (Animation, Timeline, Adaptive filter, Compact)
6. **Actions** — wraps the action buttons card

### State Persistence

Collapse state should be ephemeral (per-session, per-component). Since the sidebar
structure can change (transforms added/removed), use a `Map<string, boolean>` keyed
by section ID:

```ts
const [collapseState, setCollapseState] = createStore<Record<string, boolean>>({
  affine: true,
  colorPalette: true,
  render: true,
  display: true,
  actions: true,
})
```

For transform sections, key by `transform-${tid}`. When transforms are added, default
to expanded. When deleted, the state naturally becomes stale (no-op on next render).

## Implementation Steps

### Phase 1: Create chevron-down SVG icon

**File**: `packages/app/src/icons/chevron-down.svg` — 24x24, stroke-width 2,
single polyline path.

**File**: `packages/app/src/icons/index.ts` — add `ChevronDown` export.

### Phase 2: Create CollapsibleCard component

**File**: `packages/app/src/components/CollapsibleCard/CollapsibleCard.tsx`

Simple component — ~30 lines. Takes `title`, `defaultOpen`, `children`.

**File**: `packages/app/src/components/CollapsibleCard/CollapsibleCard.module.css`

### Phase 3: Restructure sidebar sections

**File**: `packages/app/src/App.tsx`

Wrap each logical section in a `<CollapsibleCard>`:
- `AffineEditor` → `<CollapsibleCard title="Affine">`
- `FlameColorEditor` + `PaletteSelector` → `<CollapsibleCard title="Color & Palette">`
- Each `transformGrid` → `<CollapsibleCard title={readableIds().transformLabel[tid]}>`
- Render settings Card → `<CollapsibleCard title="Render">`
- Display toggles Card → `<CollapsibleCard title="Display">`
- Action buttons → `<CollapsibleCard title="Actions">`

### Phase 4: Style adjustments

**File**: `packages/app/src/App.module.css`

Minor adjustments:
- Reduce gap between CollapsibleCards in sidebar
- Ensure consistent padding within collapsed sections

## Verification

1. Each section toggles independently — click header, content disappears
2. Chevron rotates smoothly on toggle
3. Collapsed transform sections don't render their children (performance)
4. Adding/removing transforms doesn't break collapse state of other sections
5. Sidebar scroll becomes manageable with many transforms
6. Compact mode still works — CollapsibleCard headers respect compact density
7. `pnpm typecheck` passes

## Effort Estimate

| Phase | Effort |
|-------|--------|
| 1. Chevron icon | Tiny |
| 2. CollapsibleCard component | Small |
| 3. Restructure sidebar | Medium |
| 4. Style adjustments | Small |
