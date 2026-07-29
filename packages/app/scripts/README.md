# App scripts

Node tooling for the app package. Run everything from `packages/app`.

| Script                                      | What it does                                                |
| ------------------------------------------- | ----------------------------------------------------------- |
| `gallery-admin.mjs`                         | JSON-in/JSON-out front door for all gallery content edits.  |
| `gallery-targets.mjs`                       | What `local` / `dev` / `prod` mean, for all four scripts.   |
| `seed-gallery.mjs`                          | Writes the Home gallery's curated rows into D1.             |
| `capture-gallery-posters.mjs`               | Renders a still poster for every gallery row.               |
| `upload-gallery-posters.mjs`                | Uploads those posters to R2 and points the D1 rows at them. |
| `extract-flames.mjs`                        | Pulls flame descriptors out of existing artwork.            |
| `poster-capture.html` + `posterCapture.tsx` | Dev-only render surface the capture script drives.          |

## Environments

`--env` takes three values, and every script above agrees on what they mean
because they all read `gallery-targets.mjs`:

| `--env` | Database                   | Bucket                       | Storage             |
| ------- | -------------------------- | ---------------------------- | ------------------- |
| `local` | `chaos-master-content-dev` | `chaos-master-og-images-dev` | `--local --env dev` |
| `dev`   | `chaos-master-content-dev` | `chaos-master-og-images-dev` | `--remote`          |
| `prod`  | `chaos-master-content`     | `chaos-master-og-images`     | `--remote`          |

**`local` is not a third database.** It is the dev database and the dev bucket
addressed through wrangler's own local (miniflare) storage under
`packages/app/.wrangler`, so it needs `--env dev` as well as `--local`:
miniflare resolves a store from the _binding_ in `wrangler.jsonc`, and the
top-level config declares none.

`local` is the **default** everywhere. Curating content and looking at the
result should reach nobody, so both deployed targets are a deliberate choice —
and `prod` needs `--confirm prod` on top of `--env prod` in `gallery-admin`.

Because `local` and `dev` share a database _name_, every JSON result carries
`storage` (`local` or `remote`) next to `env` and `database`. The name alone
cannot tell the two apart.

A local store starts with no tables. `gallery-admin` applies
`migrations/0001_gallery_content.sql` itself the first time it finds
`gallery_items` missing on a local target (and says so, with
`"initialized": true` in the result); `seed-gallery.mjs --apply local` does the
same before seeding. Remote targets never get schema written to them
automatically — there, a missing table means something is wrong, and the error
names the exact command instead.

## gallery-admin

One entry point for curating Home, so the same operations work from a terminal
and from a local admin console shelling out to it. Every run prints a single
JSON object on stdout and human progress on stderr.

```sh
node scripts/gallery-admin.mjs list                      # local, by default
node scripts/gallery-admin.mjs inspect --file shot.png   # writes nothing
node scripts/gallery-admin.mjs put --file shot.png --section gallery
node scripts/gallery-admin.mjs capture --all-missing
node scripts/gallery-admin.mjs publish --slug shot --published 1
node scripts/gallery-admin.mjs reorder --slug shot --order 2
node scripts/gallery-admin.mjs list --env dev            # the deployed dev row set
node scripts/gallery-admin.mjs <command> --help
```

Three rules it will not bend:

- **`--env` defaults to local**, and prod needs `--confirm prod` on top of
  `--env prod`. The console it serves defaults to prod elsewhere; a content
  tool inheriting that default publishes to production by accident eventually.
- **`put` stages, it never publishes.** The row lands with `published = 0` and
  `poster_key = NULL`, so going live is always a separate `publish` call.
- **There is no delete.** `publish --published 0` is the reversible
  alternative, and it is enough.

A flame that references a custom variation without carrying its definition is
refused: `gallery_items` has nowhere to put the WGSL, so it would render as the
identity fallback rather than the picture that was exported. Four of the 59
flames in the existing export collection are like this.

`capture` needs the dev server, because posters come from the real renderer. If
`/scripts/poster-capture.html` does not answer it starts
`pnpm --filter chaos-master start` on the port from `--base` (with
`--strictPort`), waits for the page, and stops the server again when it is
done. `--no-serve` turns that off and fails immediately with the command to
run. It passes `--include-unpublished` to the capture step so a staged row can
get its poster before it goes live.

## The gallery poster pipeline

Home renders every gallery flame live on the GPU. A **poster** is the still that
stands in for the live canvas: for visitors whose browser has no WebGPU, and for
everyone during the second or two before a flame converges.

The pipeline is two steps, and both read the same D1 rows Home reads — so a
poster is never out of sync with the artwork it stands in for.

```
gallery_items (D1)  ->  capture-gallery-posters.mjs  ->  *.webp + manifest.json
                                                              |
                     upload-gallery-posters.mjs  <------------+
                                |
                    R2 gallery/<slug>-<hash>.webp  +  poster_key on the row
```

### 1. Start the dev server

```sh
cd packages/app
pnpm start          # HTTPS (self-signed) on https://localhost:5173
```

The capture script drives the dev-only page at
`/scripts/poster-capture.html`, so the dev server has to be running. It does
**not** need `wrangler dev`: rows are read straight out of D1 with
`wrangler d1 execute`, not through the Worker's API.

**Home itself does need `wrangler dev`.** Vite proxies `/api` to `:8787`, so to
see what a `--env local` run produced, run both:

```sh
pnpm --filter chaos-master start    # the app on https://localhost:5173
pnpm wr-dev                         # wrangler dev --env dev, /api on :8787
```

`wrangler dev --env dev` binds the same local D1 and R2 the `local` target
writes, so Home renders exactly the rows you just staged and serves posters
straight out of the local bucket. Restart it after wiping local state — it
holds its store open and will not pick a recreated one up.

### 2. Capture

```sh
node scripts/capture-gallery-posters.mjs                    # every published local row
node scripts/capture-gallery-posters.mjs --slug first-light,camera-pan
node scripts/capture-gallery-posters.mjs --env dev          # the deployed dev rows
node scripts/capture-gallery-posters.mjs --help             # all options
```

Output goes to `assets/local/gallery-posters/` (gitignored) as
`<slug>.webp` plus a `manifest.json` the upload step reads. `--out <dir>`
puts it somewhere else. Re-capturing a few slugs merges into the existing
manifest rather than replacing it.

Defaults: **1600x900 WEBP**, encoder quality 0.9, convergence target 0.97.

### 3. Upload and publish

```sh
node scripts/upload-gallery-posters.mjs --dry-run    # print every command first
node scripts/upload-gallery-posters.mjs             # local, by default
node scripts/upload-gallery-posters.mjs --env dev
node scripts/upload-gallery-posters.mjs --env prod
```

Posters go into the **existing** og-images bucket
(`chaos-master-og-images-dev` / `chaos-master-og-images`) under a `gallery/`
prefix — no new bucket. The script then sets `poster_key`, `poster_width` and
`poster_height` on each row in one batched `wrangler d1 execute` run.

Both halves follow `--env` together. A `local` run puts the object into the
local bucket and the `poster_key` into the local database, so a local row can
never point at an object only the deployed bucket has.

`poster_key` is stored **without** the `gallery/` prefix; the Worker adds it
when serving `/api/gallery/poster/<poster_key>`.

## Why it has to be headed

The capture script launches a **headed** Chromium. Headless Chromium has no
usable WebGPU on this machine, and the failure is silent — the page mounts, the
canvas exists, and every poster comes out black. Headed hits the real GPU. The
same constraint drives `playwright.resilience.config.ts` and the landing
package's `capture-posters.mjs`.

As a backstop the capture page decodes each encoded poster and reports its peak
channel value; the script fails the row rather than writing a black image. The
same probe reports the mean saturation of the lit pixels, logged per row and
recorded in the manifest — a poster of a colourful flame that comes back near
zero has lost its colour somewhere, which is invisible in a byte count.

## Decisions worth knowing

**WEBP, not JPEG.** These are 1600x900 fractals — large, smooth gradients over
black, the exact case where WEBP's compression wins hardest. Real numbers from
the seeded gallery: 18-163 KiB per poster, ~35% below JPEG at matching visual
quality. `--format jpeg` is there if something downstream ever needs it.

**16:9, not square.** `Camera2D` fixes the vertical extent and widens
horizontally with the aspect ratio, so a square capture _crops_ a composition
authored in the app's landscape viewport. 16:9 shows all of it, and a squarer
plate can always crop a wide poster in CSS. `--aspect 1:1` (or any `w:h`)
overrides.

**Animated rows are sampled at 35% of the timeline — unless that frame is
desaturated.** Frame 0 is the rest pose: for a camera pan or a morph it is the
least interesting frame there is, and often identical to another row's still. A
third of the way in has the motion underway. But a timeline animates the _look_
as freely as the shape, and `vibrancy` multiplies OkLab chroma outright in the
colour-grading pass, so a blind fraction can land at the bottom of a vibrancy
dip and poster a warm gold flame as grey-on-black (`depth-of-color` did exactly
that at frame 31 of 90, where its timeline holds vibrancy at 0.15 against a
stored 0.5). When the sampled frame resolves below the flame's stored vibrancy,
the capture page slides to the nearest frame where it is back at or above it —
still a real frame, still away from the rest pose. Rows that do not animate
vibrancy resolve to the stored value everywhere and never move.
`--frame-fraction` changes the ratio, `--frame <n>` pins an exact frame and
skips the check.

**Convergence is the app's own export gate.** The capture page renders with
`Flam3`'s `exportDriver` and only hands the image back when `finalImageReady`
is true — the same signal the PNG export waits for. Verified: a capture at
quality 0.995 is pixel-for-pixel equivalent to one at the 0.97 default, while
0.85 is visibly noisier (and compresses ~20% worse).

**The keys are content-hashed.** `gallery/<slug>-<sha256-8>.webp`. The Worker
serves posters `immutable`, so a re-capture must land on a new key instead of
needing a cache purge. Identical bytes always resolve to the same key, so
re-running the upload after an unchanged capture is a no-op.

## The dev-only capture page

`poster-capture.html` and `posterCapture.tsx` live in `scripts/` on purpose.
Vite's build input is `index.html` alone, so nothing here is bundled or copied
into `dist/` — the page cannot ship to production. The dev server still serves
it at `/scripts/poster-capture.html`, which is all the driver needs.

It exposes `window.__posterCapture` with `load(spec)`, `status()` and `take()`.
The driver injects the row's flame through `page.evaluate` rather than a
`?flame=` share link: a descriptor is 2-3 KB of JSON and animated rows carry a
timeline on top, and injection has no URL length limit and no encode/decode
round-trip to go wrong.
