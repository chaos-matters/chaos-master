/**
 * The app's path routes: the pages that are not the editor, and which of them
 * a path shows. The entry (index.tsx) picks the page from this, the build
 * writes each one a copy of index.html (staticEntries.ts), and the worker
 * redirects each one's trailing-slash form to it.
 */
export const BENCHMARKS_PATH = '/benchmarks'

export const EXPLORER_PATH = '/explore'

/**
 * The Flame Clash preview: reachable by its URL only, with no link from the
 * editor while the clash is being built.
 */
export const CLASH_PATH = '/clash'

/**
 * The routes served as pages of their own. Renaming a route here renames it
 * everywhere.
 */
export const PAGE_ROUTES: readonly string[] = [
  BENCHMARKS_PATH,
  EXPLORER_PATH,
  CLASH_PATH,
]

/**
 * The page route a path shows, if any. Each route has three spellings: its
 * own, the trailing-slash form, and the folder's index.html, which a host
 * that only serves files (the Deno PR previews) answers by its exact name.
 * On Cloudflare the last two never reach the page: the worker redirects the
 * first, and the asset layer's html_handling the second.
 */
export function pageRouteOf(pathname: string): string | undefined {
  return PAGE_ROUTES.find(
    (route) =>
      pathname === route ||
      pathname === `${route}/` ||
      pathname === `${route}/index.html`,
  )
}

export function isBenchmarksPath(pathname: string): boolean {
  return pageRouteOf(pathname) === BENCHMARKS_PATH
}

export function isExplorerPath(pathname: string): boolean {
  return pageRouteOf(pathname) === EXPLORER_PATH
}

export function isClashPath(pathname: string): boolean {
  return pageRouteOf(pathname) === CLASH_PATH
}
