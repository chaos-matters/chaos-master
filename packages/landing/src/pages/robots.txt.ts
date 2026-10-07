import type { APIRoute } from 'astro'

// The landing is a fully static build with no Worker in front of it, so
// robots.txt is emitted here rather than dropped in public/ — that is the only
// way the review deploy can get a different one from production.
//
// about.dev.lumenapeiron.com serves the same build as production from a
// different origin. Left alone it publishes `Allow: /` plus a Sitemap: line
// pointing at production's URL list, which is worse than saying nothing: it
// hands a crawler a duplicate origin and the map to go with it.
//
// PUBLIC_REVIEW_DEPLOY is set by the `build:review` script (package.json),
// which is what the dev deploy runs. Pairs with the noindex meta tag in
// layouts/Base.astro: this stops the crawl, that stops anything already
// fetched from being indexed.
const isReviewDeploy = import.meta.env.PUBLIC_REVIEW_DEPLOY === 'true'

const PRODUCTION = `User-agent: *
Allow: /

Sitemap: https://about.lumenapeiron.com/sitemap.xml
`

const REVIEW = `# Not the production site. about.lumenapeiron.com is the one to index.
User-agent: *
Disallow: /
`

export const GET: APIRoute = () =>
  new Response(isReviewDeploy ? REVIEW : PRODUCTION, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
