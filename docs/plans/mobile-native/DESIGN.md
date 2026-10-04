# Native design: the execution plan

Status: **ready to execute**, 2026-09-11. Branch `feat/mobile-capacitor-scaffolding-9224ec`.
Companion to `README.md` in this directory: that file is the Capacitor wrapper and the store path, this one is
the interface the wrapper contains. Where the two disagree about ordering, the README's phase 1 (the WebGPU
probe) comes first, always.

**The drawn version of everything below** is the showcase page
`disjoint-colliders/packages/showcase-gallery/gallery-viewer/lumen-native.html` (rebuild:
`node lumen-native/assemble.mjs` from `gallery-viewer/`; component rules: `lumen-native/CONTRACT.md`). Every
screen in this plan exists there as a drawn frame for a phone and for a tablet, with a `NN/30` score against a
fifteen-item checklist and two source lines: the platform pattern it follows and the file it changes.

Nothing in this file names an account, a team, a certificate or a secret value. Secret _names_ are fine.

---

## 1. The decisions this plan runs from

Taken 2026-09-11.

| #   | Decision                                                                              | What it means here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Scope is core plus play.**                                                          | In v1: editor, library, export and share, settings, onboarding, plus Arcade lessons, Arena/Duel and audio-reactive. Web-only or later: Timeline, session recorder and replay, custom variation and WGSL editors, the logo generator, the Benchmark Lab.                                                                                                                                                                                                                                                 |
| 2   | **One art direction, applied everywhere afterwards.**                                 | Three directions are drawn on the same screens: D1 Observatory, D2 Ember Glass, D3 Plate. **The recommendation is D2.** It costs the least canvas (150 pt of 852 at rest against D1's 178 and D3's 92 pt of mount), its rule is about relationship rather than size so it survives every width, its action colour is the Ember already in the app icon, and its components map one-to-one onto files that exist. The owner picks; this plan is written against D2 and the token file carries all three. |
| 3   | **The shell is Lumen Apeiron; the fractal editor keeps Chaos Master as a sub-brand.** | Seven user-visible strings change. The sub-brand survives in one place: the About row. Storage keys, package names and the repository do not change.                                                                                                                                                                                                                                                                                                                                                    |
| 4   | **Phone and tablet have equal weight.**                                               | Every screen is designed for a phone (390-430 pt, portrait) **and** for a tablet: iPad 11 inch (834 x 1210) and 13 inch (1024 x 1366), and Galaxy Tab S9+ 12.4 inch (800 x 1280 logical), both orientations. A tablet layout is not the phone stretched.                                                                                                                                                                                                                                                |
| 5   | **Paywall and Pro are phase 2.**                                                      | Designed, drawn, and **nothing in v1 depends on them.** The one exception that can move them forward is decision 02 in the README: a contest entry needs a live purchase, and a first in-app purchase must be submitted with the first app version.                                                                                                                                                                                                                                                     |
| 6   | **The date is 2026-09-30.**                                                           | Live on the store, not in review. Submission is about 2026-09-19. Section 12 says what is cut to make it and what it costs.                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | **Capacitor stays.**                                                                  | No native Swift or Kotlin UI. The native feel comes from the web layer: Solid, CSS, and the Capacitor plugins for haptics, share, filesystem, status bar and keyboard.                                                                                                                                                                                                                                                                                                                                  |

## 2. The tokens

Add `packages/app/src/styles/designSystem/lumen.css`, imported from `styles/index.css` **after** `colors.css`.
It is the `--la-*` set: grounds, ink, one action colour, five semantic hues, one glass layer, two scrims, a
radius and spacing ladder, four elevations, one easing curve with five durations, the type scale, and the
target and safe-area constants. The same file carries D1 and D3 as `[data-direction]` overrides, so switching
direction is one attribute on the root and no component changes.

- [ ] **Step 0, half a day, blocks everything else.** Land `lumen.css` plus the alias block below, change
      nothing else, and confirm the app looks identical.

```css
/* Migration aliases. Keep for exactly one release, then delete them and the last references with them. */
:root {
  --neutral-950: var(--la-void);
  --neutral-900: var(--la-ground);
  --neutral-800: var(--la-surface-2);
  --neutral-50: var(--la-ink);
  --neutral-400: var(--la-ink-3);
  --blue-500: var(--la-accent);
  --blue-400: var(--la-accent-press);
  --round: var(--la-r-pill);
  --focus-ring-color: var(--la-accent);
}
```

What each token replaces, in the files that exist today:

| From                                                                           | To                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `designSystem/colors.css` `--neutral-50 … 300`                                 | `--la-ink`, `--la-ink-2`, `--la-ink-3`                                                                                                                                   |
| `designSystem/colors.css` `--neutral-800 … 950`                                | `--la-surface-2`, `--la-surface`, `--la-ground`                                                                                                                          |
| `--blue-400` / `--blue-500`                                                    | `--la-accent` and `--la-accent-press`; the rest of the blue ramp is deleted — the product has one action colour                                                          |
| `designSystem/layout.css` `--space-1 … 8`                                      | `--la-s-1 … --la-s-8`, the same ladder in px                                                                                                                             |
| `designSystem/layout.css` `--round: 100vh`                                     | `--la-r-pill: 999px`. **This is a live bug, not a rename**: `100vh` resolves against the viewport, so a pill inside a tall scroller renders as a rectangle               |
| `styles/index.css` `--focus-ring-color` (indigo)                               | `--la-accent` plus `--la-e-focus`                                                                                                                                        |
| `styles/index.css` the bare `* { font-family: Inter }`                         | `--la-font-body` with a real fallback stack, and Inter self-hosted instead of fetched from Google Fonts (a cold offline launch currently renders in the browser default) |
| `TouchSurface.module.css` `#38bdf8` / `#7dd3fc`                                | `--la-accent` / `--la-accent-press`                                                                                                                                      |
| `TouchSurface.module.css` `rgba(15,19,32,0.88)`, `blur(16px)`                  | `--la-glass`, `--la-glass-blur`                                                                                                                                          |
| `TouchSurface.module.css` `0.26s cubic-bezier(0.16,1,0.3,1)`, `all 0.15s ease` | `--la-dur-sheet` / `--la-ease`, and never `transition: all`                                                                                                              |

Keep: the 4 px spacing base, the `data-theme` mechanism (the native shell is dark-only; the web keeps a light
theme), the self-hosted `Cinzel Decorative` 700 (the duel result card draws its title into a PNG with canvas
`fillText`, and a face that arrives late substitutes a default serif into the exported file), and the oklch
neutral ramp where a perceptual grey ramp is the right tool — data plots, the population simulator, the
ancestry tree — renamed `--plot-grey-*` so nobody reaches for it as a UI colour again.

## 3. Phase A — the bottom rail (do this first)

The single visible difference between an app and a web page, and the thing every other screen sits inside. It
replaces the pill bar with three chips that expand into a bottom sheet
(`components/TouchSurface/MobileBottomSurface.tsx`) with **one mounted surface at three detents**.

Structure, bottom-up inside the screen: the canvas full bleed and always interactive; a floating 44 pt glass
HUD pill at the top (Library, the flame's name, Undo, Redo, More); the rail pinned to the bottom safe area.

| Detent         | Height                        | Holds                                                                   | Canvas                                                                     |
| -------------- | ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Peek (default) | 96 pt including the safe area | the grabber, the destination capsule, four tool chips, the shutter      | fully interactive                                                          |
| Medium         | 44% of the screen             | the selected tool's controls, primary parameter first                   | interactive above the sheet; the camera pans up by half the covered height |
| Large          | 88%                           | the selected tool's full library (variation catalogue, palette library) | a 120 pt live strip stays at the top                                       |

Files: rewrite `components/TouchSurface/MobileBottomSurface.tsx`; `TouchHUD.tsx` becomes the top bar and loses
the Home/Snapshot/More trio; `TouchControlSurface.tsx` becomes the sheet body; `TouchSurface.module.css` moves
every 32 and 34 px target to 44 (48 on Android); `components/SoftwareVersion/SoftwareVersion.tsx` stops
rendering its own floating button on touch, where it collides with the top bar; `MainWorkspace.tsx` mounts the
new surface and hands the height the sheet covers to the canvas, which a CSS transform moves up by half of it
(`--rail-inset` on `.canvas` in `App.module.css`). The pan the table above and the list below describe is that
move of the canvas, not of the camera: `effectivePosition` and the flame are untouched.

- [x] A detent controller: drag tracks the finger 1:1, no rubber band past large, release springs to the
      nearest detent or to the next one in the direction of travel above 0.5 pt/ms.
- [x] Haptics: `selectionChanged()` at each detent crossing, `impact(Light)` at the latch, `impact(Light)` at
      touch-down on a chip. A new `@chaos-master/mobile-runtime/haptics` module; nothing in `packages/app`
      calls `@capacitor/haptics` today although the plugin is already registered on both platforms.
- [x] 40 px minimum on every tappable control, 48 dp on Android, measured on the touch box. A drag
      handle (the grabber row, the deck's divider) may be thinner, and its whole hit strip receives
      touches.
- [ ] The slider row from the kit: 56 pt phone / 48 pt tablet, 4 pt track, 28 pt thumb with a 44 pt touch box
      inflated by a `::before`, and **the value always visible** in tabular figures.
- [ ] Long-press to remove a variation, with an undo toast. Delete the one-tap delete in
      `TouchControlSurface.tsx`.
- [x] The camera pans up by half the covered height when the sheet opens, and back when it closes.
- [x] `index.html` gains `interactive-widget=resizes-content` so the keyboard does not cover the sheet.

**Acceptance, phone (compact, under 680 pt):** the rail is mounted and never disappears; a flick down goes one
detent and never to hidden; every daily action is reachable below 700 pt on an 852 pt screen; the canvas above
a medium sheet still pans and pinches; a Dynamic Type step of AX2 grows the rows and wraps the labels without
clipping a control or changing the rail's height.

**Acceptance, tablet (regular, 900 pt and above):** the rail is not drawn; the same controls are a 360-380 pt
opaque trailing deck beside the canvas, with a draggable divider between 320 and 480 pt and a double-tap
collapse. Below 900 pt the deck is not drawn and the phone rail and its sheet are used, with the navigation
rail still present.

The deck was designed opaque, a page beside the canvas rather than chrome over it, and it still is with
the Glass panels setting off. The setting is on by default since 2026-09-24 (Settings, on every layout),
and floats the deck over the canvas as glass, the plan's phase 2 (`docs/plans/glass-panels.md`): the canvas runs on under the
deck, the camera frames the flame in the part the deck leaves visible, the controls inside keep their opaque
surfaces, and the deck goes solid while the canvas presents every frame. Collapsed, the deck covers nothing
and the flame is framed on the whole canvas, as it is with the setting off. The framing never reaches the
document, an export or a share link. Device frame times decide whether the default stays on.

**Acceptance, phone landscape:** the rail rotates to the leading edge as a vertical rail, the HUD collapses to
three glyphs at the trailing edge, and a detent opens a 320 pt trailing panel rather than a bottom sheet.

## 4. Phase B — layout routing and the shell

Two changes that unblock half the deck.

**Routing.** `stores/workspaceLayoutStore.ts` decides on `window.innerWidth` against three unrelated
breakpoints, and never consults input or platform. Consequences, all visible on a device: an 11 inch iPad in
landscape (1210 pt) and a 13 inch (1366 pt) both fall through to the desktop workspace; a rotated iPhone
(852 pt) classifies as a tablet and gets the inspector deck on a 393 pt tall screen.

- [x] Decide compact versus regular from the **short edge** and from the element's width, not the window's.
- [x] Collapse `PHONE_MAX_WIDTH`, `TABLET_MAX_WIDTH` and `WIDE_LAYOUT_MIN_WIDTH` into one source, and add the
      900 pt rule for the tablet deck.
- [x] Consult `IS_NATIVE` (`lib/platform.ts`) and `(pointer: coarse)`; width then chooses only compact or
      regular.
- [x] Crossing the threshold fades the arriving surface in rather than reloading, and the rail's detent
      survives it. It is a one-way fade, not a true cross-fade: the leaving surface unmounts, so there is
      nothing to fade out against.

**Shell.** Nothing in the app has one. `setActiveTab('home')` is reachable only from `components/FloatingActions`,
which is desktop-only, so **Home is unreachable on a phone or a tablet today**.

- [x] Two destinations — Create and Library — as the kit's floating glass bar with a separated More circle,
      and a Material bar on Android. **Play is reserved, not shown:** five of the six Arcade modes need
      WebMCP, which a WebView has no agent for, and Play with audio alone is a later phase — an empty
      destination is worse than none. `ShellDestination` is a union, so adding it is one entry.
- [x] In Create the bar collapses to a 56 pt capsule docked at the leading end of the rail, expanding over the
      rail for three seconds or while a touch is held. An editor that also shows a tab bar loses 106 pt of
      canvas to navigation nobody is using.
- [x] On a tablet wide enough for the inspector deck (the 900 pt rule) the navigation rail is permanent at
      80 pt and gains Settings under the destinations, and Library is inset by its column so the rail stays
      exposed and tappable there. A narrower tablet - portrait, or a Split View pane - gets the phone's
      rail and its docked capsule instead. It opens the existing HelpModal; phase C redesigns settings.
- [x] `lib/activeTab.ts` already models `home | workspace | arcade` in the fragment; no new name was needed
      (Library is the existing Home tab, per section 12's cut list) and both shell surfaces are its touch
      entry point.
- [x] One back registry, popped by the Android back gesture and by Home's edge swipe, in the order things
      opened: a modal, the drawer, a popover, the rail's detents large to medium and medium to peek, then
      Library to Create, then `minimizeApp()` — **never** `history.back()`. A sheet's downward drag is not
      one of the poppers: it settles its own detent directly. On iOS the edge swipe is Home's alone, and it
      is a threshold flick rather than a finger-tracked transition. Still open: the Arcade's own panels (the
      mode panels, SpotlightTour, DuelStage, ArenaOverlay) register nothing, so back from inside an Arcade
      mode leaves the Arcade instead of closing the panel first.
- [x] Pause saves a draft that a cold start offers back. Nothing stops the render loop explicitly: both
      platforms suspend `requestAnimationFrame` for a hidden WebView, and `finalRenderInterval` already parks
      the loop when the workspace is covered.

**Acceptance:** an iPad at any orientation and any Split View width lands in a touch layout, not the desktop
sidebar; a rotated iPhone stays a phone; back from the editor's peek state minimises the app rather than
exiting it; Home is reachable on every device class.

## 5. Phase C — settings and about

- [ ] A plain grouped list, every switch immediate, no Save: **Rendering** (Render quality: Battery, Balanced,
      Maximum — with the cost of each stated — and Keep the screen awake while rendering), **Feel** (Haptics,
      Reduce motion defaulting to the system setting, Sound in Arcade and Arena defaulting to off),
      **Storage** (size on this device, Back up everything, Reset app data), **Privacy** (the plain sentence
      and the microphone state), **About**, **Advanced** (Desktop layout, one row, plainly explained).
- [ ] **Render quality replaces the hardware-tier question** that `components/WelcomeScreen/WelcomeScreen.tsx`
      asks a first-time user before they have seen anything. The detection moves to first-launch background
      work with a sensible default; the persisted value is unchanged.
- [ ] `components/HelpModal/HelpModal.tsx` loses four rows that mean nothing in an app (sidebar width, compact
      UI, keyboard shortcuts, default picker mode) and the two external funding links, which need a review-note
      decision either way.
- [ ] About: the mark, **Lumen Apeiron**, the build label `0.9.11 (ci.6 · d9f35cc)` copyable on tap,
      **Chaos Master, the fractal editor** as the second line, Privacy, Support, the licence, and Report a
      problem, which attaches the build label and the device readout and goes through the share sheet.
- [ ] Backup: `components/DataManagement` writes a ZIP through the same save path as an export, with honest
      progress (flames counted, seconds elapsed) and a sentence saying it contains flames, not settings.
- [ ] Storage durability: call `navigator.storage.persist()`, and move the custom-variation library out of
      `localStorage` into `@capacitor/preferences`. A WebView's storage is evictable, and `utils/recentFlames.ts`
      keeps every recent flame in it.

**Acceptance:** the four switches take effect with no Save on all three device classes; the build label copies
with a Copied toast; Reset app data goes through a **native** alert, not the browser `confirm()` that a
WebView titles with the origin.

## 6. Phase D — onboarding

- [ ] `App.tsx` drops the `showWelcome` branch for native; `WelcomeScreen` becomes web-only. The first screen
      is a living flame with one line on the bottom scrim: **Everything you make stays on this device.**
- [ ] `MainWorkspace.tsx` seeds a curated opening flame on a fresh install instead of the current example.
- [ ] Three coach marks on the user's own flame — Drag to move, Pinch to zoom, Double-tap to re-centre — each
      clearing itself when its gesture happens, so the sequence ends by doing rather than by tapping Next. A
      fourth appears on Android over the 20 dp back-gesture strip.
- [ ] Reuse `components/SpotlightTour/SpotlightTour.tsx` positioning; add a bottom-anchored variant; drop the
      `sidebar` and `timeline` tours from the native registry, since both point at surfaces touch does not have.
- [ ] The two-minute tour is offered **once**, after the third adopted change, as an accessory above the rail
      rather than a modal. Swiping it down is No thanks, and No thanks is permanent.
- [ ] Canvas gestures: two-finger rotate and double-tap re-centre do not exist today
      (`lib/WheelZoomCamera2D.tsx`, `WheelZoomCamera3D.tsx`, `utils/createPinchHandler.ts`); add them, plus
      triple-tap to hide the chrome, long-press to select the transform under the finger, and a 20 pt
      edge-exclusion inset on the canvas pointer target.
- [ ] An aria layer over the canvas: a rotor with Parameters, Transforms and Palette; every parameter speaks
      its name and value; the canvas itself is one element with a spoken summary.

**Acceptance:** a fresh install reaches a moving flame with no account, no tier question and no paragraph; the
three marks clear by gesture on all three device classes; nothing in the first run asks for a permission.

## 7. Phase E — the permission moment

One permission in v1, and it is the app's only privacy surface.

- [ ] The app's own card first, always: **Let the flame follow sound**, what it buys in one line, two facts
      (processed on the device, never recorded), Not now and Start listening. The system dialog only ever
      follows the card's primary button; there is no path to the system alert by accident.
- [ ] `components/AudioReactivePanel/AudioReactivePanel.tsx` calls `getUserMedia` on the first tap of the Mic
      button today, with no priming, and the panel only renders when the desktop sidebar is open
      (`MainWorkspace.tsx`) — both go.
- [ ] Denial is a designed state, not a printed error: the current string is "Microphone access denied. Check
      browser permissions." It becomes **Microphone access is off for Lumen Apeiron. Turn it on in Settings to
      let the flame follow sound.** with an Open Settings deep link (a small platform port beside
      `packages/mobile-runtime/src/files.ts`) and a **demonstration** driven by a bundled tone, so the frame
      still shows what the feature does.
- [ ] The iOS usage string is design, not a build artifact, and is reviewed with these screens.
- [ ] Notifications are **not** requested: the save confirmation stays an in-app toast.
- [ ] On grant: `notification(Success)`, the live indicator turns Signal cyan over 220 ms. On deny: **no
      haptic** — a denial is a choice, not a failure.

**Acceptance:** the system dialog is never the first thing a user sees; leaving the screen releases the
microphone; the denied state still moves.

## 8. Phase F — export, save and share

The path exists and works; three things are missing and all three are visible.

- [ ] **The filename.** `components/ExportPngDialog/ExportPngDialog.tsx` writes the literal `flame.png`. It
      becomes the flame's name and the date: `aurora-fold-2026-09-11.png`.
- [ ] **The confirmation.** The shutter fires a 120 ms wipe with `impact(Light)`, becomes a progress ring in
      real units (samples and seconds, not a decorative bar), and lands with `notification(Success)` fired when
      the `SaveOutcome` resolves — on Android that is after the file write returns, up to a few hundred
      milliseconds after the button flashed. Firing on the press would be a lie.
- [ ] **Share.** The editor has no share action at all. Add one: More, then Share, renders at the current
      size, writes to the cache and opens the system sheet with the image and a link. `shareNative` already
      exists in `lib/nativeSave.ts` and is wired only to the benchmark card and the logo generator;
      `utils/shareLink.ts` must use `publicOrigin()` from `lib/platform.ts`.
- [ ] **Open in Files** on Android, beside the existing Share action in the save toast.
- [ ] Export options become a large-detent sheet with the real pixel size and an estimate against each size,
      and a primary button that names the outcome. The animation tab does not come to native v1.
- [ ] A cancelled share is not an error: no haptic, no toast, no state change.
- [ ] Reduce motion replaces the full-frame flash with a wash pulse on the shutter. A luminance jump across
      the whole frame is the single worst thing for a vestibular trigger.

**Acceptance:** on each device class a one-tap export produces a correctly named file, a visible confirmation
and a share action; the 20 second deadline resolves into a toast naming the reason rather than a spinner that
never ends.

## 9. Phase G — the rename

Seven user-visible strings, one afternoon, and it must land before any screenshot is taken.

- [ ] `components/TouchSurface/TouchHUD.tsx` and `TabletInspectorDeck.tsx`: an unnamed flame is titled with
      the product name today (`|| 'Chaos Master'`). Both become `Untitled flame`. This is a bug, not a naming
      choice.
- [ ] `components/SoftwareVersion/SoftwareVersion.tsx`: six `aria-label` and `title` strings become
      **Lumen Apeiron**.
- [ ] `components/ErrorHandling/ErrorHandling.tsx`: both error screens are headed `CHAOS MASTER`.
- [ ] `components/ArenaOverlay/ArenaResultsView.tsx`: the champion card reads "Chaos Master • Arena Champion"
      and **leaves the device**, so it decides what strangers see.
- [ ] `components/WelcomeScreen/WelcomeScreen.tsx`: the subtitle does not come to native at all.
- [ ] The sub-brand survives in the About row and nowhere else in the chrome.
- [ ] **Do not change** `chaos-master-recent-flames`, `chaos-master-welcome-dismissed`, `chaos-touch-layout-pref`,
      the `@chaos-master/*` package names or the repository name. Renaming a storage key wipes every tester's
      work.

## 10. Phase H — the trouble screens, Play and audio

**Trouble screens** (`components/ErrorHandling/ErrorHandling.tsx`). Both are wrong in an app: they say the
browser or device does not support WebGPU, link to a specification status page and suggest trying the latest
Chrome, Firefox or Safari. In an app there is no browser to change.

- [ ] Unsupported, iOS: **Lumen Apeiron needs iOS 26 or later to draw flames on this device.** No action.
- [ ] Unsupported, Android: **Update Android System WebView to version 146 or later, then reopen Lumen
      Apeiron.** One action: the Play listing. Show the device's WebView version beside the required one.
- [ ] GPU refused: **This device's graphics driver refused the renderer.** One action: Try again.
- [ ] Crash: **Lumen Apeiron stopped. Your last flame was saved.** Reload, Send a report (share sheet, not a
      GitHub issue template), Reset app data behind a native alert that offers a backup first, and a collapsed
      Details block with the build label, the device readout and the last log lines.

**Play.** Five of the six Arcade modes are prompts to paste into an external agent over WebMCP
(`components/Arcade/ArcadeModePanel.tsx`, `arcade/webmcpDetect.ts`), and a Capacitor WebView has no agent.

- [ ] Keep three modes on the device: **Arcade lessons** replayed from bundled scripts through
      `components/Arcade/PilotOverlay.tsx` and `PilotSpotlight.tsx` (which already drive the editor and draw a
      spotlight, with the agent replaced by the script); **Arena** against
      `webmcp/tools/arenaArchetypes.ts`, which already provides the archetypes, stances and opponent
      generation; **Audio**.
- [ ] Cinema, Beats and Director do not ship, and the About screen names them as web features in the same
      words the Play hub uses. `components/Arcade/WebMcpStatusPill.tsx` is not rendered in native.
- [ ] `components/ArenaOverlay/*` has **no touch layout at all**: add a phone one (stacked, round counter
      between) and a tablet one (side by side).
- [ ] `components/Duel/*` is desktop-shaped, and its one agent-free path is gated to development builds. Promote
      it and give the empty seat an archetype.
- [ ] A lesson never locks the editor: the rail stays usable, back pauses and keeps the position.

**Audio-reactive.** `AudioReactivePanel.tsx` (43.7K) and `components/AudioWiringModal/` (48.2K plus a node
graph) are far too large for a phone.

- [ ] Ship the three-band strip only: Low to brightness, Mid to spin, High to palette, each row a scrub. The
      flame is the meter; the node graph stays on the web.
- [ ] Signal cyan means live input, here and nowhere else in the product. Everything currently cyan elsewhere
      is an action and becomes Ember.
- [ ] Quiet state: **It is quiet. The flame moves when it hears something.** Interrupted state for a call or
      unplugged headphones.

## 11. Phase I — Pro and the paywall (phase 2)

Designed, drawn, and **nothing in v1 depends on it**.

- [ ] `@revenuecat/purchases-capacitor` behind a `PurchasesPort` in `packages/mobile-runtime`, with the
      build-time fail-closed policy from the README's phase 5.
- [ ] The offer is reached only from the control it unlocks — the 4x row in Export options — never on launch
      and never during a first run.
- [ ] **No price is written into the app.** Both stores require the price shown to come from the store at
      runtime; a hard-coded figure in a mock becomes a hard-coded figure in a submission.
- [ ] Restore purchases is visible without scrolling and always works, including when it finds nothing:
      **Nothing to restore on this account.**
- [ ] A cancelled purchase is an outcome, not an error.
- [ ] The entitlement is cached where a WebView cannot evict it (`@capacitor/preferences`), so a Pro user who
      opens the app offline is still a Pro user.
- [ ] The unlocked state is deliberately boring: no badge, no banner, no second sell. The only visible change
      is that the 4x row loses its lock.

## 12. Order, dates, and what is cut

Working back from **2026-09-30 live**, submission is about **2026-09-19** — a new app record, a first in-app
purchase reviewed with it, and one rejection round of margin all have to fit. That is eight working days from
2026-09-11. The WebGPU probe passed on 2026-09-11 on an iPhone (TestFlight 0.9.11 (6)) and on a Galaxy Tab S9+ (the debug build): the editor renders and animates, exports save and share, the microphone asks. An iPad and a Mali-GPU Android device are still to run.

| Date                | Work                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-11          | **Gate passed** on the iPhone (TestFlight build 6) and the Galaxy Tab S9+ (debug build)                                               |
| 2026-09-12          | **Gate, remaining:** the same probe on an iPad (iPadOS 26) and on a Mali-GPU Android device                                           |
| 2026-09-13          | Phase B routing: input and window, one breakpoint source, landscape phone stays a phone                                               |
| 2026-09-14 to 09-16 | Phase A rail, gestures, the first haptics, the back stack, pause and resume, safe areas                                               |
| 2026-09-17          | Phase F export, save, share                                                                                                           |
| 2026-09-18          | Phase C settings and About, Phase G rename, Phase H trouble screens                                                                   |
| 2026-09-19          | **Gate:** submission — store assets including a 13 inch iPad set, privacy answers, review notes, the public privacy and support pages |
| 2026-09-22 to 09-26 | Review, one rejection round of margin, TestFlight feedback                                                                            |
| 2026-09-30          | **Shipaton closes, 11:45 PM PT.** Live, not in review                                                                                 |
| 2026-10             | The cut list below, in order                                                                                                          |

**Cut to make the date, and what it costs:**

| Cut                                                    | What ships instead                                                                                         | Cost                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Library as a new destination                           | the existing `LoadFlameModal` re-presented as a large-detent sheet, and Home made reachable from the shell | the four-tab library and the offline story slip; Recent and Examples still work |
| Play's on-device Arcade, Arena and Duel touch layouts  | Play ships with **Audio** only; Arcade and Arena are named as web features in About                        | "core plus play" becomes "core plus audio" for the store build                  |
| Tablet portrait's two-column inspector and drag-to-add | landscape three-pane only; portrait gets the phone rail on a bigger canvas                                 | iPad portrait is usable, not designed                                           |
| On-canvas affine handles                               | the numeric Shape panel alone                                                                              | the most direct-feeling control in the editor waits                             |
| The export-options redesign                            | the existing dialog re-presented as a sheet, animation tab hidden                                          | the size-and-cost clarity waits                                                 |
| Vary candidate tiles                                   | Mutate and Randomize as two buttons with an amount dial and an undo toast                                  | the first-run beat is weaker and the rollup drops about a point                 |
| The guided tour rework                                 | the three first-run coach marks only                                                                       | acceptable: the coach marks are the part that earns its place                   |
| The Android store release                              | iOS and TestFlight only; the Android build stays a device probe                                            | decision 18 in the showcase page's list                                         |
| Community tab, universal links, persisted storage      | Backup promoted in Settings instead                                                                        | both slip to October                                                            |

**The honest way to put it:** a reduced app on 2026-09-30, or the designed app in October. Trying to ship
section 1's whole scope by 2026-09-30 is the one outcome that produces neither.

## 13. Test and verification plan

### Unit and component tests to add

- [ ] `workspaceLayoutStore`: a table test over (width, height, orientation, pointer, `IS_NATIVE`) covering
      393 x 852, 852 x 393, 412 x 915, 834 x 1210, 1210 x 834, 800 x 1280, 1280 x 800, 1024 x 1366,
      1366 x 1024 and a 455 pt Split View column. Every case asserts compact or regular, deck or sheet, and
      that no case returns the desktop layout while `IS_NATIVE` is true.
- [ ] The detent controller: drag to a position, release with a velocity, assert the target detent; assert
      that a flick down from medium reaches peek and never hidden.
- [ ] The back registry: push a stack of (alert, sheet, overlay, destination) and assert the pop order ends at
      `minimizeApp()` and never calls `history.back()`.
- [ ] The export filename: a flame named `Aurora fold` on 2026-09-11 produces `aurora-fold-2026-09-11.png`;
      an unnamed flame produces a dated fallback; a name with punctuation and non-Latin characters is safe on
      both file systems.
- [ ] The haptic map: each gesture fires exactly one sensation, at touch-down where the map says touch-down,
      never awaited, and nothing fires when the Haptics setting is off.
- [ ] Save outcomes: success, cancelled, refused-by-storage (falls back to the share sheet), and failed each
      produce the right toast, the right haptic and the right copy. A cancel produces none of the three.
- [ ] Copy tests: no user-visible string contains "Chaos Master" outside the About row; no string contains
      "browser" in a native build; the microphone strings match the manifest strings exactly.
- [ ] Token guard: a lint rule or test that fails on a new hex literal in `packages/app/src/components/TouchSurface/`.

### On-device checks

Run each on **iPhone (iOS 26)**, **iPad 11 inch and 13 inch (iPadOS 26)** and **Galaxy Tab S9+ (Android 12+,
WebView 146)**, plus a phone on Android for the save path.

- [ ] A flame draws at all. Everything else is hypothetical until this passes.
- [ ] Cold start from a killed app: Void ground, no white flash, the splash ends on the first GPU frame.
- [ ] Rotate in every screen: the layout follows the short edge, the detent survives, nothing reloads.
- [ ] iPad Split View at one-third, one-half and two-thirds: compact at 455 pt, regular above 900 pt, a
      cross-fade at the threshold, no lost state.
- [ ] Every tappable control measured at 40 px minimum (48 dp on Android) with the accessibility
      inspector, and both edges of every drag handle's hit strip touched.
- [ ] Dynamic Type at AX2 and the largest step: the rail, the sheet, the tab bar and the deck all survive.
- [ ] VoiceOver and TalkBack: the rotor reads Parameters, Transforms and Palette; a slider announces its name
      and value and changes by swipe; the canvas has a spoken summary.
- [ ] Reduce Motion and Reduce Transparency both on: no flash on export, sheets appear at their detent, glass
      becomes solid, every haptic still fires.
- [ ] Save on Android: the file lands in Documents / Lumen Apeiron with the flame's name, the toast offers
      Share and Open in Files, and the fallback path is exercised by forcing a refused name.
- [ ] Save on iOS: the share sheet appears, dismissing it produces no error toast, Save to Files works.
- [ ] Microphone: grant, deny, deny twice on Android, and a managed-device restriction. The demonstration runs
      in every denied state.
- [ ] Airplane mode: the editor, Recent, Saved and Examples all work; the Community tab says so in its own
      words; the share offers the image and explains the link.
- [ ] Back and gestures on Android: back from every depth ends at `minimizeApp()`; a pan started in the 20 dp
      edge strip never fights the system.
- [ ] Memory and thermals: a 4096 x 4096 export twice in a row, then an hour of editing, watching for a
      device-loss reload.
- [ ] Battery and heat on Maximum render quality for ten minutes, to check that the Balanced default is the
      right default.
- [ ] Screenshots for the store, taken on the 13 inch iPad and a phone, with the rename already landed.

### Page and plan upkeep

- [ ] Rebuild the showcase page whenever a screen changes: `node lumen-native/assemble.mjs` from
      `gallery-viewer/`. It refuses to write a page with an unfilled section, an unresolvable image, a badge
      that disagrees with its score vector, an emoji, an unbalanced tag or an external request.
- [ ] Keep the first-run rollup honest: seven frames, currently 170 of 210, a mean of 24.3/30. The one item
      averaging under 1 across the run is **14, a thing worth sharing**, at 0.6 — because nothing in the first
      run produces a file until the shutter. The fix is to put the shutter earlier, not to add a panel.
