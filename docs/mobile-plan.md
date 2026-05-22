# Mobile UX Plan (Phone: 320–480px)

## Problem

The current layout uses a fixed 2-column CSS grid with a 26rem (~416px) sidebar. On phone screens (typically 375–414px wide), the sidebar alone exceeds the viewport width, making the canvas invisible and the app unusable.

```css
/* Current — no responsive breakpoint */
.layout {
  grid-template-columns: auto 1fr;  /* sidebar 26rem + canvas */
}
```

There is no hamburger menu, no responsive auto-hide, and no mobile-specific interaction model. The timeline components have 480px/768px breakpoints for compact sizing, but the main layout, sidebar, canvas, and dialogs are completely unresponsive.

## Goals

1. **Canvas-first** — The IFS flame canvas must fill the screen. Sidebar and controls are overlays.
2. **Touch-native** — All interactive elements must be 44px+ touch targets. Gestures for canvas navigation.
3. **No information loss** — Every desktop feature must remain accessible, just reorganized.
4. **Single-hand usable** — Critical actions (play/pause, next animation, zoom) reachable with thumb.

---

## Phase 1: Layout Switch

### 1.1 Single-column layout at ≤480px

Replace the 2-column grid with a single fullscreen stack:

```css
@media (max-width: 480px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    grid-template-areas: 'viewport';
  }

  .sidebar {
    position: fixed;
    inset: 0;
    z-index: 100;
    width: 100%;
    transform: translateX(100%); /* off-screen by default */
    transition: transform 200ms ease;
  }

  .sidebar.open {
    transform: translateX(0);
  }
}
```

### 1.2 Sidebar becomes a slide-out drawer

- Swipe-right from the left edge (or tap hamburger button) opens the sidebar as a fullscreen overlay.
- Swipe-left or tap backdrop closes it.
- The sidebar scrolls its full content vertically — all editors and sliders remain available.
- A close button (×) pinned to the top-right corner.

### 1.3 Bottom bar becomes an overlay toolbar

- ViewControls and Timeline stack in a `position: fixed; bottom: 0` bar.
- Collapsed state: shows only transport controls (play/pause, prev/next animation) and a hamburger + timeline toggle. Height ~48px.
- Expanded state: shows full ViewControls + Timeline. Height up to 55vh, swipe-down to collapse.
- A drag handle at the top of the bottom bar for expand/collapse.

---

## Phase 2: Canvas Touch Interaction

### 2.1 Pinch-to-zoom on the flame canvas

Currently the canvas only handles mouse wheel zoom via WheelZoomCamera2D. Add:

```ts
// Pinch gesture → camera zoom in/out
// Two-finger pan → camera position
// Single tap → no-op (reserved for future point selection)
// Double tap → reset camera (zoom=1, position=0,0)
```

Use the existing `touch-action: none` on the canvas to capture all gestures. Implement in `WheelZoomCamera2D` or a new `TouchZoomCamera2D` wrapper.

### 2.2 One-finger drag = camera pan

On desktop, left-click drag pans the camera. On mobile, single-finger drag should do the same (currently it may trigger scroll or text selection).

### 2.3 Prevent accidental zoom/scroll

Meta viewport tag should include `user-scalable=no` only while interacting with the canvas. The sidebar and other scrollable areas should remain scrollable.

---

## Phase 3: Mobile-Optimized Controls

### 3.1 Floating action buttons

Place critical actions in a floating button cluster (bottom-right, reachable by thumb):

| Button | Icon | Action |
|--------|------|--------|
| ▶/⏸ | Play/Pause | Toggle animation |
| ⏭ | Skip forward | Next animation example |
| 🔍 | Magnifier | Reset camera zoom |
| ☰ | Hamburger | Toggle sidebar drawer |

Use a semi-transparent backdrop so buttons don't obscure the flame.

### 3.2 Timeline as a swipeable strip

- Show a condensed timeline strip at the bottom (height ~64px).
- Drag left/right to scrub — no need for precise clicking.
- Tap to toggle play/pause at that position.
- Expand to full timeline by swiping up on the strip or tapping the timeline toggle.

### 3.3 Auto-enable compact mode

The CompactModeContext should automatically activate at ≤480px. All sidebar editors (sliders, affine controls, color pickers) render in compact layout without requiring manual toggle.

---

## Phase 4: Dialog & Modal Adaptation

### 4.1 Dialogs become fullscreen sheets

All modals (Load Flame, Export PNG, Share Link, Variation Selector, Help, Spotlight Tour) should render as fullscreen bottom sheets or fullscreen pages on mobile:

- **LoadFlameModal**: Fullscreen gallery, 2-column grid becomes single-column scrollable list. Thumbnail size reduced.
- **ExportPngDialog**: Stack controls vertically (preview on top, settings below in scrollable area). 48rem width → 100% width.
- **ShareLinkModal**: Full-width, vertical stack.
- **VariationSelector**: Preview flame reduced height, gallery scrolls horizontally, params stack below.
- **SpotlightTour**: Skip or reposition step tooltips to avoid being cut off.

### 4.2 Modal open/close gestures

- Swipe down to dismiss (standard iOS/Android sheet pattern).
- Pull-bar indicator at top of each modal sheet.

---

## Phase 5: Touch Target Sizing

### 5.1 Minimum 44×44px tap targets

Per Apple HIG and Material Design guidelines:

| Component | Current | Mobile target |
|-----------|---------|---------------|
| Slider thumb | ~16px | 44px (increase thumb + invisible hit area) |
| ScrubInput buttons | ~24px | 44px (wider, taller) |
| Color picker swatches | varies | 44×44px each |
| Checkbox | ~16px | 44×44px (invisible padding) |
| Affine coef fields | ~32px | 44px height |
| Transport buttons | 32-36px | 44px (already close at 768px breakpoint) |
| Sidebar toggle (F key) | n/a | Add 44×44px hamburger button |

### 5.2 Spacing

Increase vertical spacing between sidebar controls to prevent mis-taps. Use `--space-3` or `--space-4` instead of `--space-h`/`--space-1` for control groups.

---

## Phase 6: PWA & Offline Support

### 6.1 Web App Manifest

Add `manifest.json` with:
- `display: standalone` — removes browser chrome
- `orientation: any` — allows landscape and portrait
- Theme color matching the dark theme background
- App icons at 192px and 512px

### 6.2 Service Worker

Not required for initial mobile release, but plan for caching the app shell and assets. The flame rendering is client-side WebGPU with no server dependency beyond initial load.

---

## Implementation Order

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Single-column layout + sidebar drawer | Medium | Unlocks all mobile usage |
| 2 | Bottom bar overlay with collapse/expand | Medium | Makes transport accessible |
| 3 | Pinch-to-zoom + touch canvas gestures | Medium | Core flame interaction |
| 4 | Floating action buttons | Small | Quick access to key actions |
| 5 | Auto-enable compact mode at breakpoint | Small | Reduces sidebar clutter |
| 6 | Modal fullscreen sheet adaptation | Large | Makes all features accessible |
| 7 | 44px touch target pass | Small | Usability polish |
| 8 | PWA manifest | Small | Install-to-homescreen |
| 9 | Swipeable timeline strip | Medium | Timeline scrubbing on mobile |

---

## Design Principles

- **Canvas is king** — The flame fractal is the product. UI chrome must be minimal and hideable.
- **Thumb zone** — Primary actions in the bottom-right quadrant. Secondary actions in the top-left hamburger menu.
- **Progressive disclosure** — Show only essential controls by default. Advanced settings behind expand/tap.
- **No pinch conflicts** — Canvas pinch-to-zoom vs browser zoom must be carefully managed.
