import { PAGE_ROUTES } from '../routing/appPath'
import { checkApiRateLimit } from './middleware/rateLimit'
import { isReviewHost, reviewRobotsTxt, withNoIndex, } from './middleware/reviewHost'
import { withSecurityHeaders } from './middleware/securityHeaders'
import { handleDiscordRedirect, handleShareDiscord } from './routes/discord'
import { handleGalleryConfig, handleGalleryList, handleGalleryPoster, handleGallerySlug, } from './routes/gallery'
import { handleMetaInject, handleOgGet, handleOgPost } from './routes/og'
import { handleShortenGet, handleShortenPost } from './routes/shorten'
import { json } from './utils'
import type { Env } from './types'

export type { Env }

const SLASHED_PAGE_ROUTES = new Set(PAGE_ROUTES.map((route) => `${route}/`))

export const baseHandler = {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    // One canonical URL per page route, without the slash. The asset layer
    // serves the build's benchmarks/index.html and explore/index.html there
    // (routing/staticEntries.ts, html_handling in wrangler.jsonc).
    if (
      SLASHED_PAGE_ROUTES.has(pathname) &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      url.pathname = pathname.slice(0, -1)
      return Response.redirect(url.toString(), 308)
    }

    // The Arcade has a real path for sharing, but the app routes tabs by
    // fragment (lib/activeTab.ts), so hand it to the SPA as `#arcade`.
    if (
      (pathname === '/arcade' || pathname === '/arcade/') &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      url.pathname = '/'
      url.hash = 'arcade'
      return Response.redirect(url.toString(), 308)
    }

    // Rate-limit the write endpoints per IP.
    const rateLimitResponse = await checkApiRateLimit(request, env)
    if (rateLimitResponse) return rateLimitResponse

    // Shortener endpoints
    if (pathname === '/api/shorten' && request.method === 'POST') {
      return handleShortenPost(request, env)
    }

    if (pathname.startsWith('/api/shorten/') && request.method === 'GET') {
      return handleShortenGet(pathname, env)
    }

    // Home gallery endpoints (must match config and poster before per-slug)
    if (pathname === '/api/gallery/config' && request.method === 'GET') {
      return handleGalleryConfig(env)
    }

    if (
      pathname.startsWith('/api/gallery/poster/') &&
      request.method === 'GET'
    ) {
      return handleGalleryPoster(pathname, env)
    }

    if (pathname === '/api/gallery' && request.method === 'GET') {
      return handleGalleryList(url, env)
    }

    if (pathname.startsWith('/api/gallery/') && request.method === 'GET') {
      return handleGallerySlug(pathname, env)
    }

    // Open Graph image upload & preview
    if (pathname.startsWith('/api/og/') && request.method === 'POST') {
      return handleOgPost(request, env, pathname)
    }

    if (pathname.startsWith('/og/') && request.method === 'GET') {
      return handleOgGet(pathname, env)
    }

    // Discord share & invite
    if (pathname === '/api/share-discord' && request.method === 'POST') {
      return handleShareDiscord(request, env, url)
    }

    if (pathname === '/discord' && request.method === 'GET') {
      return handleDiscordRedirect(env)
    }

    // Inject meta tags for shared links so crawlers see a rich preview
    if (
      (pathname === '/' || pathname === '/index.html') &&
      request.method === 'GET'
    ) {
      const metaRes = await handleMetaInject(request, env, url)
      if (metaRes) return metaRes
    }

    // Unknown API routes must remain API-shaped 404s.
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404)
    }

    // Everything else → static assets (the frontend)
    return env.ASSETS.fetch(request)
  },
}

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const url = new URL(request.url)
    if (!isReviewHost(url)) {
      return withSecurityHeaders(await baseHandler.fetch(request, env, ctx))
    }

    // The review deploy serves production's build from a different origin, so
    // it is kept out of search here at the boundary rather than inside the
    // routes. Two layers, because they stop different things: this robots.txt
    // prevents the crawl, and the header prevents indexing anything already
    // fetched. See middleware/reviewHost.ts.
    const isRead = request.method === 'GET' || request.method === 'HEAD'
    const response =
      url.pathname === '/robots.txt' && isRead
        ? reviewRobotsTxt()
        : await baseHandler.fetch(request, env, ctx)
    return withNoIndex(withSecurityHeaders(response))
  },
}
