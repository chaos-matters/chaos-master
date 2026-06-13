# OG Meta Tags & Link-Sharing Previews — Plan / Replan

**Status:** Planning (no implementation yet)
**Date:** 2026-06-13
**Branches involved:**
- `feat/og-meta-tags-image` — original OG work (rebased onto `upstream/main`, 3 commits, preserved locally)
- `feat/server-side-gpu-renderer` — Deno render-worker (real WGSL pipeline, server-side)
- `feat/og-meta-tags-render-worker` — **this branch** (cut from the server-side renderer, where we replan + cherry-pick)

---

## TL;DR

The feature has **two independent parts**:

1. **Meta-tag injection** — make crawlers (Discord/Slack/X/FB/LinkedIn) see `og:*` / `twitter:*`
   tags for `/?flame=…` and `/?s=…` URLs. This is small, must live in the **existing app
   Cloudflare Worker** (`packages/app/src/worker/index.ts`) via `HTMLRewriter`, and is the same
   regardless of how we produce the image.

2. **The preview image** — the actual PNG. This is the real decision, and the original branch's
   approach **does not work on Cloudflare as written** (see hard constraints). Three viable paths,
   analysed below.

**Recommendation:** **Option C (client-render + store in R2)** as primary — free, highest quality,
trivial server CPU — with **Option A (Worker CPU render)** as a no-storage fallback. Use the Deno
render-worker (**Option B**) only if/when it is already deployed for the premium server-render
feature, in which case OG previews can piggyback on it for pixel-accuracy.

---

## Background — what already exists

### a) `feat/og-meta-tags-image` (the original OG work)
A standalone Cloudflare Worker (`packages/worker/`, name `chaos-master-og`) that:
- `/og/?flame=` → renders a 600×315 PNG with a from-scratch **Canvas2D chaos-game** (`renderFlameToPng.ts`)
- `/?flame=` → injects `og:*` / `twitter:*` tags
- assumes **app-on-Vercel + separate OG worker on its own domain**

It was written ~2026-03-14 and never deployed/merged. Since then the architecture changed.

### b) The app today (`upstream/main` ≈ `origin/main`)
The whole site is served by **one Cloudflare Worker**: `packages/app/src/worker/index.ts`
(`wrangler.jsonc`, name `chaos-master`, prod `chaos-master.com`, dev `dev.chaos-master.com`).
It already has:
- **KV-backed URL shortening** — `POST /api/shorten` + `GET /api/shorten/:id`, binding `KV_SHORTENER`.
- Static SPA served via `env.ASSETS.fetch` (assets dir `dist`).
- Share format is a **wrapper**: `encodeSharePayload(flame, animation?)` → `{ flame, animation? }`,
  base64url (`-_`, no pad). Most shares are auto-shortened to **`?s=<id>`** (ShareLinkModal calls
  `/api/shorten`); raw `?flame=` URLs are the long-form fallback.

### c) `feat/server-side-gpu-renderer` (the Deno render-worker)
Lives in `workers/render-worker/` (Deno, **not** `packages/`). It:
- Reuses the **exact app WGSL pipeline** (`ifsPipeline`, `densityEstimationPipeline`,
  `adaptiveBlur`, `colorGrading`, OkLab palettes) under Deno native WebGPU → **pixel-accurate**.
- "CPU fallback" = **software Vulkan (Mesa lavapipe)**, *not* pure JS — still needs Deno + Dawn in a
  container (`VK_ICD_FILENAMES=lvp_icd`).
- Deploys as a **Docker container on a host** (GPU via `run-nvidia.sh`/`run-amd.sh`, or software
  Vulkan). **Not serverless / not free.**
- API is an **async job model**: `POST /render` → jobId; poll `GET /render/:id`;
  `GET /render/:id/result` → PNG. No synchronous render endpoint.

---

## Hard constraints discovered (these drive the decision)

1. **Cloudflare Workers have NO Canvas / OffscreenCanvas.** workerd has no DOM/canvas. The original
   `renderFlameToPng.ts` uses `new OffscreenCanvas(...)`, `ctx.createImageData`, `convertToBlob` —
   **these throw on Cloudflare.** Any in-Worker rendering must build the pixel buffer in plain JS and
   **encode the PNG manually** (pure-JS encoder, ideally *stored*/uncompressed deflate blocks to stay
   cheap) or use a WASM lib (`@cf-wasm/photon`, `resvg`) — extra bundle weight + CPU.

2. **Free Worker CPU = 10 ms / request** (100k req/day). A real flame needs millions of samples for
   smooth density; ~10 ms only buys a few hundred-thousand chaos-game iterations (atan2/sin/cos are
   expensive) → **sparse, approximate** previews. Wall-clock (I/O wait) is uncapped, but rendering is
   CPU-bound, so 10 ms is the binding limit on the free tier.

3. **Two original decode bugs** (must avoid by reusing app utils, not the worker's copies):
   - `decompressJsonQuery` constructed `new CompressionStream('deflate')` — should be
     `DecompressionStream`. As written it can't decode anything.
   - It parsed a bare `FlameDescriptor`, but the app now sends `{ flame, animation }` → must unwrap.

4. **Short links dominate.** `/og/` in the original only reads `?flame=`. Real shares are `?s=<id>`
   → need a KV lookup first (the app worker already binds `KV_SHORTENER`).

5. **render-worker is host-bound + async.** Crawlers issue a **single synchronous GET** for
   `og:image` and time out fast. The job-based API needs a synchronous wrapper, and the host must be
   always-on.

6. **OG URLs must be absolute** (`https://chaos-master.com/...`); the original emitted relative URLs.

---

## Options for producing the preview image

### Option A — Cloudflare Worker CPU render (self-contained, "free CPU we have")
Port the chaos-game accumulation into the app worker, **drop the canvas dependency**, and encode the
PNG by hand (stored/uncompressed zlib blocks + CRC32 — cheap). Decode via the app's real
`decodeSharePayload`.

- ➕ Truly free, serverless, zero extra infra, low latency, in-memory + edge cache.
- ➖ Must write/own a pure-JS PNG encoder; **approximate quality** under 10 ms CPU; a **second,
  lower-fidelity renderer** to maintain (only ~20 variations re-implemented, no DE/blur/real palette,
  ignores camera/zoom); not pixel-accurate to the app.

### Option B — Proxy the Deno render-worker (pixel-accurate)
App worker injects meta tags; `og:image` is served by (or proxied from) the render-worker, which
renders with the **real pipeline**.

- ➕ Pixel-accurate, single source of truth for rendering, supports every variation + 3D + DE.
- ➖ **Not free / not serverless** — needs an always-on Docker host (GPU or software Vulkan); async
  job API needs a **synchronous** wrapper for crawlers; render latency (seconds) → aggressive caching
  mandatory; couples the OG PR to the large server-side-renderer work.

### Option C — Client-render + store (recommended primary)
The app **already GPU-renders the flame in the browser**. At share time, read back the canvas,
downscale to ~1200×630, and upload the PNG alongside the short link; the worker serves it for
`og:image`.

- Flow: `ShareLinkModal` → render/readback PNG → `POST /api/share` stores `{ payload, png }`
  (payload in KV, **PNG in R2** keyed by short id) → `og:image = https://chaos-master.com/og/<id>.png`.
- Worker: `GET /og/:id.png` → stream from R2; `HTMLRewriter` injects meta with the absolute R2 URL.
- ➕ **Free** (R2 free tier 10 GB + generous ops), **highest quality** (the real GPU render the user
  sees), **near-zero server CPU**, no second renderer, no canvas-in-worker problem.
- ➖ Only covers links created via the share flow (the common path); raw hand-built `?flame=` URLs
  have no stored image → fall back to a generic static card. Adds an R2 bucket + a storage write to
  the share flow. (KV write cap on free is 1k/day → use **R2** for the image, not KV.)

### Option D — Cloudflare Browser Rendering / screenshot service
Headless-Chrome screenshot of the app. ➖ Paid (Browser Rendering is a paid binding), heavyweight,
slow. **Dismissed.**

---

## Tradeoff summary

| Criterion | A: Worker CPU | B: render-worker | C: client-render + R2 |
|---|---|---|---|
| Cost | Free | Host (not free) | Free (R2 free tier) |
| Quality | Approximate | Pixel-accurate | Pixel-accurate (real GPU) |
| Server CPU | High (10 ms cap) | On the host | ~Zero |
| Infra added | None | Always-on container | R2 bucket |
| Canvas-in-worker problem | Yes (manual PNG enc.) | N/A | N/A |
| Covers raw `?flame=` URLs | Yes | Yes | No (needs share flow → fallback card) |
| Crawler latency | Low (cached) | Risky (async, secs) | Low (static R2) |
| Maintains 2nd renderer | Yes | No | No |
| Couples to big server PR | No | Yes | No |

---

## Recommendation

1. **Ship the meta-tag injection now** in the app worker (common to all). Low risk, immediate value.
2. **Image = Option C** (client-render + R2) as the primary path — free, accurate, simplest server.
3. **Fallback = a generic static OG card** for non-share-flow URLs (and as the day-1 image if C slips).
4. Keep **Option B** in mind only if the render-worker gets deployed for the paid server-render
   feature — then OG can reuse it for `?flame=`-only links too. Don't block OG on it.
5. **Option A** only if we explicitly want zero-storage + self-contained and accept approximate
   quality; if so, it must replace the canvas with a hand-rolled PNG encoder.

---

## Implementation plan (recommended: meta injection + Option C)

### Part 1 — Meta-tag injection (app worker)
1. In `packages/app/src/worker/index.ts`, before the `env.ASSETS.fetch` fallback, intercept
   `GET /` and `/index.html` when `?flame=` or `?s=` is present.
2. Resolve the payload: `?s=<id>` → `KV_SHORTENER.get(id)`; `?flame=` → use directly.
3. Decode with the app's **real** `decodeSharePayload` / `decompressJsonPayload` (fixes both original
   bugs; no drift). Derive title (author/name), description (transform count), absolute URLs.
4. Fetch the built `index.html` via `env.ASSETS.fetch(request)` and inject/replace `og:*` + `twitter:*`
   via **`HTMLRewriter`** (do not hardcode HTML — the original referenced dev `/src/index.tsx`).
5. Absolute URLs only; sensible caching headers.

### Part 2 — Image (Option C)
6. Add an **R2 bucket** binding (e.g. `OG_IMAGES`) to `wrangler.jsonc` (all envs).
7. In `ShareLinkModal` (or the share util), read back the rendered flame canvas → downscale to
   1200×630 → PNG `Blob`.
8. Extend the shorten endpoint (or add `POST /api/share`) to store payload in KV **and** PNG in R2
   under the short id.
9. Worker route `GET /og/:id.png` → stream from R2 with long cache headers; meta `og:image` points here.
10. **Fallback:** bundle a static `og-default.png`; use it when no stored image exists.
11. Validate with FB / X / LinkedIn debuggers + Discord/Slack paste before opening the PR.

---

## What to cherry-pick / salvage from `feat/og-meta-tags-image`

- ✅ The **OG/Twitter tag set + title/description heuristics** from `index.ts` `generateHtmlWithOgTags`
  (reuse the tag list; re-home into `HTMLRewriter`, switch to absolute URLs).
- ✅ `docs/cloudflare-worker.md` — rewrite for the single-worker model.
- ⚠️ `renderFlameToPng.ts` — **only if we pick Option A**, and then strip the canvas (manual PNG
  encoder) and reconcile with the real flame schema. Otherwise drop it.
- ❌ `base64.ts` / `jsonQueryParam.ts` worker copies — **discard**; reuse app utils.
- ❌ Standalone `packages/worker/` + its `wrangler.toml` — **discard** (folded into the app worker).

---

## Upstream PR strategy

- Meta injection + Option C is **small and self-contained** → target a **focused PR off
  `upstream/main`**, *not* riding on the large `feat/server-side-gpu-renderer` branch (auth/Stripe/
  db-worker/render-worker would bloat the diff).
- ⚠️ **Branch-base note:** this branch (`feat/og-meta-tags-render-worker`) is cut from the server-side
  renderer, which only makes sense for **Option B**. If we go with **C/A (recommended)**, re-base the
  OG work onto `upstream/main` and keep the server-side branch out of the PR.
- Sequence: (1) meta-tags PR (works with the static fallback image), (2) Option-C image PR. Test each
  before merge.

---

## Storage cost analysis (Option C) — "why not client-render, upload, store, serve?"

**Yes — that's exactly Option C, and it works.** Flow: browser WebGPU render → read back canvas →
downscale (low-res, ~600×315 or a compressed ~1200×630) → `POST` to the worker → worker stores in
**R2** under the short id → `og:image = https://chaos-master.com/og/<id>.png` → crawler fetches it
back from the worker/R2.

**Use R2, not KV, for the image:**

| | R2 (recommended) | KV |
|---|---|---|
| Free storage | 10 GB-month | 1 GB |
| Free writes | 1M Class A ops/mo (~33k/day) | **1,000/day** (the binding cap) |
| Free reads | 10M Class B ops/mo | 100k/day |
| Egress | **Free** (serving `og:image` costs nothing) | Free |
| Native expiry | Lifecycle rule (auto-delete after N days) | Per-key `expirationTtl` |
| Binary blobs | First-class | Value ≤ 25 MB; works but not ideal |

**Cost at this scale ≈ $0.** A low-res PNG is ~30–100 KB. Even 10,000 stored images ≈ 0.3–1 GB →
inside R2's 10 GB free tier; egress is free, so serving previews to crawlers is free; 1 write/share is
far under R2's 1M/month. KV's **1,000 writes/day** free cap is the only thing that would bite → R2 wins.

**Retention / the capacity idea:** prefer **TTL-based auto-cleanup over a hard N-cap.** An R2 lifecycle
rule "delete after 7 days" (or 30) bounds storage automatically with zero code — no counter, no
"stop saving" branch. A hard cap is doable but needs you to track a count and is easy to get wrong;
TTL is simpler and self-healing.

**Caveat:** if image TTL (a few days) < link TTL (60 days), old links lose the rich preview and fall
back to the generic card. Usually fine — previews matter most in the first hours/days, and platforms
(Discord/X/FB) **cache their own copy** on first scrape, so the R2 object only needs to survive until
the first crawler hit. If links should keep previews forever, either (a) match image TTL to link TTL
(60 days of images is still well within free tier), or (b) regenerate on demand when an expired image
is requested. **Net: storage is effectively free here — R2 + a 7–30 day lifecycle rule, no manual cap.**

> Note: Option C largely **sidesteps the A-vs-B decision** for the common (share-flow) path — the image
> comes from the client's GPU, so no server renderer is needed there. A or B only matter for raw
> `?flame=` URLs created outside the share flow, or if we don't want to upload from the client.

## Open questions

1. Confirm the in-app flame canvas can be read back to a PNG at share time (it renders on GPU — verify
   `toBlob`/readback works across browsers, esp. iOS Safari).
2. R2 public access vs. serving through the worker (`/og/:id.png`)? Worker-served keeps one domain +
   cache control.
3. Storage lifecycle: tie OG image TTL to the short-link TTL (currently 60 days) so they expire together.
4. Decision: do we want raw `?flame=` URLs (no share flow) to also get a real image (→ needs A or B),
   or is a generic fallback card acceptable for those?
