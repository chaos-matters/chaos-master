# Gallery admin — editing Home content by drag and drop

Status: **planning**. No implementation yet.
Captured 2026-07-29.

## The ask

Curating Home currently means running CLI scripts. Instead: drop a PNG or JSON
into the launch console (`~/.dotfiles/personal/irchiinnuss/companyReportViewer`)
and have it become a gallery item in dev or prod.

## First, the thing that is easy to get wrong

**This is not an "upload to R2" feature.** R2 is one leg of three. A gallery
item is:

1. a **row in D1** — the `FlameDescriptor` JSON, its title, section, ordering;
2. a **poster in R2** — the still shown to visitors without WebGPU;
3. a **render** — which only a GPU-capable browser can produce.

A dropped PNG already contains (1): the app's exports embed the descriptor in a
zlib `zTXt` chunk keyed `FlameJson`, and `packages/app/scripts/extract-flames.mjs`
already reads it. The dropped PNG is _not_ usable as (2) — app exports are
full-resolution multi-megabyte stills, whereas posters are 1600x900 WEBP at
~60 KiB, content-hashed, and captured through the convergence gate.

So the honest shape is: **the drop gives us the flame; the poster still has to
be rendered.** Any design that skips that produces a gallery whose fallback
images are 3 MB PNGs.

## Cloudflare setup needed: none

Both buckets already exist and are already bound in `packages/app/wrangler.jsonc`
for prod, dev and preview:

| Bucket                       | Used by                                           |
| ---------------------------- | ------------------------------------------------- |
| `chaos-master-og-images`     | prod OG previews **and** posters under `gallery/` |
| `chaos-master-og-images-dev` | the same, for dev                                 |

Nothing to create or configure. The only outstanding actions are script runs,
not Cloudflare config: upload prod posters and seed prod D1 when Home ships.

_Worth deciding later:_ posters share the OG bucket under a `gallery/` prefix.
That was the cheap choice (binding already present in every env). A dedicated
`chaos-master-content-assets` bucket would separate lifecycle and make a bulk
purge safe, at the cost of a new binding in three environments.

## How the console already works

Worth following rather than inventing, because the existing patterns are good:

- **Loopback only** — `127.0.0.1:4317`. Not exposed, no auth layer, and it
  should stay that way.
- **The server never touches cloud APIs.** Every mutation shells out to a
  script (`runScript` → `spawn('bash', ...)`), which is the single source of
  truth. `serve.mjs` only validates, spawns and reports.
- **Guarded writes carry a typed confirmation** through the request
  (`confirm=credits`), are re-validated argument by argument server-side, and
  are re-validated again inside the script. A stray curl without the token is
  a 400.
- **Every mutation is appended to an audit log** (`appendLog` →
  `data/refresh-log.jsonl`).
- **Multi-product** via `?product=chaosmaster`, with a per-product module
  (`product-chaosmaster.js`) and a registry entry in `PRODUCTS`.

One sharp edge to respect: `env` resolves as `q.get('env') === 'dev' ? 'dev'
: 'prod'` — **prod is the default**. A content tool that inherits that default
will eventually publish something to production by accident. Invert it here:
default to dev, and require the typed confirmation specifically to touch prod.

## Proposed shape

### A canonical script in the product repo

`packages/app/scripts/gallery-admin.mjs`, JSON in / JSON out, alongside the
existing `extract-flames`, `seed-gallery` and `upload-gallery-posters`. It owns
every mutation so the console stays a thin client, and so the same operations
remain available from a terminal.

```
gallery-admin.mjs list      --env dev|prod
gallery-admin.mjs inspect   --file <png|json>          # extract, validate, no writes
gallery-admin.mjs put       --env … --slug … --section … --file … [--title …]
gallery-admin.mjs publish   --env … --slug … --published 0|1
gallery-admin.mjs reorder   --env … --slug … --order N
gallery-admin.mjs delete    --env … --slug … --yes
```

`put` is the interesting one, and it is a pipeline:

1. extract + structurally validate the descriptor (reuse `extract-flames.mjs`);
2. reject anything referencing custom variations whose definitions are absent —
   4 of the 59 flames in the existing collection have exactly this problem and
   would render wrong;
3. write the row to D1 (upsert on slug, as `seed-gallery.mjs` already does);
4. mark the row `published = 0` and `poster_key = NULL`.

Note what step 4 means: **`put` alone never makes something live.** It stages.

### The poster step stays separate

Poster capture needs a GPU browser, so it cannot happen inside `serve.mjs`.
Two options, in order of preference:

- **Console triggers the existing capture** — a "Capture posters" action that
  runs `capture-gallery-posters.mjs` + `upload-gallery-posters.mjs` for the
  staged slugs, streaming progress back the way `/api/refresh` already streams
  script output. Needs the app dev server running; the console can detect that
  and say so plainly rather than failing obscurely.
- **Capture in the browser that is already open** — the console page itself
  renders the flame in a hidden canvas. Rejected for now: it duplicates the
  convergence gate and the WEBP encoding that the capture script already gets
  right, including the Chromium quirk where `drawImage()` from a WebGPU canvas
  reads back black while `toBlob()` on the same canvas is correct.

### The console side

A **Content** panel in `product-chaosmaster.js`:

- a drop zone (PNG/JSON, multiple), each dropped file previewed with what was
  extracted — title, transform count, 2D/3D, animation, warnings — _before_
  anything is written;
- per-file: section, slug (auto-derived, editable), title, caption;
- an environment switch defaulting to **dev**;
- the current gallery listed by section, showing `published` and whether a
  poster exists, with reorder and unpublish;
- "Capture posters" for anything missing one;
- "Publish to prod" as a distinct, typed-confirmation action.

New endpoints in `serve.mjs`, mirroring the credits pattern exactly:
`/api/gallery/list`, `/api/gallery/inspect`, `/api/gallery/put`,
`/api/gallery/publish`, `/api/gallery/posters`. All mutations logged through
`appendLog`.

## Risks

- **Accidental prod writes.** Mitigated by inverting the env default and
  reusing the typed-confirmation gate. This is the main one.
- **Uploading a source PNG as a poster.** Guard in the script: refuse a poster
  that is not the expected format/size, rather than trusting the caller.
- **Bad content reaching a live page.** Mitigated by `put` staging with
  `published = 0`, so publishing is always a separate deliberate act.
- **Cross-repo coupling.** The console would call scripts in the chaos-master
  repo. Follow the existing convention: a path constant overridable by env var
  (`CHAOS_MASTER_REPORT_SH` does this today).
- **Descriptor drift.** Content written today must still parse after a schema
  change. The app already validates on read and Home tolerates unknown
  sections; worth an explicit note that `gallery-admin.mjs` validates against
  the _current_ schema and stored rows may predate it.

## Sequencing

1. `gallery-admin.mjs` with `list` / `inspect` — read-only, useful immediately,
   and it proves the extraction path against real files.
2. `put` + `publish`, terminal only. Content management is fully working here;
   everything after is ergonomics.
3. Console Content panel: list, drop, inspect, stage to dev.
4. Poster capture triggered from the console.
5. Prod publish with the typed-confirmation gate.

## Decisions taken

- **No delete.** Unpublish is reversible and is enough.
- **Capture or nothing.** No poster override; a flame that cannot be rendered
  does not become a gallery item.
- **The whole flow runs on the local machine.** The console spawns the capture,
  which drives a headed Chromium against the local GPU — the same mechanism
  used to capture the first 15 posters. Nothing renders in the cloud.

## The flow, as agreed

One guided sequence rather than a set of separate tools:

1. **Drop** a PNG or JSON into the console. It calls `inspect`, which writes
   nothing and reports what was found — title, transform count, 2D/3D,
   animation, and any blocking warning.
2. **Stage** — one button. Calls `put`, which writes the D1 row with
   `published = 0` and no poster. The item exists but is invisible.
3. **Capture** — one button. Runs the GPU capture on this machine and uploads
   the poster to R2, then records `poster_key` on the row.
4. **Publish** — one button, enabled only once a poster exists. Calls
   `publish --published 1`.

Each step is separately reversible up to publish, and nothing reaches a live
page until the last click.

### The dev-server dependency is the sharp edge

The capture page is served by the app's dev server, so step 3 cannot work in
isolation. Handled explicitly rather than left to fail with a timeout: the
capture subcommand checks whether the page is reachable and, if not, either
starts the dev server itself and waits for readiness, or exits with a JSON
error naming the exact command to run. Whichever it does, the console shows
that reason rather than a spinner.

## Where the code lives

Split so that nothing can drift:

- **`packages/app/scripts/gallery-admin.mjs`** (product repo) — every
  operation. It has to stay in step with the flame schema, the D1 migration
  and the capture page, all of which live here.
- **`chaos-master-gallery.sh`** (console) — a thin wrapper that resolves the
  repo, forwards arguments and passes JSON straight through. Repo location
  overridable via `CHAOS_MASTER_REPO`, matching the existing
  `CHAOS_MASTER_REPORT_SH` convention. It defaults to **dev**, unlike the
  reporting scripts beside it.

## Open questions

- Should posters move to their own bucket (see above)?
