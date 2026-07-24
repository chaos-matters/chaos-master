# Changelog — Chaos Master landing

Versioned independently from the app. Tag a release as `vA.B.C-web` (e.g.
`v0.1.0-web`) to deploy to production via the GitHub Actions workflow; pushes to
`main` that touch this package auto-deploy to the dev environment.

This file is internal (not surfaced anywhere on the site).

## [0.1.3] — 2026-07-24

### Analytics

- **GA4** wired into the base layout (`PUBLIC_GA_ID`, committed default in
  `.env`): gtag snippet plus a `click_launch_app` event for CTA clicks through
  to the app, matched on the `lumenapeiron.com` hostname so in-page nav clicks
  (`#features`, `#gallery`, …) don't count as conversions.

### Maintenance

- **astro** bumped `^5.6.1` → `^5.18.2` — aligns the manifest with the version
  the lockfile already resolves and clears the Dependabot alerts.
- Legacy `about.chaos-master.com` route dropped from `wrangler.jsonc` after
  the zone redirect cutover.

## [0.1.2] — 2026-07-17

### Rebrand

- The site is now **Lumen Apeiron** (formerly Chaos Master): wordmark, hero
  lede, CTAs, gallery kicker, and "Open in…" labels renamed; app links point at
  `lumenapeiron.com` and the site moves to `about.lumenapeiron.com` (`astro.config`
  `site`, `wrangler.jsonc` custom domains — the legacy `about.chaos-master.com`
  route stays bound until the zone redirect flips).
- **SEO/OG baseline**: canonical URLs, `robots.txt` + `sitemap.xml`, landscape
  branded `og-cover.jpg` (2400×1260) with dimensions/alt/site_name —
  regenerable via `scripts/generate-og-cover.mjs`.

### Features section

- **Audio flames**, **Flame genetics**, and **Sonification** promoted from
  "coming soon" to the shipped grid (now a full 3×3) with new stroke-style SVG
  icons (lineage motif, speaker-wave).
- **Fractal Universe** added to the "On the horizon" row (ringed-planet icon),
  alongside VR fractal worlds, Flame games, and Server-side HQ render.

## [0.1.1] — 2026-06-26

### Studio

- **Animate** now rolls a non-repeating random preset (die icon) with two new
  moves.
- Transform **probability** and **variation weights** are scrubbable like the
  affine coefficients; probability shows its normalized share, and reset restores
  all of them.
- **Open in Chaos Master** button encodes the live Studio flame into the app's
  `?flame=` link.

### Changed

- **Footer version pill**: version + commit-sha chip mirroring the app.
- **Static-preview notice**: a subtle chip explains when previews are stills (no
  WebGPU / GPU device-loss) so the page doesn't read as frozen.
- Community lede reworded to mention custom variations; redundant license line
  dropped.

### Fixed

- **Enchanted Rose** now renders the app's `example34` (red rose) instead of the
  unrelated yellow `example44` — colour / grade match the app, poster
  regenerated, `example34` camera descriptor restored, and `cliffordCsch2` author
  corrected (`deluksic` → `unknown`).

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
