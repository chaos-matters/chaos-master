# @chaos-master/landing

Marketing landing page for [Chaos Master](https://chaos-master.com), built with
[Astro](https://astro.build). Ships as a static site and deploys to Cloudflare
on its own subdomain — the app itself lives in `packages/app` and owns the root
domain.

## Develop

```bash
# from the repo root
pnpm --filter @chaos-master/landing dev      # local dev server
pnpm --filter @chaos-master/landing build    # static build → dist/
pnpm --filter @chaos-master/landing preview  # preview the build
```

## Structure

```
src/
  layouts/Base.astro      # <head>, SEO/OG tags, footer
  components/             # Hero, Features, CallToAction
  pages/index.astro      # homepage
  styles/global.css      # design tokens + shared styles
public/                  # favicon, hero image (static, copied as-is)
```

## Deploy (Cloudflare)

Static assets are served directly by Cloudflare (no Worker) — see
`wrangler.jsonc`.

```bash
pnpm --filter @chaos-master/landing deploy:dev    # www.dev.chaos-master.com
pnpm --filter @chaos-master/landing deploy:prod   # www.chaos-master.com
```

> **DNS first:** the custom-domain routes in `wrangler.jsonc`
> (`www.chaos-master.com`, `www.dev.chaos-master.com`) need the matching DNS
> records configured in the Cloudflare dashboard before the first deploy.
> Adjust the subdomains there and in `astro.config.mjs` (`site`) if you prefer
> something other than `www.`.
