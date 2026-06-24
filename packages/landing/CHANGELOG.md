# Changelog — Chaos Master landing

Versioned independently from the app. Tag a release as `vA.B.C-web` (e.g.
`v0.1.0-web`) to deploy to production via the GitHub Actions workflow; pushes to
`main` that touch this package auto-deploy to the dev environment.

This file is internal (not surfaced anywhere on the site).

## [0.1.0] — 2026-06-25

Initial marketing landing page (`about.chaos-master.com`) for the Chaos Master
WebGPU IFS flame generator.

### Live rendering

- Real-time GPU flames using the **app's actual renderer** (Flam3 / AutoCanvas /
  WheelZoomCamera), not a custom one — hero, gallery, community cards, and an
  interactive Studio demo.
- **Static-poster fallback** ("live by default, poster on failure"): every flame
  has a high-res poster rendered from the real renderer; shown when WebGPU is
  unavailable or the GPU device is lost. Posters generated via a headed-Playwright
  capture harness (`scripts/capture-posters.mjs`).
- **Device-tiered point budget** (`pointCountPerBatch`): 1e5 on mobile / 1e6 on
  desktop, for smooth motion without OOM. Off-screen flames unmount to bound
  concurrent GPU contexts.

### Interactivity

- Hero: live flame with cursor parallax + scroll drift.
- Gallery: hover-tilt plates; the 3D Shells plate spins (hover / tap) with
  drag-orbit + pinch-zoom.
- Community 3D cards (Enchanted Rose, Earth Flame): drag-orbit, pinch-zoom,
  hover-spin (desktop) / tap-to-toggle-spin (touch).
- Studio "the math, live": scrubbable affine transforms, drag-pan + pinch/scroll
  zoom on the viewport, and an "animate" button that morphs the flame.
- **Explore Earth Flame** modal: 6 palette variants with a poster-thumbnail
  switcher and an auto-play that morphs between them.
- "Open in Chaos Master" share links on every flame.

### Content & assets

- IFS-inspired SVG favicon + nav brand mark; footer with app icon set.
- New app variations used by the landing's Earth Flame: `sphere3D`, `starfield3D`.
- Landing-only flame overrides (camera / grade) that leave the shared app
  examples untouched (`overrideFlame`).

### Mobile / touch

- HTTPS dev server (basic-ssl) so phones get a secure context (WebGPU requires
  one) + a scannable QR on `pnpm start`.
- Touch: pinch-zoom (iOS-safe), tap-to-spin, Android-robust affine scrubbing.
- Dev-only remote console piping to the dev terminal (`PUBLIC_REMOTE_LOG`).

### Deploy

- Cloudflare static-assets workers: prod `about.chaos-master.com`, dev
  `about.dev.chaos-master.com`.
- GitHub Actions: prod on a `vA.B.C-web` tag, dev on `main` pushes touching the
  landing package.
