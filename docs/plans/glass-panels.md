# Glass panels across the app

Status: decided 2026-09-23 (section 2) and widened 2026-09-24 (decision (d)). Phases 0 to 2
and 4 are built on `feat/glass-panels`, with the desktop sidebar, and the Glass panels setting
is on by default. Phase 3, the dialogs, waits on a decision (section 4). Drafted from a survey of every panel, menu, dialog and overlay in
`packages/app/src`. Its line references are pinned to `9fc08078`, the fork main that phase 0
started from, where every cited file is as the survey read it; the phases have moved them
since. Paths below are relative to `packages/app/src`.

<!-- cite-check: pinned 9fc08078 -->

Goal: give the other panels, tablet and phone first, the semi-transparent glossy look of the
explorer's side panel, without losing legibility over bright flames or frame rate on phones.

## The short version

- The look is already a token set, `--la-glass` and its variants in
  `styles/designSystem/lumen.css:63-72`. Only
  5 files use it. 35 other files hand-roll 59 blur rules of their own (7 copied recipe families,
  44 of them missing the `-webkit-` twin), so step one is one shared primitive, not new CSS.
- The design rule written next to those tokens says the opposite of this request: "ONE glass
  layer, and only where chrome overlaps the artwork ... never glass on glass, never glass on a
  card", and `docs/plans/mobile-native/DESIGN.md:120-121` makes the tablet deck opaque on purpose.
  Decision (a) below changes that rule.
- On a phone most chrome is glass already: the HUD pill, the shell bar, the More menu, the
  rail sheet at peek. On a tablet the two big panels, the inspector deck and the nav rail, are
  grid columns beside the canvas, so there is no art behind them to show through. To look like
  the explorer's panel, the deck has to float over the canvas.
- The explorer's own panel fails contrast over bright art: on its 72% fill over white, ink-2
  text is 3.99:1 and ink-3 is 2.70:1 (the floor is 4.5:1). Decision (c).
- Glass has been cut back five times for cost (`f2eb5426`, `360f044f`, `1f1c9783`, `51367f0d`,
  `790ab47f`). Every rule in section 5 comes from one of those.

## 1. The reference: the explorer's glass

`pages/FractalExplorer/FractalExplorerPage.module.css:102-108`, used by the pane labels, icon
buttons, title block, readouts and the panel:

```css
.glass {
  background: var(--la-glass); /* --la-ground #0d1117 at 72% */
  backdrop-filter: var(--la-glass-blur); /* blur(20px) saturate(1.4) */
  -webkit-backdrop-filter: var(--la-glass-blur);
  border: var(--la-glass-edge); /* 1px, white at 10% */
  box-shadow: var(--la-glass-shadow); /* 0 10px 30px black at 45% */
}
```

There is no inner highlight or sheen: the gloss is the blur, the saturation boost, the thin
light edge and the drop shadow. Controls inside the panel are opaque token surfaces
(`--la-surface-2` inputs and segments, hairline separators), which is why it stays readable.
Reduce Transparency and More Contrast swap the tokens to solid (`lumen.css:301-336`), and that
only reaches surfaces that use the tokens.

## 2. Decisions (taken 2026-09-23)

The recommended option of each was chosen.

**(a) Where real glass goes.**

1. Chrome only, today's rule: real blur on small floating chrome; panels beside the canvas stay
   opaque. Least risk, but the tablet deck will never look like the explorer's panel.
2. **Chosen, staged.** Also float the large touch panels over the canvas as real glass,
   with a text-safe fill and a "solid while busy" switch (section 5). Phone surfaces first
   (phase 1). The tablet deck ships behind a setting until device numbers say it holds its
   frame rate (phase 2). The same setting gates the other change that adds blur area over
   a repainting canvas, the rail sheet past peek, since that reverses a deliberate cut
   (`360f044f`). Everything else ships on: it either removes blur or keeps the cost it has.
3. Glass everywhere, dialogs and the desktop sidebar included. Not recommended: light-theme
   contrast, blur cost over live canvases, and it undoes the five earlier cuts.

**(b) Light theme.** The glass tokens are dark-only. Chosen: glass stays dark in both web
themes, as the touch chrome, Home and the explorer already are. Light glass tokens only if
desktop panels are ever in scope. A surface that also shows on the desktop, such as the toast,
keeps its light-theme look there.

**(c) Text on glass.** WCAG contrast of each text token on a glass fill over a white-hot
backdrop:

| Fill over white                        | ink   | ink-2 | ink-3 | accent |
| -------------------------------------- | ----- | ----- | ----- | ------ |
| 72% (`--la-glass`, the explorer today) | 6.89  | 3.99  | 2.70  | 2.86   |
| 76%                                    | 8.00  | 4.64  | 3.13  | 3.32   |
| 80%                                    | 9.30  | 5.39  | 3.64  | 3.85   |
| 86% (`--la-glass-strong`)              | 11.55 | 6.69  | 4.52  | 4.79   |

Minimum fill for 4.5:1: ink 61%, ink-2 76%, accent 85%, ink-3 86% (exactly 60.3, 75.3, 84.3
and 85.9). Options for panels that carry text:

1. Keep 72%. It fails over bright art.
2. **Chosen.** A new `--la-glass-panel` at 80%, and inside glass the lowest text tier is
   ink-2 (captions move up from ink-3). This stays closest to today's look. Accent stays
   out of text on glass, since it needs 85%; use it for fills and edges there.
3. 86% everywhere. Every tier passes, but the panel is visibly less see-through.

This also applies to the explorer (single mode, and the phone bottom sheet; in the split view
the panel sits over the void, which is fine): its panel moves to `--la-glass-panel`, and its
pills, whose text is ink-2 on the 72% fill, move their text to ink.

Three rules came out of building it:

- Inside `.panel`, `--la-ink-3` resolves to `--la-ink-2`, so a shared component that writes
  ink-3 keeps to the panel's floor without knowing it sits on glass.
- Text on a control's hairline wash inside glass takes ink: the wash drops ink-2 to 4.30:1.
- A coloured label on glass takes ink and keeps its colour in a fill or an edge, as the
  explorer's pressed icon button does (an accent edge around an ink glyph).

**(d) On by default, and past the touch layouts (2026-09-24).** Having tried the touch
layouts, maff asked for Glass panels to be on by default, with its toggle kept for whoever
would rather have the frame rate, and for the same glass on the desktop sidebar and the other
panels, set in one place rather than copied per surface. This replaces the staging in (a): the
setting no longer waits for the device numbers, which now decide whether it stays on. The
light theme keeps its look, per (b): the gate in section 3 leaves it out.

## 3. The shared primitive (phase 0 builds it)

`styles/designSystem/glass.module.css`, composed by every glass surface
(`composes: panel from '@/styles/designSystem/glass.module.css'`):

| Class    | Fill                             | Blur | For                                                                                                |
| -------- | -------------------------------- | ---- | -------------------------------------------------------------------------------------------------- |
| `chrome` | `--la-glass` 72%                 | yes  | small floating chrome whose text is ink: pills, buttons, toasts                                    |
| `panel`  | `--la-glass-panel` 80% (per (c)) | yes  | panels and sheets that carry text                                                                  |
| `flat`   | `--la-glass`                     | no   | the "cheap glass" already used by the rail shutter and the deck's edge tab; nested or not over art |
| `solid`  | `--la-glass-solid` 96%           | no   | the busy and fallback state                                                                        |

Built into the primitive, so no surface can get them wrong:

- **Nested glass flattens itself.** `.chrome .chrome, .panel .chrome, ...` drop the blur. A
  nested blur samples only its parent's fill (the parent is a backdrop root), so this is pure
  saving with no visual change. It removes today's explorer stepper buttons, the HUD tooltip and
  the SoftwareVersion menu items as costs.
- **Both properties are always written, `-webkit-` first.** The build's minifier keeps only the
  later of the two spellings in a rule (`build.target: 'esnext'` gives LightningCSS no browser
  targets). Phase 0 found 26 rules written standard first, the primitive's own among them, so
  production shipped them as `-webkit-backdrop-filter` alone: Chrome, Firefox and Android drew
  every glass surface without its blur, while dev showed it. With `-webkit-` first the build
  ships the standard spelling (85 declarations, none prefixed); only iOS below 18 goes without,
  and it has no WebGPU. The guard test requires the order. Keeping both spellings would take
  browser targets for the CSS build, which changes far more of the output than this.
- **`@supports not (...)`** falls back to `solid`.
- **The busy switch.** `:root[data-glass='busy'] .panel` goes `solid`. Sharp moving art behind
  text is worse than an opaque panel. This is the rail sheet's "solid past peek" rule
  (`TouchSurface/EditorRail.module.css:54-62`) generalised. The attribute is written in one place
  (`writeGlassBusy` in `lib/glass.ts`), from one signal (`hooks/useWorkspaceGlassBusy.ts`):
  playback, an export, audio modulation, or a gesture holding a history preview open (a slider,
  the camera, a colour or affine drag), meaning any state where the canvas presents every frame.
  The canvas converging after an edit is not busy. The attribute follows the state only once it
  has held for 150 ms (`GLASS_BUSY_SETTLE_MS`), in both directions, so a tap does not flash the
  panels solid.
- **The setting.** "Glass panels", on by default (decision (d)), stored as `chaos-glass-panels`
  only once someone changes it, so the default can still move (`glassPanels()` in
  `lib/glass.ts`). It writes `data-glass-panels='on'` on `<html>` before the first render. The
  toggle is in Settings on every layout: More, then "Settings and more", or the tablet's rail,
  on touch; the version menu's "Settings and More" on the desktop. Only the toggle reads the
  setting itself. Everything else asks `glassAllowed()`: the setting is on, and neither Reduce
  Transparency nor More Contrast is asked for. Under either, `lumen.css` turns every glass fill
  solid, so a panel floating over the canvas would hide the canvas it costs; the deck and the
  sidebar keep their places beside it instead. `data-glass-panels` is written from
  `glassAllowed()`, and follows the two media queries as they change. The toggle keeps showing
  the stored choice, and while either preference holds its hint says the panels stay solid
  because the system asks for it.
- **The gate.** `optionalPanel` is the one rule for a large panel that is glass only while
  the setting applies: `data-glass-panels='on'` on the root and a body that is not in the
  light theme. Outside the gate it sets nothing, so the surface keeps its own look. Inside, it
  sets the panel fill and blur, the ink-3 remap and the control fills, and the busy switch,
  the nested rule and the `@supports` fallback cover it as they cover `panel`. A surface opts
  in with one `composes:` line, so every optional panel changes in one place.
- **Controls on glass.** `solidControls` is the one set of opaque control fills on glass: it
  points `--la-control` and its two siblings at their `-on-glass` tokens in `lumen.css`. The
  floating deck and the rail's glass sheet compose it, and `optionalPanel` sets the same
  values. `styles/designSystem/glassGate.test.ts` holds the gate and the two sets equal.
- **Shared components on glass.** `onGlass` is the one set of hooks that the editor's shared
  components read for their glass look: ControlCard and CollapsibleCard (`--card-*`), Slider
  (`--slider-*`) and PaletteSelector (`--palette-*`). Each reads its hook with its opaque look as
  the fallback. The desktop sidebar composes `optionalPanel onGlass` and the explorer's panel
  `panel onGlass`, so a new surface that holds them takes the same look from one word.
  `glassHooks.test.ts` holds `onGlass` to exactly the hooks the four read, and
  `glassSurfaces.test.ts` fails when any other stylesheet sets one.
- **Not glass, beside it.** `frost` and `frostFade` are for a label or a small control laid over
  a thumbnail or a preview: a light blur of the picture under it and a Void fill, with no edge,
  no shadow and nothing that flattens it. `scrim` is the layer a blocking screen lays over the
  app. Built in phase 4.
- **Focus.** The four glass classes and `optionalPanel`'s glass give what is inside them a
  glass focus ring, `--focus-ring-glass` (`#a5b4fc`, `styles/index.css`). Glass is dark in both
  themes, and on chrome's 72% fill over white-hot art the theme's rings measured 1.71:1 (light)
  and 2.56:1 (dark), where a focus indicator needs 3:1. The glass ring measures 3.84 there and
  more on every other fill. A glass surface that keeps a light fill in the light theme (the
  desktop's toast, hover badge and version pill) sets the theme's ring back in the rule that
  sets that fill, and `glassSurfaces.test.ts` fails when one does not.
- **Reduce Transparency and More Contrast** come free through the tokens. Each replaces every
  see-through glass and frost token, the frost bar's fade among them, and `glassContrast.test.ts`
  fails when a new one is left out.
- **New tokens:** `--la-glass-panel`, and a smaller `--la-glass-blur-sm` for chips if device
  numbers ask for it. Phase 4 added `--la-frost`, `--la-frost-fade`, `--la-frost-blur` and
  `--la-scrim-blur`. No new literal radii or blur values anywhere else.

## 4. Surfaces, by phase

**Phase 0: groundwork, no visible change** (M)

- The primitive, the busy switch and the two CI guards (section 7).
- Move the 5 token users onto it: explorer, `Shell/MoreMenu`, `Shell/ShellBar`,
  `TouchSurface/TouchSurface`, `TouchSurface/EditorRail`. Also move the unused global `.la-glass`
  class (`lumen.css:269-275`), then delete it.
- Explorer follow-ups: its 640/641px breakpoint to the app's `PHONE_MAX_WIDTH` 680 (it
  contradicts `lumen.css:338-343`), and the fill and text tier per (c). Done; its HUD still
  overflows sideways at 390px, which phase 1 takes.

**Phase 1: phone and narrow tablet, the rail layout** (M). Built.

| Surface                                                      | Before                                                                                    | Built                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AdvancedToolsDrawer (`TouchSurface.module.css:613-643`)      | 96% fill under a 24px blur: looks solid and still costs                                   | `panel` plus the busy switch, with one hairline-strong edge. The backdrop is `--la-scrim-dim` with no blur of its own. Ships on.                                                                                                                        |
| MoreMenu under TouchHUD (`TouchHUD.tsx`, `.moreMenuWrapper`) | glass inside the blurred, transformed pill                                                | The HUD renders a plain fixed frame; the pill (`chrome`) and the menu are siblings in it, so the menu blurs the art itself. The menu sits about 6px further right, in line with the pill's edge.                                                        |
| HUD title tooltip (`TouchSurface.module.css:103-122`)        | glass on glass                                                                            | `flat`                                                                                                                                                                                                                                                  |
| Rail sheet past peek (`EditorRail.module.css:54-62`)         | solid for cost                                                                            | `panel` past peek with the setting on, so solid while busy; unchanged with it off                                                                                                                                                                       |
| Toast, hover badge, ProgressBar, ExportJobTracker            | two copied families: "oklch 240" and `rgba(15,15,17,.92)`                                 | Glass in the dark theme and on touch layouts; the desktop light theme keeps its look. The toast and the badge are `chrome`. ProgressBar and the tracker use `--la-glass-strong` (86%), since they carry three text tiers; their action labels take ink. |
| SpotlightTour (`SpotlightTour.tsx:411-479`)                  | card blurred over blurred scrims that animate their size, so the blur re-runs every frame | Scrims without blur. The glass sits on a layer behind the card's text and on its arrow, not on the card: a blurred card is a backdrop root, so its arrow could not frost the art. Glass in the dark theme and on touch layouts.                         |

Also in phase 1:

- The explorer's phone HUD wraps its readouts to a second row below 680px, so nothing overflows
  sideways at 390px.
- Slider and PaletteSelector take custom-property hooks whose fallbacks are today's values; the
  explorer's panel sets them, so their text reaches 4.5:1 on its glass.
- Android (section 6).
- **Framing above the rail's sheet** (2026-09-25).
  - **Before.** Opening the sheet slid the canvas up by half its covered height
    (`App.module.css`, `.canvas`). That uncovered a strip at the foot of the canvas box, and the
    strip showed through the glass sheet with no flame in it. At 390x844 on the large detent the
    canvas ended at y=521, while the sheet spans y=93 to 836.
  - **Now.** While the sheet is glass the canvas stays full-bleed, and the flame is framed above
    the sheet, as the deck and the sidebar frame it beside them. `Covered` gains `bottom`, the
    sheet's covered height (its detent height less the 96px it covers at peek too) as a share of
    the canvas height. The shift is b up, and the visible region is the height less b from the
    top. The canvas's slide writes 0 (`--rail-inset`), and the fill the canvas box painted for
    the strip is gone with the strip.
  - **Smooth.** The share follows the sheet's own transition, not its detent. A camera shift
    cannot be a CSS transition, so `lib/easing.ts` steps it a frame at a time along
    `cubic-bezier(0.16, 1, 0.3, 1)` over 280ms. That is `--la-ease` over `--la-dur-sheet`, the
    curve and length the sheet's height takes. `EditorRail.module.test.ts` holds the tokens, the
    sheet's transition and `SHEET_EASING` together. With reduced motion the share jumps, as the
    sheet does.
  - **Peek, and the setting off.** Peek covers nothing, so it frames exactly as before. Wherever
    `glassAllowed()` fails (the setting off, Reduce Transparency, Increase Contrast), the canvas
    slides as before and has no bottom cover. Measured at 390x844: the canvas sits at [-137, 707]
    on medium and [-323, 521] on large, as before. A switch while the sheet is open runs the
    slide and the shift along the same curve at once. They cancel out, so the flame stays put.
  - **Measured at 390x844 with the setting on.** The canvas spans [0, 844] on both detents.
    Medium covers 275px (b=0.3258) and the cut is 390x569. Large covers 647px (b=0.7666) and the
    cut is 390x197. Screenshots of the part above the sheet line up with the setting-off ones at
    a vertical offset of 0 px. The central four sixths of the width agree to a mean luminance
    difference of 0.8 to 3.2 of 255. The outer sixths differ only by the edge fade, which the
    canvas drops under glass (as under the open deck) and keeps when it slides.
  - **Captures.** The rule "every image is cut to the part on show" now reaches the sheet. The
    cut is the part the flame is framed in: the canvas less the sheet's cover above peek, from
    the top. Below the sheet's top edge it keeps 104px at 390x844, the sheet's height at peek
    (96px) and the 8px gap under it. Captures keep that band at peek too, and it keeps the flame
    centred in the image. The shutter's quick export is 390x569 on medium, whose sheet starts at
    y=465, and 390x197 on large, whose sheet starts at y=93. The setting-off shutter keeps the
    whole canvas, sheet or no sheet. The shift never reaches the document, its history, Recents,
    share links, thumbnails or the server renderer. An export that sizes the canvas itself gets
    no shift.
  - **Cost.** The canvas's size does not change: it slid before and stays put now, 390x844
    either way.

**Phase 2: tablet deck, an experiment behind a setting** (L). Built.

- **Before.** `TouchSurface/TabletInspectorDeck.tsx` (`TabletDeck.module.css:5-23`) is opaque
  `--la-surface` in its own grid column. Its header calls it "a page beside the canvas, not
  chrome over it".
- **Floating the deck, with the setting on.**
  - The deck keeps its grid cell and the canvas spans under it (`grid-column-end: inspector` on
    the `.tabletLayout` canvas, `App.module.css:1-35`). Collapsed, the column is empty and the
    canvas is exactly as wide as with the setting off.
  - The deck composes `panel`, with the busy switch. NavRail stays opaque.
  - The art glows through the deck, which is the whole look.
- **Framing.** A view-only shift in clip space of -f, where f is the share of the canvas width
  the deck covers (`lib/canvasFraming.ts`). In 2D it is added to the translation of
  `camera2DViewMatrix`, whose inverse carries it, so pan and zoom-about-the-pointer need nothing.
  In 3D it is an off-axis shift after the projection, so the vanishing point moves with the
  picture. The shift reaches the camera matrices and nothing else: never the document, its
  history, Recents, share links or the server renderer. Every image taken off the canvas is cut
  to the visible part (`components/CanvasViewport/visibleCanvas.ts`), and an export that sizes
  the canvas itself gets no shift. Rejected: an oversized, offset canvas, 1480x820 at 1180x820.
- **Cost.**
  - The canvas renders under the deck: at 1180x820 and dpr 1, 590,400 px with the setting off
    and 902,000 with it on (+52.8%); at dpr 2, 2,361,600 and 3,608,000. The point budget is
    unaffected (it reads the height and the zoom).
  - The blur covers the deck, 380x820 CSS px in landscape, every composited frame while the
    flame converges. Busy states go solid.
- **Viewports.** The deck shows at 1180x820 and 1024x1366; 820x1180 is the rail layout.
- **Default.** On since 2026-09-24 (decision (d)); the device numbers decide whether it stays.
- **Known.** Toggling the setting mis-frames the flame for the 300 ms resize debounce (the view
  only). With the setting on, desktop Chrome draws the nav rail's text with greyscale rather
  than subpixel anti-aliasing. ProgressBar centres on the viewport, not the visible canvas, and
  runs 10px over the deck.

**Polish, built 2026-09-24.** After both phases landed:

- **Control fills.** `--la-control`, `--la-control-strong` and `--la-control-accent` (`lumen.css`)
  default to today's washes. The floating deck and the rail's glass sheet set them to the
  explorer panel's opaque surfaces, so a control does not darken and lighten with the art, and
  its edge stays apart from its fill (a token remap had made them one colour).
- **Ink on glass.** The selected tab chip, Randomize, the search toggle and a keyframe-targeted
  slider label write in ink on glass (from 5.31:1, or 3.55 at worst, to 11 and up). ScrubField
  and the gallery's scrollbar take hooks with today's values as fallbacks (labels 4.43 to
  14.06:1, the scrollbar 1.00 to 5.45:1).
- **The canvas under the open deck.** It drops its edge fade, which painted pale bands on the
  glass in the light theme. The hover badge, the tour's hole and the replay spotlight use the
  visible part (`visibleClientRect`), and a divider drag counts as busy.
- **The tour card.** Its glass drops the shadow that darkened the arrow (16 levels on the phone,
  now 6; 1 or 2 elsewhere), and the card's edge breaks across the arrow's base.
- **The export tracker and the rail.** The job count reads 5.17:1 in the dark theme, the
  tracker's typed glyphs are SVG icons, and the rail's shutter fill holds its accent icon at
  4.79:1 over white art.
- **Accepted.** On the deck layout the tour's hole stops at the deck, so its card sits over the
  dimmed deck.

**The desktop sidebar, built 2026-09-25** (decision (d)). It floats over the canvas as glass
while the gate holds, as the deck does at the other edge.

- **One decision.** `WorkspaceSidebar/useSidebarGlass.ts` decides it. The sidebar floats while
  it is shown, at a desktop width (from 769px, where it is a column rather than a drawer), and
  while the gate holds. `optionalPanelGlass` in `lib/glass.ts` is the gate in code, and a test
  matches it against the stylesheet's selector for every setting and theme, so the two cannot
  disagree. Over a duel's stage the sidebar keeps its opaque look.
- **Layout.** The canvas box takes the sidebar's column as well and drops the 0.4rem tuck. The
  bottom bar starts where the sidebar's cover ends, and the hover badge centres between both
  covers. Hidden, the sidebar covers nothing.
- **Framing.** The covered share is a pair, left and right: the shift is l - r, the visible
  region starts at the leading cover's edge, and `MAX_COVERED_FRACTION` bounds the sum. The
  sidebar's cover is its width less the 0.4rem tuck, so the part on show is the setting-off
  canvas box to the pixel: the flame sits where it sits with the setting off, and a quick export
  is the same 1510x1080 image (0.11% of pixels differ, mean delta 0.32).
- **The surface.** One pane, not a pane per card. Glass on each card left raw art in the gutters
  (239 of 255 over white art, against 58 to 61 under one pane) and needed ten blurred layers
  instead of one. The cards, the shared Slider and PaletteSelector, and the sidebar's captions
  take their glass look from `onGlass` (section 3), and the sidebar's captions from one hook
  of its own. Nothing inside the sidebar blurs again, and its fill fades as busy turns it solid. Three captions measured 2.18:1 and 4.01:1 over white
  art under the glass; they take ink-2 there, and the dimmest text is now 5.4:1.
- **Fixed children.** The audio wiring editor rendered in place inside the sidebar, so glass made
  the sidebar its containing block and clipped it to a 415x1080 strip. It renders from the body
  through a Portal now; with the setting off, its backdrop also dims the version-menu button.
- **Cost at 1920x1080.** The canvas renders 1,630,800 px with the setting off and 2,073,600 with
  it on for the wide sidebar (+27.2%), and 1,717,200 for the compact one (+20.8%). The blur
  covers 449,280 CSS px wide and 362,880 compact. It goes solid while busy.
- **Known.** Turning the setting on or off, or switching the theme, resizes the canvas once
  (1510 to 1920 px wide); hiding the sidebar and the compact and wide modes do not. A device
  pixel ratio of 2, Safari and Firefox are unchecked.

**Phase 3: dialogs and sheets on touch layouts** (M-L). Not built: it waits on a decision.

- **Measured 2026-09-25.** In the export dialog, a stand-in for the frame gallery's hover
  preview lands where the cursor puts it and overhangs the dialog's edge. With `optionalPanel`
  on the dialog it lands 258px right and 62px down, wholly outside the dialog, and is clipped
  away. A Portal cannot take it out: a modal dialog is in the top layer, and everything outside
  it is inert. CodeMirror's tooltips in the WGSL, math and migration editors switch themselves
  to absolute positioning in that case, and the dialog's `overflow: auto` would then clip them
  (read in the source, not exercised).
- **Decision for maff: how dialogs become glass.**
  - **A.** Compose `optionalPanel` on `.modal`. This breaks the frame hover preview and clips
    CodeMirror's tooltips.
  - **B.** Put a glass layer behind the dialog's content. In a dialog that scrolls as a whole
    the layer scrolls away, and it needs a change to `Modal.tsx`.
  - **C, recommended.** A gated modal style: the dialog takes the `--la-glass-panel` fill with no
    blur of its own, and `::backdrop` takes `--la-scrim-sheet` and `--la-scrim-blur` under the
    same gate. Nothing inside the dialog moves. The cost is one full-screen blur while any
    dialog is open, which blurs the whole app behind every dialog: a design call.

  The plan as first written follows.

- **What changes.** The Modal primitive (`Modal/Modal.module.css:1-48`: one class, 32 call sites)
  gets a glass variant, touch layouts only:
  - `.modal` becomes `panel`.
  - `::backdrop` drops from an 80% dim to `--la-scrim-dim`. A glass dialog blurs its own
    backdrop, so a heavy dim would make it read flat.
- **First: move fixed-position children out of the dialog.** `backdrop-filter` makes the dialog
  the containing block for fixed children, so they must move to a Portal first:
  - FramePreviewGallery `.hoverOverlay`, which is placed from clientX/Y.
  - FramePreviewGallery `.hiddenRenderer`.
  - Also check CodeMirror tooltips in the custom-variation and migration dialogs.
- **Open and close.** `startViewTransition` freezes the blur into a snapshot for about 200 ms on
  open and close. Accept it, or skip the transition for glass dialogs.
- **Candidates.** WelcomeScreen and the crash overlay follow the same pattern: an opaque card over
  a blurred backdrop.

**Phase 4: desktop and the rest, optional** (M). Built 2026-09-25: literal blurs went from 57 to
17, one family per commit, each checked before and after in headed Chrome.

| Family                         | Surfaces                                                                                                                                                                            | Now                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Labels over previews           | the name bars of the blend gallery, the load dialog and the welcome screen; frame numbers, the fitness badge, the export dialog's preview toggles, tile names, the Home plate links | `frostFade`, `frost`               |
| Nothing behind them            | the node graph's nodes, the tour's light card, the Home rail, the skeleton sidebar                                                                                                  | no blur                            |
| Controls over previews         | the colour editor's tabs, the compact keyframe diamond, the variation search bar                                                                                                    | `frost`                            |
| Export cards, light look       | the export tracker and the progress bar                                                                                                                                             | `chrome`'s blur                    |
| Blocking screens               | the welcome screen's backdrop, the crash overlay                                                                                                                                    | `scrim`                            |
| Floating pills and bars        | the Arcade pilot's banner and hint, the version pill, the touch menu button, the benchmark pill, the replay caption, the benchmark page's header, the Flame Clash HUD and picker    | `chrome`                           |
| Desktop panels over the canvas | the floating actions, the pull-up menu, the version menu, the session recorder's bar, library, replay panel and agent rail                                                          | `optionalPanel`, fading while busy |
| Arena and duel                 | twelve blurs, each marked "Literal on purpose"                                                                                                                                      | their own look                     |

`styles/designSystem/glassSurfaces.test.ts` keeps it there: each surface still composes its
primitive, a literal blur outside `App.module.css` and the arena and duel fails, and no other
stylesheet defines a glass, frost or scrim token. Found while building it: the floating actions'
inactive toggles and handle and the version pill's resting label kept greys from the old look,
1.3:1 to 2.9:1 on glass, and four of the version menu's rows kept its dark pill boxes. The greys
take the ink tiers now, and the boxes are gone.

The plan as first written:

- **Fold the remaining copied families onto the primitive.** These are the session recorder
  pills, pilot, arena, duel, SoftwareVersion, FloatingActions and PullUpMenu. The visible change
  is small; it is mostly unification.
- **Remove blur that shows nothing.** This covers the Home section rail (it blurs a static
  gradient), the WorkspaceSkeleton sidebar, and FloatingActions in the light theme.
- **Leave these opaque.** The timeline stays opaque, and so did the desktop sidebar until decision
  (d) (above): they are text-dense,
  have light-theme looks, and sit in columns beside the canvas. The timeline is docked below the
  canvas with nothing behind it; if the framing ever puts art under it, it can compose
  `optionalPanel`. The dialogs stay opaque until phase 3's decision, and the director overlay
  with them, since it opens as one.
- **Leave these alone on purpose.** DuelChips' panel and the duel result card are opaque by
  design: "contrast there is not negotiable".

## 5. Performance rules

Each rule comes from one of the earlier cuts.

1. One glass layer. The nested rule enforces it.
2. Real blur only on chrome up to about the size of the rail sheet at peek. Larger panels take
   the busy switch.
3. Fade the glass element itself, never an ancestor. An ancestor below opacity 1 is a backdrop
   root and flattens the blur (`51367f0d`, `EditorRail.module.css:38-46`).
   - Known offenders: the recorder `.dock` opacity; the inline opacity on the view-controls strip
     and the timeline (`WorkspaceBottomBar.tsx:179-180`, `253-259`); `CollapsibleCard .dimmed`;
     Arena `.isClashing`.
4. No fixed-position children inside a glass element. Portal them, as TouchHUD and ShellBar
   already do (`App.module.css:181-197` explains why the canvas pan avoids its container).
5. Blur only what shows art. No blur over flat backgrounds, and none at 96% fill.
6. Watch the clips. `overflow: hidden` and `contain: paint` clip glass edges and shadows (the
   EditorRail sheet, TabletDeck, CollapsibleCard, `.canvas-container`).
7. Anything that sticks out of glass, such as a tooltip arrow, is glass of its own, painted
   before the body: a blurred element is a backdrop root, so its child cannot frost the art.
8. A `clip-path` hides part of an element, but its blur still reads the whole box.
9. An entrance fade on glass fades the children, not the glass, which would be a backdrop root
   below opacity 1.
10. A shared control on glass takes custom-property hooks with today's values as fallbacks, and
    the glass surface sets them. This is the pattern for phase 3's Modal and ExportPngDialog.

## 6. Platforms

- **iOS, Reduce Transparency.** `lumen.css:294-298` says WebKit exposes
  `prefers-reduced-transparency`. That is unverified, and may be wrong. Check it on an iPhone.
  If WebKit does not expose it, the native shell reads `UIAccessibility.isReduceTransparencyEnabled`
  and sets an attribute on `<html>` that the tokens honour.
- **iOS, stale swapchain.** WebKit shows stale WebGPU buffers when a canvas is not presented
  every frame (PR #63 fixed the editor with a present pump; the explorer has none). A
  CoreAnimation blur over an idle WebGPU canvas is untested. Still unchecked, and Glass panels
  is on by default now (decision (d)), so check it on a device before a release.
- **iOS, web below 18.** It reads only `-webkit-backdrop-filter`, which the build drops (section
  3), so it shows no blur. It has no WebGPU either. The native build targets iOS 26.
- **Android.** Mid-range GPUs are the worst case for blur. The shell bar is already an opaque
  Material bar there (`ShellBar.module.css:221-285`). Built in phase 1: `.panel` goes `solid`,
  not `flat`, unless the setting is on, since ink-2 needs 76% and `flat` is 72% without a blur.
  It is native only: `data-platform` is written by the native build alone, so Chrome on an
  Android phone still gets the glass. With the setting on by default (decision (d)), the native
  app gets the glass too until someone turns it off; a platform default in `lib/glass.ts` would
  keep Android solid until its frame times are measured.

## 7. Verification

**In CI**

- **Glass guard test** (`styles/designSystem/glassBlurs.test.ts`). It enforces three things:
  - Literal `backdrop-filter` declarations outside the primitive can only go down (a ratchet,
    pinned exactly: 59 after phase 0, 57 after phase 1). Since the review of 2026-09-25 the
    `--la-glass-blur` token counts too: written outside the primitive it gets none of what the
    primitive enforces.
  - Every blur has its `-webkit-` twin with the same value, in a stylesheet rule or an inline
    style object.
  - In a stylesheet, the `-webkit-` spelling comes first (section 3).

  A static "no module nests its own glass" check was not built. The primitive's nested rule
  flattens any glass class inside another at run time, which a static check could not see
  through anyway (nesting happens across components). A literal blur inside glass is not caught;
  the ratchet pushes those toward zero. The test reads the tree, so it is registered in
  `scripts/always-on-tests.mjs`.

- **Contrast test** (`styles/designSystem/glassContrast.test.ts`). The table in (c), computed
  from `lumen.css`. It checks that every text tier
  allowed on each glass tier meets 4.5:1 over white and over black, and that the glass focus
  ring meets 3:1 on all four fills.
- **Where glass is written.** `glassSurfaces.test.ts` (phase 4, and since 2026-09-25 the focus
  ring on the surfaces that keep a light fill, and a busy fade read from every rule of a
  surface), `glassHooks.test.ts` (`onGlass`), `glassGate.test.ts` (the gate), and
  `lib/optionalPanelGlass.test.ts`, which matches the gate's selector against
  `optionalPanelGlass` for every setting and theme. The glass guards read the stylesheets
  through one reader, `test/cssModule.ts` (it was `styles/designSystem/testUtils.ts` until
  2026-09-25, when the component stylesheet tests moved onto it too).
- **Busy-switch tests.** Unit tests for which states set the busy attribute.

**Headed browser, each phase** (standalone script, never `playwright test`)

- **Viewports.** Phone 390x844, tablet 820x1180 (the rail layout), and 1180x820 and 1024x1366
  (the deck).
- **Conditions.** Light and dark, the setting off and on, and a bright flame and a dark one.
- **Output.** Before and after screenshots.
- **Timing.** The agents' headed browser runs on a hidden workspace at about one frame a second,
  so busy and fade probes need waits of several seconds, and its frame times mean nothing.
- **The dev debug panel.** It sits fixed over the top right of a desktop page in development
  builds. Hide it before measuring anything there: the export tracker's buttons read 1.16:1
  through it.

**On devices (maff)**

- **Hardware.** An iPhone on iOS 26, an iPad and a mid-range Android.
- **Frame time.** Measure it in Safari Web Inspector or Chrome DevTools:
  - with glass off, `flat` and full;
  - over a converging flame and over an animating one.
- **Accessibility settings.** Reduce Transparency and Increase Contrast.
- **The stale-swapchain check** above.
- **Decision.** These numbers decide whether Glass panels stays on by default (decision (d)),
  and the phone sheet past peek.

## 8. Found on the way, out of scope

- **Unused code.**
  - Removed on 2026-09-25: `components/BenchmarkButton/*` and `components/Timeline/TimelineRuler.*`,
    which had no users. The focus-ring guard's light-fill list lost `.benchmark-btn` with them.
    The ruler was the only caller of `getAllTrackFrames` (`utils/timeline.ts`), which now has
    only its own tests.
  - These rules in `ArenaOverlay.module.css` have no references: `.header` (241-253),
    `.spectatorTopBar` (1080-1092), `.spectatorHud`, `.spectatorStage`, `.commentaryBox` and
    `.roundsBar`.
- **Undefined class.** `ArcadeModePanel.tsx:411` and `:470` use `ui.soloDuelButton`, which
  `ArcadeHub.module.css` does not define.
- **Unreachable branch.** Removed on 2026-09-25: the SoftwareVersion touch branch never ran,
  because `isTouch()` and `hideTrigger` were both `isTouchLayout`. The branch, the
  `isTouchLayout` and `touchLayoutPreference` props only it read, and the rules only it used
  (`.touchContainer`, `.versionContainer`, `.menuTrigger`, `.menuTriggerActive`, `.triggerIcon`,
  `.menuPopover` and its keyframes) went together, and the SURFACES table lost its
  `.menuPopover` entry.
- **Token name collision.** PopulationSimulator redefines `--la-surface` and `--la-hairline`
  locally. The shared rules would pick those values up inside it.
- **Undefined variables.** Several modules read `--color-*` and `--accent` variables that are
  never defined, so they show their dark fallbacks in the light theme too.
- **Found while building phases 1 and 2.**
  - The tour arrow points 8px before its target's centre: `measureAndPosition` in
    `SpotlightTour.tsx` subtracts half the arrow, and the stylesheet's -8px margin subtracts it
    again. A fix must keep `--seam-at` at the arrow's centre.
  - The touch search input is styled inline with literal whites (`TouchControlSurface.tsx`,
    around its search field), and `.affineGridWrap` has a literal black wash on glass.
  - The light desktop export tracker's job count is 3.68:1, and the rail sheet's own vertical
    scrollbar thumb is about 1.5:1.
  - Randomize fills its pill edge to edge: the pills have no padding.
  - The explorer's sliders pass no parameter path, so their keyframe-targeted state never shows.
  - The desktop export dialog stays modal over the tracker while an export runs, and its Close
    button does not close it.
  - `.githooks/pre-commit` runs prettier before `eslint --fix`, so an eslint fix can land
    unformatted.
