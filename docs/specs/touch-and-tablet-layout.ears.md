# Mobile and tablet responsive layout — EARS requirements

**Version:** 0.9.11 (`packages/app/package.json`) — the version whose shipped behaviour this describes
**Date:** 2026-09-10
**Scope:** Device classification (phone / tablet / desktop), the manual
`touchLayoutPreference` override, which chrome mounts in each band, the exact
breakpoint boundaries and which stylesheet owns each one, canvas mounting across
a layout switch, the touch gesture helper and its cleanup, and the guarantee
that the desktop path is unchanged. It does **not** cover the contents of the
desktop sidebar, the timeline, the Arena/Arcade overlays, or the export pipeline
— those surfaces only appear here where a breakpoint decides whether they mount.

**Source:**

- `packages/app/src/stores/workspaceLayoutStore.ts` — breakpoint constants, raw
  media-query signals, the `isPhone` / `isTablet` / `isTouchLayout` memos, the
  persisted `touchLayoutPreference`, and `createWorkspaceLayoutStore`
- `packages/app/src/MainWorkspace.tsx` — the media-query effect (`:390-427`), the
  touch-device offer toast (`:1438-1462`), the layout class string (`:3264`) and
  every `isPhone()` / `isTablet()` / `isTouchLayout()` mount gate
- `packages/app/src/App.module.css` — `.layout`, `.phoneLayout`, `.tabletLayout`,
  the legacy `@media (max-width: 768px)` block, and the touch toast column
- `packages/app/src/components/TouchSurface/TouchHUD.tsx` — the phone top HUD
- `packages/app/src/components/TouchSurface/MobileBottomSurface.tsx` — the phone
  bottom rail (collapsed pill bar / expanded sheet)
- `packages/app/src/components/TouchSurface/TabletInspectorDeck.tsx`,
  `TabletSplitLayout.tsx` — the tablet inspector and the (currently unmounted)
  standalone split wrapper
- `packages/app/src/components/TouchSurface/TouchControlSurface.tsx` — the shared
  Variations / Shape / Colour editor used by both touch layouts
- `packages/app/src/components/TouchSurface/AdvancedToolsDrawer.tsx` — the
  slide-over tools sheet and its Escape handling
- `packages/app/src/components/TouchSurface/TouchSurface.module.css` — fixed
  positioning, safe-area insets, `touch-action`, the inspector pane box
- `packages/app/src/utils/createHorizontalScrollDrag.ts` — wheel-to-horizontal
  and mouse drag-to-pan on the HUD rail and variation carousel
- `packages/app/src/components/CanvasViewport/CanvasViewport.tsx` — the single
  `AutoCanvas` mount and the mobile sidebar-toggle gate
- `packages/app/src/components/ExportJobs/ExportJobTracker.tsx`,
  `packages/app/src/components/Toast/Toast.tsx` — overlays that reposition under
  a touch layout
- `packages/app/src/components/SoftwareVersion/SoftwareVersion.tsx` — the menu
  entry that writes `touchLayoutPreference`
- `packages/app/src/utils/persistentSignal.ts` — the `chaos-master-` key prefix

**Tests:**

- `packages/app/src/stores/workspaceLayoutStore.test.ts` — the `desktop` and
  `touch` preference overrides and the `isTouchLayout` union (REQ-TL-005,
  REQ-TL-006, REQ-TL-008); it asserts `WIDE_LAYOUT_MIN_WIDTH === 769` but never
  680 or 1024, so REQ-TL-001 is only a third covered
- `packages/app/src/components/TouchSurface/TouchSurface.test.tsx` — HUD render
  and actions, bottom-rail expansion, tab switching, the variation weight
  slider, drawer open/close/Escape (REQ-TL-020, REQ-TL-022, REQ-TL-025,
  REQ-TL-029, REQ-TL-037)
- `packages/app/src/utils/createHorizontalScrollDrag.test.ts` — wheel mapping,
  touch-pointer passthrough, drag-suppresses-click, interactive-input exemption
  (REQ-TL-032 … REQ-TL-035); there is no disposal test, so REQ-TL-036 is unguarded
- `packages/app/src/components/SoftwareVersion/SoftwareVersion.test.tsx` — the
  desktop/touch menu variants and both directions of the layout switch
  (REQ-TL-039)
- _Gap:_ `MainWorkspace.tsx`, `CanvasViewport.tsx`, `Toast.tsx` and
  `ExportJobTracker.tsx` have **no test file at all**, and no Playwright spec
  drives the workspace at a phone or tablet viewport (`tests/smoke.spec.ts:164`
  resizes only for the benchmarks page; `tests/load-flame-dropzone.spec.ts:110`
  only for the dropzone modal). Every mount-gate, breakpoint and CSS requirement
  is therefore unguarded — see **Coverage gaps** at the end for the list.

---

## Requirements

### REQ-TL-001 — Three width bands, two constants

The layout store shall classify viewport width into exactly three bands from two
constants: **phone** below `PHONE_MAX_WIDTH` (680), **tablet** from 680 through
`TABLET_MAX_WIDTH` (1024) inclusive, and **desktop** above 1024. A viewport of
exactly 680 px shall be a tablet, and one of exactly 1024 px shall still be a
tablet.

_(`workspaceLayoutStore.ts:5-7`, `:14-25`, `:95-105`. `WIDE_LAYOUT_MIN_WIDTH`
(769) is a separate, older threshold that drives only the initial
`sidebarHidden` / `showTimeline` values at `:137-146` — it does not participate
in phone/tablet classification.)_

### REQ-TL-002 — Classification tracks resize without a resize listener

**When** the viewport crosses a band boundary, the store shall update its raw
classification from `matchMedia` `change` events rather than a `resize`
listener: `(max-width: 679.98px)` drives the phone signal and
`(min-width: 680px) and (max-width: 1024px)` drives the tablet signal.

_(`workspaceLayoutStore.ts:107-113` registers the module-level pair;
`MainWorkspace.tsx:390-427` registers a second, owned pair that writes the same
two raw signals, seeds them on mount, and removes its listeners in `onCleanup`.)_

### REQ-TL-003 — No `window`, no touch layout

**If** `window` is undefined — server-side rendering or a non-DOM test
environment — **then** both raw classification signals shall initialise to
`false`, so the app renders the desktop layout rather than throwing or guessing.

_(`workspaceLayoutStore.ts:9-25`, `:95-105`; `isTouchDevice()` at `:28-40`
returns `false` on the same guard.)_

### REQ-TL-004 — The layout preference survives a reload

The touch layout preference shall be one of `'auto' | 'touch' | 'desktop'`,
default `'auto'`, and shall persist to `localStorage` under
`chaos-master-chaos-touch-layout-pref`, written on every set.

_(`workspaceLayoutStore.ts:92-93` with the `chaos-master-` prefix applied at
`persistentSignal.ts:5`, `:66-71`. A storage failure — private mode, quota — is
swallowed at `persistentSignal.ts:18-24`, so the preference degrades to
session-only rather than breaking the layout.)_

### REQ-TL-005 — `desktop` wins over any width

**While** the preference is `'desktop'`, both `isPhone()` and `isTablet()` shall
report `false` regardless of viewport width, so a 390 px window renders the full
desktop chrome.

_(`workspaceLayoutStore.ts:115`, `:121`; guarded by
`workspaceLayoutStore.test.ts:69-73`.)_

### REQ-TL-006 — `touch` forces the tablet deck on any non-phone width

**While** the preference is `'touch'`, `isTablet()` shall report the negation of
the raw phone signal — so a 1920 px desktop window renders the tablet split
layout, and a narrow window still renders the phone layout.

_(`workspaceLayoutStore.ts:122`; guarded by `workspaceLayoutStore.test.ts:75-79`.
Note `isPhone`'s `'touch'` branch at `:116` and its fallthrough at `:117` return
the same expression, so the preference never changes the phone verdict.)_

### REQ-TL-007 — `auto` defers entirely to the media queries

**While** the preference is `'auto'`, `isPhone()` and `isTablet()` shall be the
raw media-query signals unmodified.

_(`workspaceLayoutStore.ts:117`, `:123`.)_

### REQ-TL-008 — One name for "either touch layout"

`isTouchLayout()` shall be exactly `isPhone() || isTablet()`, and every consumer
that only needs "is this a touch layout" shall read it rather than re-deriving
the union.

_(`workspaceLayoutStore.ts:126`; read by `Toast.tsx:20`, `:30`,
`ExportJobTracker.tsx:53`, `SoftwareVersion.tsx:24`, and
`MainWorkspace.tsx:3493`, `:3503`, `:3512`, `:3521`. Guarded by
`workspaceLayoutStore.test.ts:62-63`, `:78-79`.)_

### REQ-TL-009 — The shared classification memos are owned

The `isPhone`, `isTablet` and `isTouchLayout` memos shall be created under a
reactive owner, so that they are disposed with the app and the console stays
free of ownership warnings on boot.

> **Known deviation:** `packages/app/src/stores/workspaceLayoutStore.ts:114`,
> `:120` and `:126` are bare module-scope `createMemo` calls with no
> `createRoot`. Solid logs "computations created outside a `createRoot` or
> `render` will never be disposed" three times on every page load, and the memos
> live for the lifetime of the module rather than the app.

### REQ-TL-010 — A touch device on a wide screen is offered the touch layout, once

**When** the workspace mounts on a device that reports touch capability
(`ontouchstart`, `maxTouchPoints`/`msMaxTouchPoints` above zero, or
`(pointer: coarse)`) while the preference is `'auto'` and neither `isPhone()`
nor `isTablet()` holds, the app shall raise a **sticky** toast offering "Switch
to Touch" and "Keep Desktop", each of which writes the corresponding preference
— so the offer cannot recur once either button is pressed.

_(`MainWorkspace.tsx:1438-1462`, `workspaceLayoutStore.ts:28-40`. The toast is
sticky rather than timed, so ignoring it leaves the preference `'auto'` and the
offer returns on the next mount.)_

### REQ-TL-011 — Phone chrome is the HUD plus the bottom rail

**While** `isPhone()` holds, the workspace shall mount `TouchHUD` and
`MobileBottomSurface`, and shall mount neither the desktop sidebar, the bottom
bar, nor the floating action cluster.

_(`MainWorkspace.tsx:3404-3451` mounts the pair; `:3315`, `:3544` and `:3851`
gate the three desktop surfaces on `!isPhone() && !isTablet()`.)_

### REQ-TL-012 — Tablet chrome is the inspector deck alone

**While** `isTablet()` holds, the workspace shall mount `TabletInspectorDeck` as
a sibling of the canvas viewport, and shall mount neither `TouchHUD` nor
`MobileBottomSurface` — the deck carries its own header row with the gallery
picker, Undo, Redo and Flash Export.

_(`MainWorkspace.tsx:3454-3476`; `TabletInspectorDeck.tsx:29-90`. The exported
`TabletSplitLayout` wrapper — `TabletSplitLayout.tsx:5-25` — is **not** on this
path: the workspace composes the split from the `.tabletLayout` grid plus the
deck instead, and the wrapper's only caller is `TouchSurface.test.tsx:229-247`.)_

### REQ-TL-013 — The desktop path is untouched

**While** neither `isPhone()` nor `isTablet()` holds, the workspace shall render
exactly the pre-existing desktop composition — sidebar, bottom bar, floating
actions, and the desktop version pill — and shall mount no TouchSurface
component except the `AdvancedToolsDrawer`, which is always mounted but renders
nothing while closed.

_(`MainWorkspace.tsx:3315`, `:3544`, `:3851`; `SoftwareVersion.tsx:171-204`
selects the desktop trigger from `isTouchLayout()`; `AdvancedToolsDrawer.tsx:128`
wraps the whole panel in `<Show when={props.open}>`.)_

### REQ-TL-014 — No orphaned hamburger under a touch layout

**While** either touch layout is active, the canvas viewport shall suppress the
mobile sidebar-toggle button, because the sidebar it opens is not mounted.

_(`MainWorkspace.tsx:3271` passes `hideMobileSidebarToggle={isPhone() ||
isTablet()}`; `CanvasViewport.tsx:103` gates the button on
`props.isMobile() && !props.hideMobileSidebarToggle`.)_

### REQ-TL-015 — The phone grid is one full-bleed viewport cell

**While** `isPhone()` holds, the workspace root shall carry `.phoneLayout`,
collapsing the grid to a single `viewport` area with one column and one row, so
the canvas fills the screen under the fixed HUD and bottom rail.

_(`MainWorkspace.tsx:3264`; `App.module.css:15-19`. The HUD and rail are
`position: fixed` with `z-index` 45 and 40 — `TouchSurface.module.css:3-8`,
`:263-268` — so neither consumes grid space.)_

### REQ-TL-016 — The tablet grid is a canvas/inspector split across the whole band

**While** `isTablet()` holds, the workspace root shall carry `.tabletLayout` and
present a two-column `'viewport inspector'` grid for the entire 680–1024 px
band, so the inspector deck sits beside the canvas rather than over or under it.

> **Known deviation:** `packages/app/src/App.module.css:21` — `.tabletLayout` is
> a single-class rule at line 21, and the legacy
> `@media (max-width: 768px) { .layout { … } }` block at `:1429-1435` has equal
> specificity and later source order. From 680 px to 768 px the media block wins
> and rewrites the root to `grid-template-columns: 1fr` with areas
> `'viewport' 'viewport-controls'`. The `inspector` area no longer exists, so
> the deck's `grid-area: inspector`
> (`packages/app/src/components/TouchSurface/TouchSurface.module.css:346`) falls
> into an implicit row and the split does not render. iPad Mini portrait
> (768 px), older iPads and many Android tablets sit inside that band.

### REQ-TL-017 — The inspector deck is a self-contained scroll region

**Where** the tablet inspector deck is mounted, it shall occupy the `inspector`
grid area at `clamp(340px, 35vw, 420px)` wide and full height, scroll its own
overflow with `overscroll-behavior: contain` so a flick inside it never scrolls
the page, and pad its bottom to at least `env(safe-area-inset-bottom)`.

_(`TouchSurface.module.css:345-360`.)_

### REQ-TL-018 — A layout switch never remounts the canvas

The WebGPU canvas shall be mounted exactly once, by the single `CanvasViewport`
that every layout shares, so switching between phone, tablet and desktop changes
only grid classes and sibling chrome — never the `AutoCanvas` element, its
device, or its accumulated render.

_(`MainWorkspace.tsx:3268-3401` mounts one `CanvasViewport` outside every
layout gate; `CanvasViewport.tsx:131-139` mounts one `AutoCanvas`. The
`isPhone()` / `isTablet()` reads at `:3264` and `:3271` only feed a class string
and a boolean prop.)_

### REQ-TL-019 — Corner overlays move away from the inspector

**While** `isTouchLayout()` holds, the toast column and the export job tracker
shall move from the top-right to the top-left, offset below the HUD row, so they
cannot cover the tablet inspector deck or the HUD's More menu; the tracker shall
continue to publish its measured height as `--toast-stack-offset` so toasts
stack beneath it in both positions.

_(`Toast.tsx:20`, `:30` with `App.module.css:1266-1274`;
`ExportJobTracker.tsx:53` with `ExportJobTracker.module.css:20-24`; the offset is
written and cleared at `ExportJobTracker.tsx:26-47`.)_

### REQ-TL-020 — The bottom rail opens on the tab that was tapped

**When** a chip in the collapsed pill bar is tapped, the mobile bottom surface
shall expand the sheet **and** select that chip's tab (`variations`, `shape` or
`colour`) in one action.

_(`MobileBottomSurface.tsx:11-14`, `:19-55`, passed on as `initialTab` at `:72`;
guarded by `TouchSurface.test.tsx:177-200`.)_

### REQ-TL-021 — The sheet collapses from its handle

**When** the drag-handle row of the expanded sheet is tapped, the bottom surface
shall collapse back to the pill bar, keeping the last selected tab for the next
expansion.

_(`MobileBottomSurface.tsx:60-66`; the tab signal at `:9` is not reset on
collapse.)_

### REQ-TL-022 — The phone HUD carries five controls and reflects history state

**While** the phone HUD is mounted, it shall present a gallery button, the
truncated flame title, a horizontally scrollable rail of Undo / Redo / Snapshot,
and a More menu holding Mutate, Randomize, full Export and — only where an
`onOpenDrawer` handler was supplied — Advanced Tools. Undo and Redo shall be
`disabled` whenever the corresponding `canUndo` / `canRedo` accessor reports
false.

_(`TouchHUD.tsx:64-236`; disabled state at `:121` and `:135`; the conditional
drawer item at `:219-232`. Guarded in part by `TouchSurface.test.tsx:12-65`,
which does not exercise the disabled state.)_

### REQ-TL-023 — Touch chrome falls back to the command registry

**If** a touch component is mounted without an explicit handler prop, **then**
the corresponding button shall dispatch the equivalent registry command
(`history.undo`, `history.redo`, `flame.quickExport`, `export.png`,
`flame.mutate`, `flame.randomize`) through `executeCommand`, so the surface is
usable standalone and every action stays a single auditable command.

_(`TouchHUD.tsx:53-62`, `:122-125`, `:136-141`, `:184-203`;
`TabletInspectorDeck.tsx:57-85`; `TouchControlSurface.tsx:572-588`.)_

### REQ-TL-024 — Popovers dismiss on an outside tap

**When** the HUD title tooltip or the More menu is open, a full-viewport
backdrop shall be rendered beneath it, and tapping that backdrop shall close the
popover — a touch layout has no hover-out to rely on.

_(`TouchHUD.tsx:93-97`, `:168-173`; `TouchSurface.module.css:210-215` fixes the
backdrop at `z-index: 55`, below the popovers' 60.)_

### REQ-TL-025 — The control surface owns its tab, and honours a new `initialTab`

The shared touch control surface shall keep its own active tab, initialised from
`initialTab` (defaulting to `variations`), and **when** `initialTab` changes to a
defined value it shall adopt that tab — which is how the phone pill bar steers a
sheet that is already open.

_(`TouchControlSurface.tsx:69-76`; guarded by `TouchSurface.test.tsx:123-153`
for the tab switch, though not for the `initialTab` effect.)_

### REQ-TL-026 — Variation previews render only near the viewport

**While** the Variations tab is showing, each gallery tile shall mount its
`VariationPreview` only once a shared `IntersectionObserver` with a 200 px
`rootMargin` reports it near the viewport, and all previews shall render inside a
`ComputeGate` capped at `COMPUTE_GATE_CAPACITY` — so a 36-tile carousel on a
phone never asks the GPU for 36 simultaneous renders.

_(`TouchControlSurface.tsx:87-93`, `:133-139`, `:316-365`.)_

### REQ-TL-027 — Tapping a tile adds; tapping an active tile does nothing

**When** a gallery tile whose variation is not present on the current transform
is tapped, the surface shall dispatch `flame.addVariation` for that transform;
**if** the variation is already active, **then** the tap shall be a no-op rather
than adding a duplicate.

_(`TouchControlSurface.tsx:126-131`, `:335-343`.)_

### REQ-TL-028 — The transform strip cannot delete the last transform

The transform strip shall list every transform as a `T<n>` pill with the active
one marked `aria-pressed`, shall always offer Add Transform, and shall offer
Delete Transform **only where** more than one transform exists.

_(`TouchControlSurface.tsx:149-194`; the delete button is wrapped in
`<Show when={transformIds().length > 1}>` at `:180`.)_

### REQ-TL-029 — The weight slider writes through a command

**When** a variation's weight slider is dragged, the surface shall dispatch
`flame.setVariationWeight` with the transform id, variation id and the numeric
value, over the range −1 … 2 in steps of 0.02.

_(`TouchControlSurface.tsx:252-268`; guarded by `TouchSurface.test.tsx:155-173`,
which asserts the resulting descriptor value.)_

### REQ-TL-030 — Shape edits all route through one affine command

**When** the affine grid is dragged, a scrub field is changed, or Reset Shape is
tapped, the surface shall dispatch `flame.setTransformAffine` for the current
transform with slot `'pre'` and origin `'grid'` — the scrub path recomposing the
full affine from the decomposed controls so an edit to one control cannot drop
the others.

_(`TouchControlSurface.tsx:429-495`; recomposition at `:461-471`.)_

### REQ-TL-031 — The colour tab offers a fixed hue-spread palette strip

The Colour tab shall present exactly 14 palette swatches, chosen at module load
by bucketing the chromatic default palettes into 14 hue buckets and taking the
first palette in each — falling back to the remaining chromatic palettes if
fewer than 14 buckets are occupied — plus sliders for the transform's colour
coordinate and colour speed.

_(`TouchControlSurface.tsx:42-60`, `:498-560`.)_

### REQ-TL-032 — Wheel scrolls the rails horizontally

**When** a wheel event reaches a horizontal rail (the HUD controls rail or the
variation carousel), the helper shall add the dominant axis delta to
`scrollLeft` and call `preventDefault()`, so a vertical trackpad or mouse wheel
pans the strip instead of scrolling the page.

_(`createHorizontalScrollDrag.ts:38-46`, wired at `TouchHUD.tsx:45` and
`TouchControlSurface.tsx:91-93`; guarded by
`createHorizontalScrollDrag.test.ts:6-32`.)_

### REQ-TL-033 — Touch pointers are left to the browser

**If** a `pointerdown` reports `pointerType === 'touch'`, **then** the drag
helper shall return immediately, leaving native touch scrolling and its momentum
intact — the helper exists for mice, not fingers.

_(`createHorizontalScrollDrag.ts:57`; guarded by
`createHorizontalScrollDrag.test.ts:111-137`.)_

### REQ-TL-034 — A drag never fires the tile underneath it

**When** a primary-button pointer moves more than 4 px from its press point, the
helper shall enter drag mode, capture the pointer, pan the rail, and swallow the
subsequent `click` in the capture phase for a further 60 ms — so dragging past a
variation tile does not add that variation. A press that never exceeds the
threshold shall let its click through untouched.

_(`createHorizontalScrollDrag.ts:70-118`; guarded by
`createHorizontalScrollDrag.test.ts:34-110`.)_

### REQ-TL-035 — Inputs inside a rail keep their own gestures

**If** a wheel or pointer press lands on an `input`, `select`, `textarea`,
`contenteditable` element, or anything inside `[data-step]` /
`[data-prevent-horizontal-scroll]`, **then** the helper shall not intercept it —
so a range slider inside the rail still drags as a slider.

_(`createHorizontalScrollDrag.ts:24-35`, checked at `:39` and `:61`; guarded by
`createHorizontalScrollDrag.test.ts:138-192`.)_

### REQ-TL-036 — The drag helper leaves nothing behind

**When** the owning component is disposed, the helper shall remove all six
listeners it added (`wheel`, `pointerdown`, `pointermove`, `pointerup`,
`pointercancel`, and the capture-phase `click`) and strip the dragging class
from the element.

_(`createHorizontalScrollDrag.ts:120-137`.)_

### REQ-TL-037 — Escape closes the tools drawer, and only while it is open

**While** the Advanced Tools drawer is open, a window-level `keydown` listener
shall close it on `Escape`; that listener shall be registered only while the
drawer is open and removed as soon as it closes or the component is disposed.

_(`AdvancedToolsDrawer.tsx:21-32` — the effect returns early on `!props.open`,
so `onCleanup` runs the removal on the transition to closed. Guarded by
`TouchSurface.test.tsx:107-119`.)_

### REQ-TL-038 — Desktop-only tools switch the layout before they open

**When** the drawer's Breeding, Audio Reactive, Sonification or Timeline card is
tapped **while** `isTouchLayout()` holds, the workspace shall first set the
preference to `'desktop'` and raise a timed toast naming the reason, then open
the requested tool — because none of those panels have a touch layout.

> **Known deviation:** `packages/app/src/components/AdvancedToolsDrawer/AdvancedToolsDrawer.tsx:33-122`
> — the drawer's `tools()` list contains gallery, switch-desktop, art-director,
> arena-clash, genetics-breeding, audio-reactive, timeline-animation and
> high-res-export. There is **no Sonification card**, and the `onSonification?`
> prop declared at `:12` has zero call sites even though `MainWorkspace.tsx:3510-3518`
> passes a complete handler. The Sonification half of this requirement therefore
> describes a path a user cannot take today. Tracked in `docs/agent/BUGS.md`.

_(`MainWorkspace.tsx:3492-3527`; the "Switch to Desktop Layout" card itself at
`:3483-3489`. `TouchSurface.test.tsx:69-105` asserts only that the callbacks
fire — the preference write and toast live in `MainWorkspace`, which has no test.)_

### REQ-TL-039 — The app menu switches layouts in both directions

**Where** the app menu is shown, its first entry shall write the opposite
preference to the current layout — "Switch to Touch Studio" writing `'touch'`
from the desktop pill, "Switch to Desktop Layout" writing `'desktop'` from the
touch hamburger — and shall close the menu in the same click.

_(`SoftwareVersion.tsx:46-68`, `:171-235`; the writer prefers the injected
`setTouchLayoutPreference` prop and falls back to the module setter at `:25-31`.
Guarded by `SoftwareVersion.test.tsx:52-57` and `:91-94`.)_

---

## Coverage gaps

No assertion anywhere goes red if these are violated. They are listed so the
gap is a work item rather than a silent claim of coverage.

**No test at all** (the file under test has no test file, and no e2e spec drives
the workspace at a phone or tablet viewport):

REQ-TL-002, REQ-TL-003, REQ-TL-004, REQ-TL-009, REQ-TL-010, REQ-TL-011,
REQ-TL-012, REQ-TL-013, REQ-TL-014, REQ-TL-015, REQ-TL-016, REQ-TL-017,
REQ-TL-018, REQ-TL-019, REQ-TL-021, REQ-TL-023, REQ-TL-024, REQ-TL-026,
REQ-TL-027, REQ-TL-030, REQ-TL-031, REQ-TL-036, REQ-TL-038.

**Partially covered** — a test names the surface but no assertion covers the
requirement's substance:

- **REQ-TL-001** — `workspaceLayoutStore.test.ts:50` pins only
  `WIDE_LAYOUT_MIN_WIDTH`; neither 680 nor 1024 nor the inclusive boundaries are
  asserted.
- **REQ-TL-007** — `workspaceLayoutStore.test.ts:81` restores `'auto'` but
  asserts nothing afterwards.
- **REQ-TL-022** — `TouchSurface.test.tsx:12-65` clicks the buttons but never
  exercises the `disabled` state driven by `canUndo` / `canRedo`.
- **REQ-TL-025** — the tab switch is covered; the `initialTab` `createEffect`
  (`TouchControlSurface.tsx:72-76`) is not.
- **REQ-TL-028** — the `T1` pill is asserted; Add Transform and the
  single-transform delete guard are not.

**Highest-value additions**, in order: a Playwright spec that loads the
workspace at 390 / 720 / 1200 px and asserts which chrome mounts (would guard
REQ-TL-011 … REQ-TL-014 and catch REQ-TL-016's deviation, which is a pure-CSS
regression no unit test can see); a `workspaceLayoutStore` test that drives the
raw signals across all four boundaries (REQ-TL-001, REQ-TL-002); and a disposal
test for `createHorizontalScrollDrag` (REQ-TL-036).
