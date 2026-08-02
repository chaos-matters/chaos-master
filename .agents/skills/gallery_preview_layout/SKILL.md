---
name: gallery-preview-layout-cross-browser
description: 'Rules for variation/preview galleries in this SolidJS + WebGPU app — cross-browser (Chrome/Firefox) CSS tile sizing & scrollbars, and visibility-gated preview mounting so off-screen tiles never spawn GPU canvases. Trigger whenever editing a gallery/preview grid (QuickVariationPicker, VariationSelector, FlameRandomizerCard/GalleryGrid) or any WebGPU canvas preview.'
---

# Gallery & Preview Layout (Chrome + Firefox)

Hard-won rules for the variation/preview galleries (`QuickVariationPicker`,
`VariationSelector`, `FlameRandomizerCard/GalleryGrid`). These bugs are
**browser-specific** and several past attempts regressed one browser while
fixing the other. Always verify in **both** Chrome and Firefox.

## 1. Tile aspect ratio: use `padding-bottom: %`, NOT `aspect-ratio`

Preview tiles are grid items whose only children are absolutely-positioned (the
preview canvas/poster via `position:absolute; inset:0`, plus an absolute label).
That means the tile has **no in-flow content height**.

- ✅ `padding-bottom: 56.25%` (for 16:9) — contributes a _real_ box height that
  the auto grid row tracks, so tiles sit cleanly one after another.
- ❌ `aspect-ratio: 16 / 9` — a grid item sized only by `aspect-ratio` with no
  in-flow content **does not size its auto grid row**. The tile renders at the
  aspect height but the row collapses toward `min-content`/`min-height`, so each
  tile **overflows its row and overlaps the next** (~40% overlap) in _both_
  Chrome and Firefox. This looks like "half the tiles on top of each other".

The proven pattern is the `VariationSelector` `.item` and the randomizer needs
the same care. If you ever see tile overlap, check for `aspect-ratio` on a grid
item with absolute-only children.

## 2. Add a `min-height` floor (Firefox device-loss squeeze)

`box-sizing: border-box` is global (`packages/app/src/styles/preflight.css`), so
`min-height` does **not** stack with `padding-bottom` — the floor only applies
when the padding-derived height drops below it.

```css
.galleryItem {
  position: relative;
  overflow: hidden;
  width: 100%;
  padding-bottom: 56.25%; /* 16:9 — sizes the grid row (see §1) */
  min-height: 64px; /* floor — see below */
}
```

Why the floor: on Firefox, when the GPU device is lost (a large live gallery can
OOM the GPU on Linux/AMD), the teardown **reflow drops the resolved percentage
`padding-bottom` to ~0** on these `<button>` tiles, collapsing them to nothing so
their absolute labels pile into an unreadable stack. The `min-height` floor makes
that impossible. Without the gating in §3 the device-loss happens in the first
place — do both.

## 3. Visibility-gate preview MOUNTING — never render off-screen tiles

A gallery can hold ~800 variation tiles. Mounting a live WebGPU preview per tile
spawns ~800 canvases/contexts and OOM-crashes the GPU (Firefox/Linux/AMD →
device lost → §2 squeeze). The tile `<button>` must always be in the DOM (for
scroll height), but its **preview must mount only while the tile is on/near
screen**, and unmount when scrolled away.

Use `createSharedIntersectionObserver` (`@/utils/useIntersectionObserver`) — one
observer for the whole gallery, **rooted on the scroll container** (a viewport
root can't preload rows past the fold because the inner scroll clips them first):

```tsx
const [listEl, setListEl] = createSignal<HTMLDivElement>()
const trackVisibility = createSharedIntersectionObserver(listEl, {
  rootMargin: '300px', // preload a few rows past the fold
})
// ...
<div class={ui.galleryList} ref={setListEl}>
  <For each={types}>{(type) => {
    const [tileEl, setTileEl] = createSignal<HTMLElement>()
    const near = trackVisibility(tileEl)
    return (
      <button ref={setTileEl} class={ui.galleryItem}>
        <Show when={near() && flame()} keyed>
          {(f) => <div class={ui.galleryCanvas}><VariationPreview flame={f} .../></div>}
        </Show>
        <div class={ui.galleryItemName}>{name}</div>
      </button>
    )
  }}</For>
</div>
```

Do **not** mount all previews via a time-based `DelayedShow` stagger — it still
mounts every preview (just spread over seconds). Result with gating: ~20-30 live
previews at any scroll position instead of 800. `ComputeGate` (capacity 2,
`COMPUTE_GATE_CAPACITY`) additionally throttles concurrent renders, and
`VariationPreview` snapshots to a static `<img>` and frees its canvas when done.

**Also debounce on scroll.** Mounting a canvas the instant a tile intersects
means fast/jerky scrolling flickers hundreds of tiles through the viewport, each
allocating a canvas that's torn down before it can snapshot — the abandoned
buffers (freed only after pending GPU work finishes) pile up and balloon VRAM
into the tens of GB. Gate canvas mounting on _settled_ visibility:
`settledVisible = isVisible() && !useIsScrolling()` (the global debounced
`@/utils/isScrolling`). While scrolling, mount nothing new; ~180ms after the last
scroll, the visible window mounts and renders. Tiles that already snapshotted keep
their static `<img>` throughout, so the gallery doesn't flash. This is what makes
heavy scrolling smooth and keeps VRAM bounded. The debug panel's "live previews"
and "MiB GPU buffers" rows (see `vramLog.ts`) are the way to watch it.

## 4. Scrollbar gutter (Firefox overlay scrollbars)

Firefox (esp. Linux/GTK) uses overlay/auto scrollbars that **overlap content**,
so gallery tiles slide under the scrollbar (Chrome reserves space, so it looks
fine there). **`scrollbar-gutter: stable` is a no-op under overlay scrollbars** —
it only reserves space for classic scrollbars, so it does NOT fix Firefox here.
Reserve a real **`padding-right`** gutter instead; it clears the bar for both
overlay and classic scrollbars:

```css
.galleryGrid {
  overflow-y: auto;
  padding-right: 0.6rem; /* real gutter — survives FF overlay scrollbars */
  scrollbar-width: thin;
  scrollbar-color: var(--neutral-300) transparent;
}
```

Watch grids with `grid-template-columns: repeat(auto-fill, minmax(..., 1fr))`:
the last column expands to fill and is the one that ends up under the bar. The
`padding-right` shrinks the track area so it fits clear of the scrollbar.

## 5. Verifying cross-browser (don't trust one engine)

> **HARD LIMIT — a browser left open on a live gallery can take down the
> machine.** This has happened three times on this workstation, once reaching
> ~60 GB RSS. The gallery is the worst page to leak a browser on, and the
> measurement technique is itself the amplifier:
>
> - measuring live plates means calling `__chaosHomeNoFreeze()`, which disables
>   freeze-to-poster — the one control that bounds memory. Every plate then
>   stays live forever;
> - if the browser launched **without** the WebGPU flags below, `navigator.gpu`
>   is absent and rendering silently falls back to llvmpipe/swiftshader, which
>   allocates in **host RAM instead of VRAM**. Many live fractal canvases times
>   software rendering times a browser nobody closed is how you get to tens of
>   GB.
>
> Therefore, non-negotiable:
>
> 1. **One browser at a time, always closed in a `finally`.** Never launch a
>    second before the first is closed. Verify with `pgrep -c chrome` after.
> 2. **Wrap every browser script in a shell-level timeout** (`timeout 300 node
…`) so a hang cannot outlive its purpose.
> 3. **`__chaosHomeNoFreeze()` is for a single bounded measurement only** —
>    take the number, close the browser. Never leave a session running with it
>    on, and never combine it with a long scroll loop.
> 4. **Assert the adapter before measuring** (recipe below). No adapter means
>    you are on CPU rendering: close it and fix the flags rather than
>    continuing — the numbers would be meaningless AND dangerous.
> 5. **Vitest never fans out here**: `--maxWorkers=1`. The default forks one
>    worker per core at ~2 GB each with this module graph.
>
> Delegating this work to a subagent does not relax any of the above; if
> anything, hold a subagent to launching **zero** browsers and do the browser
> pass yourself.

- **Chrome is the gate; Firefox is the second opinion.** Chrome must work; the
  Firefox-specific rules above (§2 squeeze, §4 gutter) are why you still check
  Gecko, but a Chrome regression is the one that ships.

- **Launching real Chrome with a real GPU.** This exact recipe matters — get it
  wrong and WebGPU is silently absent, `requestAdapter()` returns nothing, the
  app falls back to posters, and the run _looks_ like the live path is broken
  when it was never exercised:

  ```js
  const browser = await chromium.launch({
    channel: 'chrome', // the installed google-chrome-stable, NOT bundled chromium
    headless: false, // headless has no usable navigator.gpu on this machine
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--ignore-gpu-blocklist',
    ],
  })
  ```

  Confirm you actually got the GPU before trusting any measurement:

  ```js
  const a = await navigator.gpu?.requestAdapter()
  a?.info // expect e.g. { vendor: 'amd', architecture: 'rdna-4' }, not undefined
  ```

  Do **not** copy the flags out of `playwright.config.ts` for this: those are
  `--enable-unsafe-swiftshader --use-angle=swiftshader-webgl`, deliberately
  _software_ rendering so CI is deterministic. They will happily render without
  touching the GPU, which is the opposite of what a GPU verification needs.

- Also seed `localStorage` `chaos-master-welcome-dismissed=true` and pass
  `ignoreHTTPSErrors` (the dev server is HTTPS).
- **Playwright bundles _stable_ Firefox**, which has weak/no WebGPU on Linux. It
  is fine for **layout** (same Gecko engine) but cannot exercise the
  **live-WebGPU → device-loss** path. Use **Firefox Nightly** (real WebGPU +
  AMD) for that; Playwright cannot drive Nightly, so confirm that path manually.
- **Measure positions, not just sizes.** A tile can have the right _height_ yet
  still overlap the next row. Check `getBoundingClientRect().top/bottom` of
  consecutive same-column tiles (overlap = `next.top < cur.bottom`). Verifying
  only height is how the `aspect-ratio` overlap (§1) slipped through once.
- For tricky CSS, build an isolated **mock HTML** replicating the exact DOM/CSS
  and open it in both engines to bisect which property matters, before touching
  the app.
