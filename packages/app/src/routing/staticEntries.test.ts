/**
 * The static route files resolve every asset to the file the root page loads,
 * at the folder URL a static host redirects to and at the bare route URL.
 */
import { describe, expect, it } from 'vitest'
import { BENCHMARKS_PATH, CLASH_PATH, EXPLORER_PATH } from './appPath'
import { nestedIndexHtml, redirectPageHtml, staticEntryFiles, withPageUrl, } from './staticEntries'

const ORIGIN = 'https://example.test'

// The shape `vite build` gives index.html with `base: './'`.
const BUILT_INDEX = `<!doctype html>
<html lang="en">
  <head>
    <link rel="icon" type="image/svg+xml" href="./assets/favicon-a1.svg" />
    <link rel="canonical" href="https://lumenapeiron.com/" />
    <meta property="og:url" content="https://lumenapeiron.com/" />
    <script type="module" crossorigin src="./assets/index-b2.js"></script>
    <link rel="modulepreload" crossorigin href="./assets/solid-c3.js">
    <link rel="stylesheet" crossorigin href='./assets/index-d4.css'>
  </head>
  <body>
    <div id="root"></div>
    <script src="./crashHandler.js"></script>
  </body>
</html>
`

function references(html: string): string[] {
  return [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(
    (match) => match[1] ?? '',
  )
}

function resolveAll(html: string, pageUrl: string): string[] {
  return references(html).map((ref) => new URL(ref, pageUrl).href)
}

describe('nestedIndexHtml', () => {
  const nested = nestedIndexHtml(BUILT_INDEX)
  const fromRoot = resolveAll(BUILT_INDEX, `${ORIGIN}/`)

  it.each([`${ORIGIN}/explore/`, `${ORIGIN}/explore`])(
    'loads the root page files from %s',
    (pageUrl) => {
      expect(resolveAll(nested, pageUrl)).toEqual(fromRoot)
    },
  )

  it('leaves absolute URLs alone', () => {
    expect(nested).toContain('href="https://lumenapeiron.com/"')
  })

  it('changes nothing but the relative URLs', () => {
    expect(nested.replaceAll('../', './')).toBe(BUILT_INDEX)
  })
})

describe('redirectPageHtml', () => {
  it('refreshes to the target and links to it', () => {
    const html = redirectPageHtml('../#arcade', 'Arcade')
    expect(html).toContain(
      '<meta http-equiv="refresh" content="0; url=../#arcade" />',
    )
    expect(html).toContain('<a href="../#arcade">Arcade</a>')
  })
})

describe('staticEntryFiles', () => {
  const files = staticEntryFiles(BUILT_INDEX)

  it('writes the nested page into each page route folder', () => {
    for (const route of [BENCHMARKS_PATH, EXPLORER_PATH, CLASH_PATH]) {
      expect(files[`${route.slice(1)}/index.html`]).toBe(
        withPageUrl(nestedIndexHtml(BUILT_INDEX), route),
      )
    }
  })

  it('names each route, not the home page, as the canonical URL', () => {
    const page = files['explore/index.html'] ?? ''
    expect(page).toContain(
      '<link rel="canonical" href="https://lumenapeiron.com/explore" />',
    )
    expect(page).toContain(
      '<meta property="og:url" content="https://lumenapeiron.com/explore" />',
    )
    expect(page).not.toContain('"https://lumenapeiron.com/"')
  })

  it('sends /arcade/ to the Arcade tab', () => {
    const page = files['arcade/index.html'] ?? ''
    const target = /url=([^"]+)"/.exec(page)?.[1] ?? ''
    expect(new URL(target, `${ORIGIN}/arcade/`).href).toBe(`${ORIGIN}/#arcade`)
  })

  it('writes nothing else', () => {
    expect(Object.keys(files).sort()).toEqual([
      'arcade/index.html',
      'benchmarks/index.html',
      'clash/index.html',
      'explore/index.html',
    ])
  })
})
