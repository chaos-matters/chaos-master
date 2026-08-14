# Lumen Apeiron gallery and launch roadmap

This is the working sequence for the first polished public launch. The README
stays product-facing; implementation and curation decisions live here.

## Release sequence

### 1. Product front door

- Keep the README focused on audience, creative capability, current product
  screens, and a two-command local start.
- Regenerate all product screens with `pnpm capture:readme` after the Home
  gallery is final. The capture owns Vite, never starts Wrangler, uses one
  browser at a time, and records its source state in `docs/readme/manifest.json`.
- Prepare one short motion reel from the same final gallery: Home → edit →
  animate → share. Stills and video should show the same named works.

### 2. Rights-safe Home curation

- Start with original Lumen pieces and in-house mathematical classics.
- Add provenance to every third-party gallery row before publication:
  `artist`, `source_url`, `license`, `license_url`, `attribution`, `changes`, and
  `original_id`.
- Treat an available XML/genome or Reddit `[PI]` post as technical access, not
  reuse permission. Reddit authors retain ownership of their work under the
  [Reddit User Agreement](https://redditinc.com/policies/user-agreement).
- Prefer CC BY 4.0 or a written grant covering XML distribution, rendering,
  modification/mutation, in-app display, and promotional screenshots/video.
- Pilot Electric Sheep genomes only after checking each item's license and
  confirming promotional use with Spotworks. Free and Gold Sheep have different
  terms under the [current reuse policy](https://electricsheep.org/license/).

Suggested artist request:

> May we include this flame and its parameters in the open-source Lumen Apeiron
> gallery, let people open and remix it, and use attributed renders in the app,
> README, website, and launch posts? We can credit and link you exactly as you
> prefer. CC BY 4.0 is ideal, or you can grant those uses in writing.

### 3. Fractal Classics

Build these as deterministic, hand-authored descriptors from their standard
mathematical definitions. Do not source artwork for them.

| Preset                 | Exact construction                       | First implementation            |
| ---------------------- | ---------------------------------------- | ------------------------------- |
| Sierpiński triangle    | 3 affine maps, scale 1/2                 | Existing sample → native preset |
| Sierpiński carpet      | 8 affine maps, scale 1/3, center omitted | Native preset                   |
| Koch curve             | 4 affine similitudes, scale 1/3, ±60°    | Native preset                   |
| Barnsley fern          | 4 affine maps with weighted selection    | Native preset                   |
| Heighway dragon        | 2 affine maps                            | Native preset                   |
| Cantor dust            | 4 affine maps                            | Native preset                   |
| Sierpiński tetrahedron | 4 `linear3D` maps, scale 1/2             | Native 3D preset                |
| Menger sponge          | 20 `linear3D` maps, scale 1/3            | Native 3D preset                |

Each classic should ship as two curated entries:

- **Classic** — the canonical affine construction.
- **Flame Remix** — palette, nonlinear variations, camera, animation, or audio
  mappings layered on top, clearly labelled as an interpretation.

The current `kochVar` and `sierCarpetVar` variations are visual approximations,
not replacements for these exact multi-map presets. The bundled Sierpiński XML
already provides a known-good three-map reference.

### 4. Imported artist showcase

- Test promising FLAM3 XML locally before requesting publication rights. The
  original [FLAM3 project](https://github.com/scottdraves/flam3) is the format
  and renderer reference; its software license does not license independently
  authored artwork.
- Record unsupported constructs and visual differences per import. Lumen
  currently imports the affine part of a `finalxform` but warns and drops its
  nonlinear variations.
- Curate a small first cohort instead of a bulk scrape: 6–10 distinct artists,
  one excellent piece each, with visible attribution and an editable “Open in
  Studio” path.

### 5. Mandelbrot, Julia, and a Lumen-native flagship

Mandelbrot and filled Julia sets are escape-time fractals, not ordinary finite
contractive affine IFS presets. Keep the product labels mathematically honest.

- **Exact Mandelbrot/filled Julia:** a separate WebGPU per-pixel escape-time
  pipeline with smooth coloring and shared pan/zoom. NVIDIA's
  [GPU Mandelbrot overview](https://developer.nvidia.com/blog/introduction-cuda-dynamic-parallelism/)
  describes the standard per-pixel dwell approach and later adaptive options.
- **Flame-native Julia boundary:** an experimental stochastic inverse-iteration
  mode using random inverse branches. Label it as a boundary distribution, not
  the filled Julia set; inverse iteration is a documented Julia-set method
  ([research reference](https://arxiv.org/abs/1312.1457)).
- **Buddhabrot / Nebulabrot:** the strongest Lumen-specific candidate. Escaping
  orbits accumulate into a histogram, which fits the app's point-density and
  tone-mapping architecture and can naturally inherit palettes, animation, and
  audio mappings.

## Launch loop

1. Publish a weekly “Classic → Flame Remix” pair with an editable app link.
2. Invite one artist at a time into an attributed showcase rather than scraping
   galleries; give each artist a permanent profile/source link.
3. Run small themed remix challenges with one seed flame and feature selected
   results on Home after explicit permission.
4. Share three distinct proof points: instant browser creation for artists,
   audio/animation for motion creators, and custom variations plus Benchmark
   Studio for creative coders.
5. Add paid search only after measuring which of those messages produces a
   meaningful action: opening a gallery flame, editing it, and exporting or
   sharing it. Optimize for that activation path, not visits alone.

## Current executable slice

The eight canonical Fractal Classics are implemented as exact, editable
descriptors. The curation foundation now adds:

1. A batch FLAM3 compatibility report that reuses the production importer,
   including multi-flame documents and deterministic JSON output.
2. Provenance fields plus a rights/poster gate for shared publication.
3. Home chapters for Foundations, Lumen Originals, Flame Remixes, and Artist
   Editions; empty future chapters stay hidden until content exists.

Next, run promising permission-compatible XML packs through `pnpm
flam3:compat`, curate clearly labelled **Flame Remix** companions for the exact
classics, then stage/capture/publish the final Home plates. Once that gallery is
locked, re-run `pnpm capture:readme` and perform the release gate.
