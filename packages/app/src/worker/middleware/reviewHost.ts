// dev.lumenapeiron.com and the PR preview are review deploys. They serve the
// same build as production from a different origin, so search engines must be kept off it at
// the HTTP boundary — a robots meta tag in the SPA is no use here, because the
// app is JavaScript a crawler may never execute.
//
// Two layers, because they stop different things: the robots.txt below prevents
// the crawl, and X-Robots-Tag on every response prevents indexing anything
// already fetched.
//
// Without this the host serves public/robots.txt verbatim, which is worse than
// passive: it says `Allow: /` and hands the crawler production's sitemap from a
// duplicate origin.

export const REVIEW_HOST = 'dev.lumenapeiron.com'

/**
 * Every origin that serves a non-production build: the dev deploy, anything
 * under it (about.dev.lumenapeiron.com), and every *.workers.dev address. The
 * PR preview has no route, so `wrangler deploy --env preview` serves it from
 * workers.dev, and deploy.yml posts that URL on every public pull request.
 *
 * This matches review origins rather than allowlisting production, because
 * production may still be bound to legacy domains outside wrangler.jsonc until
 * their redirect lands, and marking those noindex is a separate SEO decision.
 */
export function isReviewHost(url: URL): boolean {
  const host = url.hostname
  return (
    host === REVIEW_HOST ||
    host.endsWith(`.${REVIEW_HOST}`) ||
    host.endsWith('.workers.dev')
  )
}

const REVIEW_ROBOTS = [
  '# Not the production site. lumenapeiron.com is the one to index.',
  'User-agent: *',
  'Disallow: /',
  '',
].join('\n')

export function reviewRobotsTxt(): Response {
  return new Response(REVIEW_ROBOTS, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

/** Return a copy of res marked never-index. */
export function withNoIndex(res: Response): Response {
  const headers = new Headers(res.headers)
  headers.set('X-Robots-Tag', 'noindex, nofollow')
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
