# Mobile and tablet responsive layout — EARS requirements

**Version:** 0.9.11 (`packages/app/package.json`) — the version whose shipped behaviour this describes
**Date:** 2026-09-10
**Status (2026-09-23):** partly superseded. The native rail (#95, `fac9214a`)
and the shell (#96, `68a4ef51`) replaced the media-query classification with
`classifyLayout`, the phone bottom rail `MobileBottomSurface` with `EditorRail`,
and the two-column tablet grid with a rail, canvas and deck; they deleted the
unmounted `TabletSplitLayout`. Requirements marked **Superseded** say what
replaced them and keep their old text pinned to `a5c2f26f`, the tree they
describe. The others were re-pointed at the current tree on 2026-09-23. A
rewrite of the superseded requirements against the native rail is still owed.
**Scope:** Device classification (phone / tablet / desktop), the manual
`touchLayoutPreference` override, which chrome mounts in each band, the exact
breakpoint boundaries and which stylesheet owns each one, canvas mounting across
a layout switch, the touch gesture helper and its cleanup, and the guarantee
that the desktop path is unchanged. It does **not** cover the contents of the
desktop sidebar, the timeline, the Arena/Arcade overlays, or the export pipeline
— those surfaces only appear here where a breakpoint decides whether they mount.

**Source:**

- `packages/app/src/stores/workspaceLayoutStore.ts` — breakpoint constants,
  `classifyLayout`, the `isPhone` / `isTablet` / `isTouchLayout` / `deckFits`
  memos, the persisted `touchLayoutPreference`, and `createWorkspaceLayoutStore`
- `packages/app/src/MainWorkspace.tsx` — the `railLayout` memo (`:329`
  (`railLayout`)), the touch-device offer toast (`:1511-1535` (`isTouchDevice`)),
  the layout class string (`:3784` (`railLayout`)) and every `isPhone()` /
  `isTablet()` / `isTouchLayout()` mount gate
- `packages/app/src/App.module.css` — `.layout`, `.phoneLayout`, `.tabletLayout`,
  the legacy `@media (max-width: 768px)` block, and the touch toast column
- `packages/app/src/components/TouchSurface/TouchHUD.tsx` — the phone top HUD
- `packages/app/src/components/TouchSurface/EditorRail.tsx` — the bottom rail
  of the rail layout, one surface at three detents (replaced
  `MobileBottomSurface` in #95)
- `packages/app/src/components/TouchSurface/TabletInspectorDeck.tsx` — the
  tablet inspector deck
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
- _Gap:_ `Toast.tsx` and `ExportJobTracker.tsx` have **no test file at all**,
  `MainWorkspace.tsx` and `CanvasViewport.tsx` have tests for other concerns
  only (`MainWorkspace.capture.test.ts`, `CanvasViewport.badge.test.tsx`), and no
  Playwright spec drives the workspace at a phone or tablet viewport
  (`tests/smoke.ci.spec.ts:168` (`setViewportSize`) resizes only for the benchmarks page; `tests/load-flame-dropzone.spec.ts:110` (`setViewportSize`)
  only for the dropzone modal). Every mount-gate, breakpoint and CSS requirement
  is therefore unguarded — see **Coverage gaps** at the end for the list.

---

## Requirements

### REQ-TL-001 — Three width bands, two constants

**Where** the web app runs under a fine pointer, the layout store shall classify
viewport width into exactly three bands from two constants: **phone** below
`PHONE_MAX_WIDTH` (680), **tablet** from 680 through `TABLET_MAX_WIDTH` (1024)
inclusive, and **desktop** above 1024. A viewport of exactly 680 px shall be a
tablet, and one of exactly 1024 px shall still be a tablet. **Where** the app is
native or the pointer is coarse, it shall classify by the screen's short edge
instead: a phone below `COMPACT_MAX_SHORT_EDGE` (680), otherwise a tablet, and
never desktop unless the preference says so (REQ-TL-005).

_(`workspaceLayoutStore.ts:6-8` (`WIDE_LAYOUT_MIN_WIDTH`), `:48-64` (`classifyLayout`). `WIDE_LAYOUT_MIN_WIDTH`
(769) is a separate, older threshold that drives only the initial
`sidebarHidden` / `showTimeline` values at `workspaceLayoutStore.ts:237-248`
(`showTimeline`) — it does not participate in phone/tablet classification.
Guarded by `workspaceLayoutStore.test.ts:101-107` "keeps the width rules for a fine pointer"
and, for devices, `:34-88` (`classifyLayout`).)_

### REQ-TL-002 — Classification tracks resize without a resize listener

> **Superseded** by #95 (`fac9214a`). The store now follows one `resize`
> listener and a `(pointer: coarse)` `change` listener
> (`workspaceLayoutStore.ts:164-173` (`setViewport`)), and `MainWorkspace`
> registers no media-query pair of its own. The requirement below describes the
> code at `a5c2f26f`.

<!-- cite-check: pinned a5c2f26f -->

**When** the viewport crosses a band boundary, the store shall update its raw
classification from `matchMedia` `change` events rather than a `resize`
listener: `(max-width: 679.98px)` drives the phone signal and
`(min-width: 680px) and (max-width: 1024px)` drives the tablet signal.

_(`workspaceLayoutStore.ts:107-113` registers the module-level pair;
`MainWorkspace.tsx:390-427` registers a second, owned pair that writes the same
two raw signals, seeds them on mount, and removes its listeners in `onCleanup`.)_

<!-- cite-check: live -->

### REQ-TL-003 — No `window`, no touch layout

> **Superseded** by #95 (`fac9214a`). With no `window` the store now assumes a
> 1024 x 768 window (`workspaceLayoutStore.ts:152-156` (`readWindow`)), which
> `classifyLayout` puts in the tablet band. The requirement below describes the
> code at `a5c2f26f`.

<!-- cite-check: pinned a5c2f26f -->

**If** `window` is undefined — server-side rendering or a non-DOM test
environment — **then** both raw classification signals shall initialise to
`false`, so the app renders the desktop layout rather than throwing or guessing.

_(`workspaceLayoutStore.ts:9-25`, `:95-105`; `isTouchDevice()` at `:28-40`
returns `false` on the same guard.)_

<!-- cite-check: live -->

### REQ-TL-004 — The layout preference survives a reload

The touch layout preference shall be one of `'auto' | 'touch' | 'desktop'`,
default `'auto'`, and shall persist to `localStorage` under
`chaos-master-chaos-touch-layout-pref`, written on every set.

_(`workspaceLayoutStore.ts:132-133` (`touchLayoutPreference`), with the `chaos-master-` prefix applied at
`persistentSignal.ts:5` (`PREFIX`), `:66-71` (`persistedSet`). A storage failure — private mode, quota — is
swallowed at `persistentSignal.ts:18-24` (`writeStored`), so the preference degrades to
session-only rather than breaking the layout.)_

### REQ-TL-005 — `desktop` wins over any width

**While** the preference is `'desktop'`, both `isPhone()` and `isTablet()` shall
report `false` regardless of viewport width, so a 390 px window renders the full
desktop chrome.

_(`workspaceLayoutStore.ts:49` (`classifyLayout`) returns `'desktop'` before
anything else is read; guarded by `workspaceLayoutStore.test.ts:223-227`
(`setTouchLayoutPreference`) and `:122` "honours the preference", which also
covers the native app.)_

### REQ-TL-006 — `touch` forces the tablet deck on any non-phone width

> **Superseded** by #95 (`fac9214a`). Under `'touch'`, `classifyLayout`
> (`workspaceLayoutStore.ts:48-64` (`classifyLayout`)) makes a desktop browser a
> phone when its window's short edge is under 680 px and a tablet otherwise; a
> device measures its screen instead. Guarded by `workspaceLayoutStore.test.ts:122`
> "honours the preference". The requirement below describes the code at
> `a5c2f26f`.

<!-- cite-check: pinned a5c2f26f -->

**While** the preference is `'touch'`, `isTablet()` shall report the negation of
the raw phone signal — so a 1920 px desktop window renders the tablet split
layout, and a narrow window still renders the phone layout.

_(`workspaceLayoutStore.ts:122`; guarded by `workspaceLayoutStore.test.ts:75-79`.
Note `isPhone`'s `'touch'` branch at `workspaceLayoutStore.ts:116` and its fallthrough at `:117` return
the same expression, so the preference never changes the phone verdict.)_

<!-- cite-check: live -->

### REQ-TL-007 — `auto` defers entirely to the media queries

> **Superseded** by #95 (`fac9214a`). Under `'auto'` a device (the native app,
> or a coarse pointer) is classified by its screen's short edge and a fine
> pointer by the width bands of REQ-TL-001 (`workspaceLayoutStore.ts:48-64`
> (`classifyLayout`)). The requirement below describes the code at `a5c2f26f`.

<!-- cite-check: pinned a5c2f26f -->

**While** the preference is `'auto'`, `isPhone()` and `isTablet()` shall be the
raw media-query signals unmodified.

_(`workspaceLayoutStore.ts:117`, `:123`.)_

<!-- cite-check: live -->

### REQ-TL-008 — One name for "either touch layout"

`isTouchLayout()` shall be exactly `isPhone() || isTablet()`, and every consumer
that only needs "is this a touch layout" shall read it rather than re-deriving
the union.

_(`workspaceLayoutStore.ts:202` (`isTouchLayout`); read by `Toast.tsx:20` (`toastRegionTouch`), `:30` (`toastTouch`),
`ExportJobTracker.tsx:55` (`trackerTouch`), `SoftwareVersion.tsx:31` (`globalIsTouchLayout`), and
`MainWorkspace.tsx:4039` (`isTouchLayout`), `:4049` (`isTouchLayout`), `:4058` (`isTouchLayout`), `:4057` (`isTouchLayout`). Guarded by
`workspaceLayoutStore.test.ts:215-216` (`isTouchLayout`), `:232-233` (`isTouchLayout`).)_

### REQ-TL-009 — The shared classification memos are owned

The `isPhone`, `isTablet` and `isTouchLayout` memos shall be created under a
reactive owner, so that they are disposed with the app and the console stays
free of ownership warnings on boot.

<!-- cite-check: pinned a5c2f26f -->

> **Fixed deviation** (#90, `b17c7b6e`; this note describes the code at `a5c2f26f`): `packages/app/src/stores/workspaceLayoutStore.ts:114`,
> `:120` and `:126` are bare module-scope `createMemo` calls with no
> `createRoot`. Solid logs "computations created outside a `createRoot` or
> `render` will never be disposed" three times on every page load, and the memos
> live for the lifetime of the module rather than the app.

<!-- cite-check: live -->

### REQ-TL-010 — A touch device on a wide screen is offered the touch layout, once

**When** the workspace mounts on a device that reports touch capability
(`ontouchstart`, `maxTouchPoints`/`msMaxTouchPoints` above zero, or
`(pointer: coarse)`) while the preference is `'auto'` and neither `isPhone()`
nor `isTablet()` holds, the app shall raise a **sticky** toast offering "Switch
to Touch" and "Keep Desktop", each of which writes the corresponding preference
— so the offer cannot recur once either button is pressed.

_(`MainWorkspace.tsx:1511-1535` (`isTouchDevice`), `workspaceLayoutStore.ts:70-82` (`isTouchDevice`). The toast is
sticky rather than timed, so ignoring it leaves the preference `'auto'` and the
offer returns on the next mount.)_

### REQ-TL-011 — Phone chrome is the HUD plus the bottom rail

**While** the rail layout holds — a phone, or a tablet narrower than
`DECK_MIN_WIDTH` (900 px) — the workspace shall mount `TouchHUD` and
`EditorRail`, and shall mount neither the desktop sidebar, the bottom bar, nor
the floating action cluster.

_(`MainWorkspace.tsx:329` (`railLayout`) defines the layout; `:3935-3973` (`railLayout`) mounts the pair; `:3838` (`isPhone`), `:4080` (`isPhone`) and `:4380` (`showArena`)
gate the three desktop surfaces on `!isPhone() && !isTablet()`.)_

### REQ-TL-012 — Tablet chrome is the inspector deck alone

**While** `isTablet()` holds and the deck fits (the viewport is at least
`DECK_MIN_WIDTH`, 900 px, wide), the workspace shall mount `TabletInspectorDeck`
as a sibling of the canvas viewport, and shall mount neither `TouchHUD` nor
`EditorRail` — the deck carries its own header row with the gallery picker,
Undo, Redo and Save image (a tap saves, a hold opens the export options). A
tablet narrower than that gets the rail layout of REQ-TL-011 instead.

_(`MainWorkspace.tsx:3976-4012` (`deckFits`); `TabletInspectorDeck.tsx:137-196` (`header`). #95
deleted the unmounted `TabletSplitLayout` wrapper this requirement used to
mention.)_

### REQ-TL-013 — The desktop path is untouched

**While** neither `isPhone()` nor `isTablet()` holds, the workspace shall render
exactly the pre-existing desktop composition — sidebar, bottom bar, floating
actions, and the desktop version pill — and shall mount no TouchSurface
component except the `AdvancedToolsDrawer`, which is always mounted but renders
nothing while closed.

_(`MainWorkspace.tsx:3838` (`isPhone`), `:4080` (`isPhone`), `:4380` (`showArena`); `SoftwareVersion.tsx:193-196` (`isTouch`)
selects the desktop trigger from `isTouchLayout()`; `AdvancedToolsDrawer.tsx:128` (`open`)
wraps the whole panel in `<Show when={props.open}>`.)_

### REQ-TL-014 — No orphaned hamburger under a touch layout

**While** either touch layout is active, the canvas viewport shall suppress the
mobile sidebar-toggle button, because the sidebar it opens is not mounted.

_(`MainWorkspace.tsx:3791` passes `hideMobileSidebarToggle={isPhone() ||
isTablet()}`; `CanvasViewport.tsx:129` (`hideMobileSidebarToggle`) gates the button on
`props.isMobile() && !props.hideMobileSidebarToggle`.)_

### REQ-TL-015 — The phone grid is one full-bleed viewport cell

**While** the rail layout holds (REQ-TL-011), the workspace root shall carry
`.phoneLayout`, collapsing the grid to a single `viewport` area with one column
and one row, so the canvas fills the screen under the fixed HUD and bottom rail.

_(`MainWorkspace.tsx:3784` (`railLayout`); `App.module.css:15-19` (`.phoneLayout`). The HUD and rail are
`position: fixed` with `z-index` 42 and 40 — `TouchSurface.module.css:3-10` (`.topHud`),
`EditorRail.module.css:5-10` (`.dock`) — so neither consumes grid space.)_

### REQ-TL-016 — The tablet grid is a canvas/inspector split across the whole band

> **Superseded** by #95 (`fac9214a`) and #96 (`68a4ef51`). `.tabletLayout` is
> now a three-column `'navrail viewport inspector'` grid (`App.module.css:24-28`
> (`.tabletLayout`)), applied only while the deck fits: a tablet at least
> `DECK_MIN_WIDTH` (900 px) wide (`MainWorkspace.tsx:3784` (`deckFits`)). A
> narrower tablet gets the rail layout. The requirement and the fixed deviation
> below describe the code at `a5c2f26f`.

<!-- cite-check: pinned a5c2f26f -->

**While** `isTablet()` holds, the workspace root shall carry `.tabletLayout` and
present a two-column `'viewport inspector'` grid for the entire 680–1024 px
band, so the inspector deck sits beside the canvas rather than over or under it.

> **Fixed deviation** (#90, `7062e1f2`; this note describes the code at `a5c2f26f`): `packages/app/src/App.module.css:21` — `.tabletLayout` is
> a single-class rule at line 21, and the legacy
> `@media (max-width: 768px) { .layout { … } }` block at `:1429-1435` has equal
> specificity and later source order. From 680 px to 768 px the media block wins
> and rewrites the root to `grid-template-columns: 1fr` with areas
> `'viewport' 'viewport-controls'`. The `inspector` area no longer exists, so
> the deck's `grid-area: inspector`
> (`packages/app/src/components/TouchSurface/TouchSurface.module.css:346`) falls
> into an implicit row and the split does not render. iPad Mini portrait
> (768 px), older iPads and many Android tablets sit inside that band.

<!-- cite-check: live -->

### REQ-TL-017 — The inspector deck is a self-contained scroll region

> **Superseded** by #95 (`fac9214a`). The deck is now `.deck` in
> `TabletDeck.module.css:5-18` (`.deck`): `var(--la-deck-w)` wide, padded to
> `var(--la-safe-bottom)`. The requirement below describes the code at
> `a5c2f26f`.

<!-- cite-check: pinned a5c2f26f -->

**Where** the tablet inspector deck is mounted, it shall occupy the `inspector`
grid area at `clamp(340px, 35vw, 420px)` wide and full height, scroll its own
overflow with `overscroll-behavior: contain` so a flick inside it never scrolls
the page, and pad its bottom to at least `env(safe-area-inset-bottom)`.

_(`TouchSurface.module.css:345-360`.)_

<!-- cite-check: live -->

### REQ-TL-018 — A layout switch never remounts the canvas

The WebGPU canvas shall be mounted exactly once, by the single `CanvasViewport`
that every layout shares, so switching between phone, tablet and desktop changes
only grid classes and sibling chrome — never the `AutoCanvas` element, its
device, or its accumulated render.

_(`MainWorkspace.tsx:3798-3934` (`CanvasViewport`) mounts one `CanvasViewport` outside every
layout gate; `CanvasViewport.tsx:157-165` (`AutoCanvas`) mounts one `AutoCanvas`. The layout
reads beside it, `MainWorkspace.tsx:3784` (`railLayout`) and `:3791`
(`hideMobileSidebarToggle`), only feed a class string and a boolean prop.)_

### REQ-TL-019 — Corner overlays move away from the inspector

**While** `isTouchLayout()` holds, the toast column and the export job tracker
shall move from the top-right to the top-left, offset below the HUD row, so they
cannot cover the tablet inspector deck or the HUD's More menu; the tracker shall
continue to publish its measured height as `--toast-stack-offset` so toasts
stack beneath it in both positions.

_(`Toast.tsx:20` (`toastRegionTouch`), `:30` (`toastTouch`) with `App.module.css:1235-1243` (`.toast-region-touch`);
`ExportJobTracker.tsx:55` (`trackerTouch`) with `ExportJobTracker.module.css:20-26` (`.trackerTouch`); the offset is
written and cleared at `ExportJobTracker.tsx:28-49` (`createEffect`).)_

### REQ-TL-020 — The bottom rail opens on the tab that was tapped

> **Superseded** by #95 (`fac9214a`). `MobileBottomSurface` is deleted; the
> bottom surface is `EditorRail`, one surface at three detents
> (`EditorRail.tsx`, `detents.ts`). The requirement below describes the code at
> `a5c2f26f`.

<!-- cite-check: pinned a5c2f26f -->

**When** a chip in the collapsed pill bar is tapped, the mobile bottom surface
shall expand the sheet **and** select that chip's tab (`variations`, `shape` or
`colour`) in one action.

_(`MobileBottomSurface.tsx:11-14`, `:19-55`, passed on as `initialTab` at `:72`;
guarded by `TouchSurface.test.tsx:177-200`.)_

<!-- cite-check: live -->

### REQ-TL-021 — The sheet collapses from its handle

> **Superseded** by #95 (`fac9214a`), with REQ-TL-020. The requirement below
> describes the code at `a5c2f26f`.

<!-- cite-check: pinned a5c2f26f -->

**When** the drag-handle row of the expanded sheet is tapped, the bottom surface
shall collapse back to the pill bar, keeping the last selected tab for the next
expansion.

_(`MobileBottomSurface.tsx:60-66`; the tab signal at `:9` is not reset on
collapse.)_

<!-- cite-check: live -->

### REQ-TL-022 — The phone HUD carries five controls and reflects history state

> **Superseded** by #95 (`fac9214a`) and #96 (`68a4ef51`). The top bar holds
> Library, the title, Undo, Redo and More (`TouchHUD.tsx:82-180` (`topHud`)); there
> is no Snapshot, and More is the shared list from `buildMoreMenu`
> (`TouchHUD.tsx:47` (`buildMoreMenu`)). Undo and Redo are still disabled from
> `canUndo` / `canRedo` (`:130` (`canUndo`), `:147` (`canRedo`)). The requirement
> below describes the code at `a5c2f26f`.

<!-- cite-check: pinned a5c2f26f -->

**While** the phone HUD is mounted, it shall present a gallery button, the
truncated flame title, a horizontally scrollable rail of Undo / Redo / Snapshot,
and a More menu holding Mutate, Randomize, full Export and — only where an
`onOpenDrawer` handler was supplied — Advanced Tools. Undo and Redo shall be
`disabled` whenever the corresponding `canUndo` / `canRedo` accessor reports
false.

_(`TouchHUD.tsx:64-236`; disabled state at `:121` and `:135`; the conditional
drawer item at `:219-232`. Guarded in part by `TouchSurface.test.tsx:12-65`,
which does not exercise the disabled state.)_

<!-- cite-check: live -->

### REQ-TL-023 — Touch chrome falls back to the command registry

**If** a touch component is mounted without an explicit handler prop, **then**
the corresponding button shall dispatch the equivalent registry command
(`history.undo`, `history.redo`, `flame.mutate`, `flame.randomize`) through
`executeCommand`, so the surface is usable standalone and every action stays a
single auditable command. The More items are the shared list from
`buildMoreMenu` (#96), and the save button needs its `onSnapshot` handler: the
`flame.quickExport` fallback it once had named a command nobody registered.

_(`TouchHUD.tsx:134-137` (`onUndo`), `:151-154` (`onRedo`);
`TabletInspectorDeck.tsx:163-165` (`onUndo`), `:179-181` (`onRedo`);
`TouchControlSurface.tsx:584-585` (`onMutate`), `:597-598` (`onRandomize`).)_

### REQ-TL-024 — Popovers dismiss on an outside tap

**When** the HUD title tooltip or the More menu is open, a full-viewport
backdrop shall be rendered beneath it, and tapping that backdrop shall close the
popover — a touch layout has no hover-out to rely on.

_(`TouchHUD.tsx:72-78` (`popoverBackdrop`); `TouchSurface.module.css:146-152` (`.popoverBackdrop`) fixes the
backdrop at `z-index: 41`, below the popovers' 60 and above the rail's 40.)_

### REQ-TL-025 — The control surface owns its tab, and honours a new `initialTab`

The shared touch control surface shall keep its own active tab, initialised from
`initialTab` (defaulting to `variations`), and **when** `initialTab` changes to a
defined value it shall adopt that tab. **Where** a `tab` accessor is passed (the
editor rail passes one), that accessor owns the tab instead.

_(`TouchControlSurface.tsx:70-77` (`TouchTab`), `:79-82` (`controlled`); guarded by `TouchSurface.test.tsx:265-295` "renders transform pills, tabs, and switches views"
for the tab switch, though not for the `initialTab` effect.)_

### REQ-TL-026 — Variation previews render only near the viewport

**While** the Variations tab is showing, each gallery tile shall mount its
`VariationPreview` only once a shared `IntersectionObserver` with a 200 px
`rootMargin` reports it near the viewport, and all previews shall render inside a
`ComputeGate` capped at `COMPUTE_GATE_CAPACITY` — so a 36-tile carousel on a
phone never asks the GPU for 36 simultaneous renders.

_(`TouchControlSurface.tsx:93-99` (`HTMLDivElement`), `:139-145` (`galleryVariationTypes`), `:324-373` (`ComputeGate`).)_

### REQ-TL-027 — Tapping a tile adds; tapping an active tile does nothing

**When** a gallery tile whose variation is not present on the current transform
is tapped, the surface shall dispatch `flame.addVariation` for that transform;
**if** the variation is already active, **then** the tap shall be a no-op rather
than adding a duplicate.

_(`TouchControlSurface.tsx:132-137` (`isVariationActive`), `:343-351` (`active`).)_

### REQ-TL-028 — The transform strip cannot delete the last transform

The transform strip shall list every transform as a `T<n>` pill with the active
one marked `aria-pressed`, shall always offer Add Transform, and shall offer
Delete Transform **only where** more than one transform exists.

_(`TouchControlSurface.tsx:155-200` (`transformNav`); the delete button is wrapped in
`<Show when={transformIds().length > 1}>` at `:186`.)_

### REQ-TL-029 — The weight slider writes through a command

**When** a variation's weight slider is dragged, the surface shall dispatch
`flame.setVariationWeight` with the transform id, variation id and the numeric
value, over the range −1 … 2 in steps of 0.02.

_(`TouchControlSurface.tsx:260-276` (`input`); guarded by `TouchSurface.test.tsx:297-315` "dispatches flame.setVariationWeight when variation slider changes",
which asserts the resulting descriptor value.)_

### REQ-TL-030 — Shape edits all route through one affine command

**When** the affine grid is dragged, a scrub field is changed, or Reset Shape is
tapped, the surface shall dispatch `flame.setTransformAffine` for the current
transform with slot `'pre'` and origin `'grid'` — the scrub path recomposing the
full affine from the decomposed controls so an edit to one control cannot drop
the others.

_(`TouchControlSurface.tsx:437-503` (`shape`); recomposition at `:469-479` (`nextControls`).)_

### REQ-TL-031 — The colour tab offers a fixed hue-spread palette strip

The Colour tab shall present exactly 14 palette swatches, chosen at module load
by bucketing the chromatic default palettes into 14 hue buckets and taking the
first palette in each — falling back to the remaining chromatic palettes if
fewer than 14 buckets are occupied — plus sliders for the transform's colour
coordinate and colour speed.

_(`TouchControlSurface.tsx:43-61` (`TOUCH_PALETTES`), `:506-568` (`colour`).)_

### REQ-TL-032 — Wheel scrolls the rails horizontally

**When** a wheel event reaches a horizontal rail (the view-controls strip or the
variation carousel), the helper shall add the dominant axis delta to
`scrollLeft` and call `preventDefault()`, so a vertical trackpad or mouse wheel
pans the strip instead of scrolling the page.

_(`createHorizontalScrollDrag.ts:38-46` (`handleWheel`), wired at `ViewControls.tsx:79` (`createHorizontalScrollDrag`) and
`TouchControlSurface.tsx:97-99` (`createHorizontalScrollDrag`); guarded by
`createHorizontalScrollDrag.test.ts:6-32` "translates vertical wheel scrolling to horizontal scrollLeft".)_

### REQ-TL-033 — Touch pointers are left to the browser

**If** a `pointerdown` reports `pointerType === 'touch'`, **then** the drag
helper shall return immediately, leaving native touch scrolling and its momentum
intact — the helper exists for mice, not fingers.

_(`createHorizontalScrollDrag.ts:57` (`pointerType`); guarded by
`createHorizontalScrollDrag.test.ts:111-137` "ignores touch pointers to preserve native mobile gesture handling".)_

### REQ-TL-034 — A drag never fires the tile underneath it

**When** a primary-button pointer moves more than 4 px from its press point, the
helper shall enter drag mode, capture the pointer, pan the rail, and swallow the
subsequent `click` in the capture phase for a further 60 ms — so dragging past a
variation tile does not add that variation. A press that never exceeds the
threshold shall let its click through untouched.

_(`createHorizontalScrollDrag.ts:70-118` (`handlePointerMove`); guarded by
`createHorizontalScrollDrag.test.ts:34-110` "translates mouse drag to horizontal scrollLeft and suppresses click".)_

### REQ-TL-035 — Inputs inside a rail keep their own gestures

**If** a wheel or pointer press lands on an `input`, `select`, `textarea`,
`contenteditable` element, or anything inside `[data-step]` /
`[data-prevent-horizontal-scroll]`, **then** the helper shall not intercept it —
so a range slider inside the rail still drags as a slider.

_(`createHorizontalScrollDrag.ts:24-35` (`isOverInteractiveInput`), checked at `:39` (`isOverInteractiveInput`) and `:61` (`isOverInteractiveInput`); guarded by
`createHorizontalScrollDrag.test.ts:138-192` "bypasses wheel scrolling and drag when event occurs over interactive input".)_

### REQ-TL-036 — The drag helper leaves nothing behind

**When** the owning component is disposed, the helper shall remove all six
listeners it added (`wheel`, `pointerdown`, `pointermove`, `pointerup`,
`pointercancel`, and the capture-phase `click`) and strip the dragging class
from the element.

_(`createHorizontalScrollDrag.ts:120-137` (`passive`).)_

### REQ-TL-037 — Escape closes the tools drawer, and only while it is open

**While** the Advanced Tools drawer is open, a window-level `keydown` listener
shall close it on `Escape`; that listener shall be registered only while the
drawer is open and removed as soon as it closes or the component is disposed.

_(`AdvancedToolsDrawer.tsx:21-32` (`createEffect`) — the effect returns early on `!props.open`,
so `onCleanup` runs the removal on the transition to closed. Guarded by
`TouchSurface.test.tsx:243-255` "closes on Escape key press when open".)_

### REQ-TL-038 — Desktop-only tools switch the layout before they open

**When** the drawer's Breeding, Audio Reactive, Sonification or Timeline card is
tapped **while** `isTouchLayout()` holds, the workspace shall first set the
preference to `'desktop'` and raise a timed toast naming the reason, then open
the requested tool — because none of those panels have a touch layout.

> **Known deviation:** `packages/app/src/components/TouchSurface/AdvancedToolsDrawer.tsx:33-122` (`tools`)
> — the drawer's `tools()` list contains gallery, switch-desktop, art-director,
> arena-clash, genetics-breeding, audio-reactive, timeline-animation and
> high-res-export. There is **no Sonification card**, and the `onSonification?`
> prop declared at `:12` (`onSonification`) has zero call sites even though `MainWorkspace.tsx:4046-4054` (`onSonification`)
> passes a complete handler. The Sonification half of this requirement therefore
> describes a path a user cannot take today. Tracked in `docs/agent/BUGS.md`.

_(`MainWorkspace.tsx:4028-4063` (`onBreed`); the "Switch to Desktop Layout" card itself at
`:4019-4025` (`onSwitchToDesktop`). `TouchSurface.test.tsx:205-241` "renders cards and dispatches actions when open" asserts only that the callbacks
fire — the preference write and toast live in `MainWorkspace`, which has no test.)_

### REQ-TL-039 — The app menu switches layouts in both directions

**Where** the app menu is shown, its first entry shall write the opposite
preference to the current layout — "Switch to Touch Studio" writing `'touch'`
from the desktop pill, "Switch to Desktop Layout" writing `'desktop'` from the
touch hamburger — and shall close the menu in the same click.

_(`SoftwareVersion.tsx:53-75` (`renderMenuItems`), `:194-259` (`isTouch`); the writer prefers the injected
`setTouchLayoutPreference` prop and falls back to the module setter at `:32-38` (`setTouchPref`).
Guarded by `SoftwareVersion.test.tsx:53-58` (`fireEvent`) and `:92-95` (`Desktop`).)_

---

## Coverage gaps

No assertion anywhere goes red if these are violated. They are listed so the
gap is a work item rather than a silent claim of coverage.

**No test at all** (the file under test has no test file, and no e2e spec drives
the workspace at a phone or tablet viewport):

REQ-TL-004, REQ-TL-010, REQ-TL-011, REQ-TL-012, REQ-TL-013, REQ-TL-014,
REQ-TL-015, REQ-TL-018, REQ-TL-019, REQ-TL-023, REQ-TL-024, REQ-TL-026,
REQ-TL-027, REQ-TL-030, REQ-TL-031, REQ-TL-036, REQ-TL-038.

The superseded requirements (REQ-TL-002, 003, 006, 007, 016, 017, 020, 021 and 022) are left out. REQ-TL-009 is covered since #90:
`workspaceLayoutStore.test.ts:253` "creates its module-level memos inside a root, so Solid does not warn".

**Partially covered** — a test names the surface but no assertion covers the
requirement's substance:

- **REQ-TL-001** — `workspaceLayoutStore.test.ts:101-107` "keeps the width rules for a fine pointer"
  asserts the 1024 / 1025 edge but not the 679 / 680 one.
- **REQ-TL-025** — the tab switch is covered; the `initialTab` `createEffect`
  (`TouchControlSurface.tsx:73-77`) is not.
- **REQ-TL-028** — the `T1` pill is asserted; Add Transform and the
  single-transform delete guard are not.

**Highest-value additions**, in order: a Playwright spec that loads the
workspace at 390 / 720 / 1200 px and asserts which chrome mounts (would guard
REQ-TL-011 … REQ-TL-015, and catch a grid regression like the fixed
REQ-TL-016 deviation, which no unit test can see); a `classifyLayout` case at
679 and 680 px (REQ-TL-001); and a disposal test for
`createHorizontalScrollDrag` (REQ-TL-036).
