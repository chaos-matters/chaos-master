# WebGPU Resilience — Test Plan

How we verify the graceful-fallback handling (degraded shell + preview posters
when the GPU device is lost). Companion to `docs/audit/webgpu-firefox-*.md`.

## Two layers

| Layer     | Browser                      | What it proves                                                                 | How                                               |
| --------- | ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| Automated | Chromium (headed + headless) | App logic: posters swap in, loops stop, shell stays usable, no spiral, no hang | `playwright.resilience.config.ts`                 |
| Manual    | **Firefox Nightly / RDNA4**  | The REAL crash path (driver OOM / GPU-process death) is survived               | `e2e/firefox/launch-nightly.sh` + checklist below |

Playwright cannot drive Firefox Nightly (it only automates its own patched
Firefox build), and Chromium does not reproduce the RDNA4 crash — so the real
hardware path must be checked by hand.

## Automated (Chromium)

```bash
# dev server must be running on https://localhost:5173 (pnpm --filter chaos-master start)
# if Vite falls forward, set PLAYWRIGHT_BASE_URL to the printed origin
pnpm exec playwright test -c playwright.resilience.config.ts                       # both projects
pnpm exec playwright test -c playwright.resilience.config.ts --project chromium-gpu       # headed, real GPU
pnpm exec playwright test -c playwright.resilience.config.ts --project chromium-degraded  # headless, no WebGPU
```

- **chromium-gpu** (headed, AMD GPU): healthy render → force a device loss via
  `window.__chaosForceGpuUnavailable()` → asserts posters appear, live canvases
  tear down, shell controls stay present, console errors plateau (no spiral),
  incl. the variation gallery (~19 previews) and a window-resize storm.
- **chromium-degraded** (headless, no adapter): asserts the app does NOT hang
  (init timeout), comes up in the degraded shell, and shows posters.

`window.__chaosForceGpuUnavailable()` is a DEV-only console hook (stripped from
prod) to flip the session to `unavailable` without a real crash.

## Manual — Firefox Nightly (the real crash path)

Always FULL-CLOSE Firefox Nightly between runs (a prior hard crash leaves
`requestAdapter()` returning null until restart):

```bash
cd packages/app
./e2e/firefox/launch-nightly.sh                 # full-close + launch (X11) -> dev server
./e2e/firefox/launch-nightly.sh --close         # just close
MOZ_LOG_WEBGPU=1 ./e2e/firefox/launch-nightly.sh   # with WebGPU logging
```

### Checklist — run each, note PASS / FAIL + console

1. **Cold load (healthy)** — app loads, main flame renders. _Pass:_ flame
   renders or, if the GPU is already bad, the degraded shell + posters appear
   (NOT a blank/hung page).
2. **Cold load (crashed GPU)** — if it crashes on first paint: previews show
   "WebGPU preview unavailable" posters, the UI (sidebar, About, Help, Docs) is
   navigable, console shows "Reload the page to recover", no error flood.
3. **Welcome screen + hardware-tier detection** — clear site data first. Welcome
   shows; entering runs the benchmark. _Pass:_ completes (or short-circuits to a
   safe tier on a bad GPU) within a few seconds — never hangs ~14s.
4. **Main editor + sidebar variation list** — open a transform's variations.
   _Pass:_ small previews render; on a loss they all become posters at once.
5. **Variation gallery scroll** (the known crasher) — Add variation → open full
   browser → scroll through all previews. _Pass on crash:_ every preview tile
   becomes a poster, the page stays responsive, no unbounded error flood.
6. **Window resize storm** — toggle fullscreen / drag-resize repeatedly (known
   to corrupt Firefox state via canvas-size recompute). _Pass:_ survives, or
   degrades to posters — not a hard hang.
7. **Reload after a hard crash** — Ctrl+R once the GPU process is dead. _Pass:_
   degraded shell renders within ~8s (init timeout) with a clear message; it
   will NOT render flames until the browser is fully restarted (a Firefox/wgpu
   limitation, not the app — see audit).

### Report format per failing case

- Scenario # and step, what you saw vs. expected, the console tail, and whether
  the page was responsive / reloadable / needed a full browser restart.

## Notes / gotchas

- `.env.local` may override point counts to `1e6` (10× the shipped `1e5`); that
  is a deliberate stress config and makes the gallery crash far more readily on
  RDNA4. Test both `1e6` (stress the fallback) and `1e5` (what users actually get).
- `VITE_TRACK_PERFORMANCE` must stay `false` on Firefox/Linux (timestamp-query
  crashes GFX1201 — audit Bug 4).
