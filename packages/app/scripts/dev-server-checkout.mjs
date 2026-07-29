// Which checkout is a dev server actually serving?
//
// The poster pipeline drives a dev-only page on a Vite dev server. A dev server
// that ANSWERS is not the same thing as a dev server built from the code the
// capture is running from: every worktree of this repo serves
// /scripts/poster-capture.html equally well on :5173, so "reuse whatever is
// already listening" renders posters from whichever checkout happens to own the
// port.
//
// That is not a theoretical hazard. A capture run from one worktree reused a
// dev server belonging to an older one, so the capture page — and the vibrancy
// fix that had just been made to it — came from the older tree. The run
// reported the same frame, the same content hash and the same wrong colours as
// before the fix, and the only available conclusion was that the fix did not
// work. A poster is an image: nothing downstream can tell "rendered from stale
// code" from "rendered correctly", which is exactly why this has to be caught
// up front rather than warned about.
//
// The provenance signal is Vite's own dev transform. Every module it compiles
// gets an inline source map appended, and that map's `file` is the module's
// ABSOLUTE path on disk — so a single GET of the capture module names the
// checkout behind the server. Two alternatives were considered and rejected:
// a `define` in vite.config.ts (the config is outside this pipeline, and a
// value baked at server start is no more trustworthy than the source map), and
// hashing the served source against the local file (it proves only that these
// two files match, while the capture page pulls in the whole of src/ — the path
// check covers every module, not just the entry).
//
// Should a future Vite stop emitting that map, fall back to Vite's documented
// /@fs/<absolute path> route: it serves files inside `server.fs.allow` — the
// workspace root by default — and answers 403 for anything outside it, so a 200
// for OUR capture page is an independent "this server's tree contains ours".

import { Buffer } from 'node:buffer'
import { realpathSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { dirname, isAbsolute, resolve } from 'node:path'

/** Served by the dev server, never by a build: Vite's input is index.html. */
export const CAPTURE_PAGE = '/scripts/poster-capture.html'

/** The page's entry module — the one whose source map we read. */
const CAPTURE_MODULE = '/scripts/posterCapture.tsx'

const SOURCE_MAP_MARKER = 'sourceMappingURL=data:application/json;base64,'
const BASE64 = /^[A-Za-z0-9+/=]+/

/**
 * GET a dev-server URL, whole body.
 *
 * rejectUnauthorized is off because the dev server uses basic-ssl's
 * self-signed certificate — the same reason the capture script passes
 * ignoreHTTPSErrors to Playwright. Localhost only. Any failure is reported as
 * status 0 rather than thrown: every caller here treats "no answer" as one more
 * inconclusive probe, not as a crash.
 */
function get(target, timeoutMs) {
  return new Promise((settle) => {
    const send = target.protocol === 'http:' ? httpRequest : httpsRequest
    const fail = () => {
      settle({ status: 0, body: '' })
    }
    const request = send(
      target,
      { method: 'GET', rejectUnauthorized: false, timeout: timeoutMs },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          settle({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
        response.on('error', fail)
      },
    )
    request.on('error', fail)
    request.on('timeout', () => {
      request.destroy()
      fail()
    })
    request.end()
  })
}

function url(base, path) {
  try {
    return new URL(path, base)
  } catch {
    return null
  }
}

/**
 * Is the capture page being served? A 200 means both "a server is up" and "it
 * is serving the app", which a bare TCP check does not — and, as the header
 * says, still not which checkout it serves.
 */
export async function probeCapturePage(base, timeoutMs = 3000) {
  const target = url(base, CAPTURE_PAGE)
  if (target === null) return 0
  const { status } = await get(target, timeoutMs)
  return status
}

/** The app directory behind `base`, from the served module's source map. */
async function appDirFromSourceMap(base, timeoutMs) {
  const target = url(base, CAPTURE_MODULE)
  if (target === null) return null
  const { status, body } = await get(target, timeoutMs)
  if (status !== 200) return null
  const at = body.lastIndexOf(SOURCE_MAP_MARKER)
  if (at < 0) return null
  const encoded = BASE64.exec(body.slice(at + SOURCE_MAP_MARKER.length).trim())
  if (encoded === null) return null
  let map
  try {
    map = JSON.parse(Buffer.from(encoded[0], 'base64').toString('utf8'))
  } catch {
    return null
  }
  // Current Vite puts the absolute path in `file` and a bare filename in
  // `sources`; older versions put the absolute path in `sources`. Take whichever
  // is absolute so a version bump either way still resolves.
  const file = [
    map.file,
    ...(Array.isArray(map.sources) ? map.sources : []),
  ].find((entry) => typeof entry === 'string' && isAbsolute(entry))
  if (file === undefined) return null
  // <appDir>/scripts/posterCapture.tsx -> <appDir>
  return resolve(dirname(file), '..')
}

/**
 * Does `base` serve `absPath` off disk? 200 yes, 403 outside its allow list,
 * anything else inconclusive.
 */
async function servesFromDisk(base, absPath, timeoutMs) {
  const target = url(base, `/@fs${absPath}`)
  if (target === null) return null
  const { status } = await get(target, timeoutMs)
  if (status === 200) return true
  if (status === 403 || status === 404) return false
  return null
}

/** Follow symlinks where we can, so two names for one tree compare equal. */
function canonical(path) {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

/**
 * Which checkout is the dev server at `base` serving, and is it `appDir`?
 *
 * Verdicts:
 *   unreachable  nothing is serving the capture page
 *   match        it is this checkout
 *   mismatch     it is a different one — `served` names it
 *   unverified   the capture page is served but neither probe could say whose
 */
export async function verifyServedCheckout({ base, appDir, timeoutMs = 5000 }) {
  const status = await probeCapturePage(base, timeoutMs)
  if (status !== 200) return { verdict: 'unreachable', status, served: null }

  const served = await appDirFromSourceMap(base, timeoutMs)
  if (served !== null) {
    const same = canonical(served) === canonical(appDir)
    return { verdict: same ? 'match' : 'mismatch', served, via: 'source map' }
  }

  const ours = await servesFromDisk(base, `${appDir}${CAPTURE_PAGE}`, timeoutMs)
  if (ours === true)
    return { verdict: 'match', served: appDir, via: 'fs.allow' }
  if (ours === false)
    return { verdict: 'mismatch', served: null, via: 'fs.allow' }
  return { verdict: 'unverified', served: null }
}

/** A port to suggest for a second dev server, given the one already taken. */
function spareBase(base) {
  try {
    const parsed = new URL(base)
    const port = Number(parsed.port || '5173')
    parsed.port = String(port + 1)
    return { base: parsed.origin, port: port + 1 }
  } catch {
    return { base: 'https://localhost:5174', port: 5174 }
  }
}

/**
 * Turn a non-`match` verdict into something worth reading at 2am: both paths,
 * why it matters, and the two ways out. Returns null for a match.
 *
 * `bypassable` marks the one verdict a caller may override: "could not tell".
 * A KNOWN mismatch is never bypassable — an escape hatch for that is just the
 * original bug with a flag on it.
 */
export function checkoutFailure({ base, appDir, result }) {
  const spare = spareBase(base)
  const ownServer =
    `cd ${appDir} && pnpm start --port ${spare.port} --strictPort\` ` +
    `and re-run with \`--base ${spare.base}`

  if (result.verdict === 'mismatch') {
    return {
      code: 'dev-server-foreign-checkout',
      bypassable: false,
      message:
        `The dev server at ${base} is serving a DIFFERENT checkout.\n` +
        `  this capture runs from: ${appDir}\n` +
        `  the dev server serves:  ${result.served ?? '(a tree that does not contain this one)'}\n` +
        "Every poster it renders would come from that tree's code, not this one's, " +
        'and the image gives no sign of it. Stop that dev server, or start this ' +
        `checkout's own: \`${ownServer}\`.`,
      detail: {
        base,
        appDir,
        served: result.served,
        via: result.via ?? null,
        hint: `stop that dev server, or pass --base ${spare.base} and serve this checkout there`,
      },
    }
  }

  if (result.verdict === 'unverified') {
    return {
      code: 'dev-server-unverified-checkout',
      bypassable: true,
      message:
        `Could not confirm which checkout the dev server at ${base} is serving.\n` +
        `  this capture runs from: ${appDir}\n` +
        `Neither ${CAPTURE_MODULE} (no readable source map) nor /@fs (not served) ` +
        'would say. A poster rendered from a foreign checkout looks exactly like a ' +
        "correct one, so this run stops instead of guessing. Start this checkout's " +
        `own dev server (\`${ownServer}\`), or pass --skip-checkout-check if you are ` +
        'certain this server is this checkout.',
      detail: { base, appDir, hint: 'or --skip-checkout-check' },
    }
  }

  return null
}
