# Tablet UX Plan (768–1024px+)

## Problem

Tablets (iPad, Android tablets, Surface) sit between phones and desktops. Screen widths of 768–1024px can *almost* fit the current 26rem sidebar + canvas layout, but with uncomfortable proportions:

- At 768px: sidebar (416px) leaves only 352px for the canvas — a 54/46 split that's too narrow for the flame.
- At 1024px: sidebar (416px) leaves 608px — workable but the sidebar dominates.
- The timeline (min 120px, default 220px) consumes significant vertical space.
- Landscape vs. portrait orientation produces radically different experiences.
- iPad multitasking (Split View, Slide Over) can reduce the app to ~375px (phone-width).

There are no tablet-specific interactions (pencil hover, keyboard shortcuts with hardware keyboard, multi-window).

## Goals

1. **Adaptive split** — Sidebar width scales with viewport. Canvas always gets ≥55% of width.
2. **Orientation-aware** — Portrait stacks differently from landscape.
3. **Pencil support** — Apple Pencil / stylus for precise affine control and canvas navigation.
4. **Keyboard parity** — Hardware keyboard shortcuts work identically to desktop.
5. **Split View compatible** — App degrades gracefully to mobile layout when windowed.

---

## Phase 1: Responsive Sidebar

### 1.1 Fluid sidebar width

Replace the fixed 26rem sidebar with a responsive range:

```css
.sidebar {
  /* Desktop: 26rem (416px) */
  width: 26rem;

  /* Tablet landscape (900-1200px): proportional */
  @media (max-width: 1200px) and (min-width: 769px) {
    width: min(35vw, 26rem);
  }

  /* Tablet portrait (481-768px): narrower, collapsible */
  @media (max-width: 768px) {
    width: 100%;
    position: fixed;
    /* slide-out behavior (shared with mobile plan) */
  }
}
```

This ensures:
- At 1024px: sidebar is min(358px, 416px) = 358px, leaving 666px (65%) for canvas.
- At 900px: sidebar is min(315px, 416px) = 315px, leaving 585px (65%) for canvas.
- At 768px portrait: sidebar becomes overlay (slide-out drawer).

### 1.2 Collapsible sidebar toggle

Add a sidebar collapse button (chevron icon) in the top-left of the canvas area. When collapsed:
- Sidebar shrinks to a 48px icon strip showing: transforms list, color, palette, settings, actions.
- Tapping an icon expands the sidebar to show that section, then auto-collapses after selection.
- The sidebar state persists in localStorage.

### 1.3 Sidebar sections as tabs

On tablet portrait (≤768px), the sidebar content is too tall to fit viewport height. Break the sidebar into tabs:

| Tab | Content |
|-----|---------|
| Transforms | AffineEditor + variation grids + per-transform params |
| Color | FlameColorEditor + PaletteSelector |
| Settings | Exposure, Skip Iters, Draw Mode, Quality, Vibrancy, etc. |
| Actions | Load, Save, Render, Share |

Each tab is independently scrollable. Tab bar is fixed at the top of the sidebar.

---

## Phase 2: Canvas & Interaction

### 2.1 Pinch-to-zoom + two-finger pan

Same as mobile plan — essential for tablet too. Tablets are primarily touch devices.

### 2.2 Pencil/Stylus support

- **Apple Pencil hover** (iPadOS): Show a cursor dot when pencil is detected near the canvas. Useful for precise camera positioning.
- **Pressure sensitivity**: Map pencil pressure to camera zoom speed or affine parameter scrubbing.
- **Double-tap on pencil**: Toggle between pan mode and parameter pick mode (future: tap a point on the flame to see which transform dominates).

### 2.3 Hardware keyboard shortcuts

When a hardware keyboard is connected (iPad Magic Keyboard, tablet keyboard cover):

| Key | Action |
|-----|--------|
| Space | Play/Pause animation |
| F | Toggle sidebar |
| T | Toggle timeline |
| Ctrl+Z / Cmd+Z | Undo |
| Ctrl+Shift+Z / Cmd+Shift+Z | Redo |
| 1-9 | Select transform by index |
| 0 | Reset camera |
| ← → | Previous/next frame (when paused) |
| Ctrl+S / Cmd+S | Save for Later |
| Ctrl+E / Cmd+E | Quick Export |

Add a keyboard shortcut help overlay (hold Cmd for 2 seconds to show).

---

## Phase 3: Timeline & DopeSheet

### 3.1 Adaptive timeline height

- Tablet landscape: timeline default 200px, min 120px, max 40vh.
- Tablet portrait: timeline default 160px, min 100px, max 35vh.
- The resize handle should be larger (12px) for finger dragging.

### 3.2 DopeSheet touch improvements

The DopeSheet already has pinch-to-zoom. Add:
- **Two-finger scroll**: Vertical scroll for track lanes, horizontal scroll for time.
- **Long-press on keyframe diamond**: Show context menu (delete, copy, ease type).
- **Double-tap on lane**: Add keyframe at that position.
- **Drag keyframe**: Larger hit area (32px) for diamond dragging.

### 3.3 Transport controls

Make transport buttons larger on tablet: 48×48px for play/pause, 40×40px for prev/next. Position them in a floating bar that can be moved by the user (drag handle on left edge).

---

## Phase 4: Split View & Multi-Window

### 4.1 iPad Split View support

When the app is in Split View (width can be ~375px, ~500px, or ~640px):

- At ≤480px: Use full mobile layout (single column, overlay sidebar).
- At 481–640px: Use tablet portrait layout (narrow sidebar, tabs).
- The app must respond to `resize` events and re-evaluate layout.

### 4.2 Slide Over

When in Slide Over (~375px wide floating window): Use full mobile layout.

### 4.3 Stage Manager / multi-window

For iPadOS Stage Manager (resizable windows):
- Support arbitrary window widths by using the fluid sidebar rules from Phase 1.
- No minimum width constraint beyond what's practical (~320px).

---

## Phase 5: Dialog & Modal Adaptation

### 5.1 Dialogs as centered sheets

On tablet, dialogs should be centered sheets (not fullscreen like mobile):

- **LoadFlameModal**: 80vw max-width, 85vh max-height. 3-column grid for examples gallery. Larger thumbnails.
- **ExportPngDialog**: 64rem max-width, 85vh max-height. Two-column layout preserved (preview left, controls right). Larger touch targets for sliders.
- **VariationSelector**: 90vw max-width. Two-column layout with scrollable gallery.
- **SpotlightTour**: Tour tooltips must detect viewport edges and reposition automatically (check `window.innerWidth`).

### 5.2 Sheet dismiss

- Swipe down on the sheet handle bar to dismiss.
- Tap backdrop (semi-transparent overlay) to dismiss.
- Hardware Esc key to dismiss.

---

## Phase 6: Visual Polish

### 6.1 Orientation transitions

Animate layout changes when rotating between landscape and portrait:
```css
.layout {
  transition: grid-template-columns 200ms ease;
}
```

### 6.2 Sidebar expand/collapse animation

Smooth slide animation (200ms ease) when collapsing/expanding the sidebar.

### 6.3 Dark mode optimization

Tablets are often used in varied lighting. Ensure the dark theme has sufficient contrast for outdoor use. Consider adding:
- High-contrast mode toggle (accessible from sidebar settings tab).
- Auto-brightness adaptation using `prefers-color-scheme` and ambient light API.

---

## Implementation Order

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Fluid sidebar width + collapsible toggle | Medium | Core tablet layout |
| 2 | Sidebar tabbed sections (portrait) | Medium | Makes portrait usable |
| 3 | Pinch-to-zoom + touch canvas gestures | Medium | Shared with mobile plan |
| 4 | Timeline height adaptation + larger resize handle | Small | Timeline usability |
| 5 | DopeSheet touch improvements | Medium | Keyframe editing |
| 6 | Hardware keyboard shortcut pass | Small | Keyboard users |
| 7 | Dialog/Modal centered-sheet adaptation | Medium | Feature accessibility |
| 8 | Split View / multi-window support | Medium | iPad multitasking |
| 9 | Pencil hover + pressure support | Medium | Stylus users |
| 10 | Orientation transitions + animation polish | Small | Visual quality |

---

## Tablet vs. Desktop vs. Mobile

| Feature | Desktop (1200+) | Tablet (768–1199) | Mobile (≤767) |
|---------|-----------------|-------------------|---------------|
| Sidebar | Fixed 26rem, always visible | Fluid width, collapsible | Slide-out overlay |
| Canvas | Full interaction | Full + pencil | Touch-only |
| Timeline | 220px default | 160–200px adaptive | 120px strip |
| Dialogs | Centered modals | Centered sheets | Fullscreen sheets |
| Controls | Sidebar + ViewControls | Sidebar tabs + floating bar | Floating buttons |
| Keyboard | Full shortcuts | Full (when connected) | None |
| Split View | N/A | Supported | N/A |

## Design Principles

- **Canvas priority** — Like mobile, but with space for visible sidebar. The flame comes first.
- **Orientation matters** — Portrait = mobile-like (stacked, overlay sidebar). Landscape = desktop-like (side-by-side, proportional split).
- **Touch + precision** — Tablets support both imprecise finger taps and precise pencil input. UI elements should work with both.
- **Seamless transitions** — Users rotate and resize constantly. No layout glitches, no lost state, no scroll position resets.
- **Keyboard as first-class** — If a keyboard is connected, treat it like a desktop. All shortcuts must work.
