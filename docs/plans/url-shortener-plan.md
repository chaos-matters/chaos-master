STATUS: IMPLEMENTED

# URL Shortener Implementation Plan

The current application generates long URLs containing base64 encoded payloads. To create a cleaner user experience, we can implement a URL shortener leveraging the existing Cloudflare infrastructure (Cloudflare Workers + KV Storage).

## User Review Required

> [!IMPORTANT]
> **Single Worker vs Separate Package**
> Cloudflare now supports "Full-stack Workers" where a single worker can serve static assets *and* backend API routes. Since `chaos-master-fp` already uses `assets: { directory: "dist" }` in `wrangler.jsonc`, the cleanest approach is to add a small backend entrypoint (`src/worker/index.ts`) to the existing `app` package. 
> 
> This avoids the overhead of managing a separate `packages/share-worker/` project. Is this approach acceptable, or do you strongly prefer separating the worker into its own package?

> [!WARNING]
> **Cloudflare KV Namespace Requirements**
> We will need to create a KV namespace in your Cloudflare dashboard (or via `wrangler kv:namespace create`) to store the short URLs. I can provide the commands, but you will need to run them to get the namespace IDs for `wrangler.jsonc`.

## Proposed Changes

### `packages/app`

#### [NEW] `packages/app/src/worker/index.ts`
We will introduce a Cloudflare Worker entrypoint that intercepts API requests and forwards all other requests to the static frontend.
- `POST /api/shorten`: Accepts a JSON payload `{ payload: "base64_encoded_string" }`, generates a short unique ID (e.g. using `nanoid` or Math.random), stores it in a Cloudflare KV namespace (`KV_SHORTENER`), and returns the short ID.
- `GET /api/shorten/:id`: Looks up the short ID in the KV namespace and returns the full base64 string.
- Fallback: Calls `env.ASSETS.fetch(request)` to serve the SolidJS app for all other routes.

#### [MODIFY] `packages/app/wrangler.jsonc`
- Add `"main": "src/worker/index.ts"` to define the backend entrypoint.
- Add `kv_namespaces` configuration to bind `KV_SHORTENER`.

#### [MODIFY] `packages/app/src/App.tsx`
- Update the initialization logic inside `flameFromQuery`.
- In addition to checking `?flame=...`, it will check for `?s=...` (the short ID).
- If `?s=` is present, it will fetch the full payload from `/api/shorten/:id` and then decode it using the existing logic.

#### [MODIFY] `packages/app/src/components/ShareLinkModal/ShareLinkModal.tsx`
- Instead of directly embedding the base64 string into the URL, it will `POST` the encoded payload to `/api/shorten`.
- Once the short ID is returned, it will construct the final URL as `${window.location.origin}/?s=${shortId}` and present it to the user.

## Verification Plan

### Automated Tests
- Ensure `vite build` continues to work.
- If there are e2e tests, ensure they pass.

### Manual Verification
- We can test locally using `wrangler dev` which simulates the KV namespace locally without affecting production.
- I will ask you to verify that clicking "Share" generates a short URL locally, and that visiting the short URL correctly loads the flame.
