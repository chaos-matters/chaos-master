# OG Link Previews — Setup & Testing

Rich social previews (Discord / Slack / X / Facebook / LinkedIn) for shared flame
links, implemented as **Option C** of [`plans/og-meta-tags-plan.md`](./plans/og-meta-tags-plan.md):
the client GPU-renders the flame, uploads a downscaled PNG, and the existing app
Worker stores it in R2 and injects `og:*` / `twitter:*` meta tags. **$0 / free tier.**

## How it works

1. **Share** — `ShareLinkModal` builds `?flame=<encoded>`, upgrades to `?s=<id>` if
   `POST /api/shorten` succeeds, then (background) captures the current flame canvas,
   downscales it (≤1000 px), **embeds the flame descriptor** into the PNG (deflate zTXt
   chunk, same as Discord share), and `POST /api/og/<key>` with the PNG + title/description.
   `<key>` is `ogKey(encoded)` = SHA-256 of the encoded payload (first 32 hex) —
   **content-addressed**, so it's independent of the short id.
2. **Store** — the Worker puts the PNG in the **`OG_IMAGES` R2 bucket** under `<key>` and
   the title/description in KV under `og:<key>`.
3. **Serve** — `GET /og/<key>` streams the PNG from R2 (cached 24 h). Because the flame is
   embedded, downloading this image lets the user load the flame back into the app.
4. **Inject** — for `/?s=<id>` the Worker resolves the payload from KV then hashes it to
   `<key>`; for `/?flame=<encoded>` it hashes the inline payload directly. Either way it
   reads `og:<key>`, fetches the built `index.html` via `env.ASSETS`, and injects
   `og:*` / `twitter:*` tags (absolute URLs) + a richer `<title>`. Human visitors still
   get the normal SPA.

Because the image is content-addressed, **`?flame=` and `?s=` produce the same preview** —
so a link shared without (or after a failed) shortener still gets the full image card. A
`?flame=` link built outside the app (no uploaded image) falls back to a text card.

## Files

| File | Change |
|------|--------|
| `packages/app/src/worker/index.ts` | `POST /api/og/:id`, `GET /og/:id`, meta injection on `/?s=` and `/?flame=` |
| `packages/app/wrangler.jsonc` | `OG_IMAGES` R2 binding (prod / dev / preview) |
| `packages/app/src/MainWorkspace.tsx` | `captureOgImageBlob()` — clean-frame capture + downscale |
| `packages/app/src/components/ShareLinkModal/ShareLinkModal.tsx` | background upload + title/description |

## One-time setup (before deploy)

Create the R2 buckets (free tier — 10 GB, egress free). Requires `wrangler login`
first. From `packages/app`:

```bash
pnpm run r2:create:dev     # chaos-master-og-images-dev   (dev + preview envs)
pnpm run r2:create:prod    # chaos-master-og-images       (prod env)
```

You only need `r2:create:dev` to test on the dev environment. Bucket names /
bindings are wired in `wrangler.jsonc` (`OG_IMAGES`); R2 is local-simulated under
`wrangler dev`, so no bucket is needed for local testing.

**Optional — auto-expire images** to bound storage (recommended; matches the plan).
R2 lifecycle rules are set in the Cloudflare dashboard → R2 → bucket → Settings →
Object lifecycle rules → "Delete objects N days after creation" (e.g. 30). Note: if the
image TTL is shorter than the 60-day link TTL, old links fall back to the text card.

## Deploy

```bash
cd packages/app
pnpm run deploy:dev     # → dev.chaos-master.com
# pnpm run deploy:prod  # → chaos-master.com
```

## Testing

1. Open the app, build/select a flame, **Share Link** → copy the `?s=<id>` URL.
2. Confirm the image stored:
   ```bash
   curl -I "https://dev.chaos-master.com/og/<id>"      # → 200, Content-Type: image/png
   ```
3. Confirm meta tags injected:
   ```bash
   curl -s "https://dev.chaos-master.com/?s=<id>" | grep -i 'og:\|twitter:'
   ```
4. Validate with the platform debuggers (they also force a re-scrape):
   - Facebook: https://developers.facebook.com/tools/debug/
   - X/Twitter: https://cards-dev.twitter.com/validator
   - LinkedIn: https://www.linkedin.com/post-inspector/
   - Discord/Slack: paste the URL in any channel.

## Notes / limitations

- **Race:** the image uploads ~1–2 s after the link is created. If a crawler scrapes
  before the upload lands, the first preview has no image; platforms re-scrape later
  (or use the debugger to force it).
- **Canvas capture** relies on `canvas.toBlob` of the live WebGPU canvas (same path as
  Discord sharing). Verify on iOS Safari during testing.
- **Cost:** PNG ≤ ~100 KB; thousands of images stay well within R2's 10 GB free tier;
  egress (serving previews) is free. See the plan doc's storage analysis.
