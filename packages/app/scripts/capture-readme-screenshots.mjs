#!/usr/bin/env node
/**
 * Capture the stable, full-UI product images used by the repository README.
 *
 * The default run owns one Vite process and one headed Chromium process. It
 * never starts Wrangler: local gallery requests are fulfilled from the
 * configured content API (dev by default). Every page/context is captured
 * sequentially and closed before the next recipe, keeping WebGPU memory
 * bounded.
 *
 *   pnpm capture:readme
 *   pnpm capture:readme -- --shot studio,home
 *   pnpm capture:readme -- --base https://dev.lumenapeiron.com
 *   pnpm capture:readme -- --help
 */
import { Buffer } from 'node:buffer'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync, } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { probeCapturePage, verifyServedCheckout, } from './dev-server-checkout.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoRoot = resolve(appDir, '../..')

const SHOTS = {
  studio: {
    path: '/',
    output: 'lumen-apeiron-studio.jpg',
    ready: waitForStudio,
    visualTarget: '[data-tour-target="canvas"] canvas',
  },
  home: {
    path: '/#home',
    output: 'lumen-apeiron-home.jpg',
    ready: waitForHome,
    visualTarget: '#home-hero',
  },
  benchmarks: {
    path: '/benchmarks',
    output: 'lumen-apeiron-benchmarks.jpg',
    ready: waitForBenchmarks,
    visualTarget: '[data-testid="benchmarks-page"]',
  },
}

const DEFAULTS = {
  base: null,
  contentBase: 'https://dev.lumenapeiron.com',
  out: resolve(repoRoot, 'docs/readme'),
  port: 5193,
  width: 1600,
  height: 900,
  quality: 91,
  timeout: 90_000,
  headless: false,
  shots: Object.keys(SHOTS),
}

function usage() {
  return `Capture Lumen Apeiron product screenshots

Usage:
  pnpm capture:readme [-- <options>]

Options:
  --shot <ids>          studio,home,benchmarks (default: all)
  --out <dir>           output directory (default: docs/readme)
  --base <url>          capture an existing local or deployed app instead
                        of starting an owned Vite server
  --content-base <url>  gallery API used by a local capture
                        (default: https://dev.lumenapeiron.com)
  --port <number>       owned Vite port (default: 5193, strict)
  --width <pixels>      viewport width (default: 1600)
  --height <pixels>     viewport height (default: 900)
  --quality <1..100>    JPEG quality (default: 91)
  --timeout <ms>        readiness budget per shot (default: 90000)
  --headless            use headless Chromium (headed is safer for WebGPU)
  --help                show this message

Safety:
  The owned server runs Vite only; this script never starts Wrangler. The
  server is placed in its own process group and stopped in a finally block.
  Captures run sequentially in one browser at deviceScaleFactor 1.
`
}

function valueAfter(argv, index, option) {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} needs a value`)
  }
  return value
}

function positiveInteger(raw, option) {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${option} must be a positive integer`)
  }
  return value
}

function parseArgs(argv) {
  const args = { ...DEFAULTS, shots: [...DEFAULTS.shots] }
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--') {
      continue
    } else if (option === '--help' || option === '-h') {
      args.help = true
    } else if (option === '--headless') {
      args.headless = true
    } else if (option === '--shot') {
      args.shots = valueAfter(argv, index, option)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      index += 1
    } else if (option === '--out') {
      args.out = resolve(valueAfter(argv, index, option))
      index += 1
    } else if (option === '--base') {
      args.base = valueAfter(argv, index, option)
      index += 1
    } else if (option === '--content-base') {
      args.contentBase = valueAfter(argv, index, option)
      index += 1
    } else if (option === '--port') {
      args.port = positiveInteger(valueAfter(argv, index, option), option)
      index += 1
    } else if (option === '--width') {
      args.width = positiveInteger(valueAfter(argv, index, option), option)
      index += 1
    } else if (option === '--height') {
      args.height = positiveInteger(valueAfter(argv, index, option), option)
      index += 1
    } else if (option === '--quality') {
      args.quality = positiveInteger(valueAfter(argv, index, option), option)
      index += 1
    } else if (option === '--timeout') {
      args.timeout = positiveInteger(valueAfter(argv, index, option), option)
      index += 1
    } else {
      throw new Error(`Unknown option: ${option}`)
    }
  }

  const unknownShots = args.shots.filter((shot) => !(shot in SHOTS))
  const duplicateShots = args.shots.filter(
    (shot, index) => args.shots.indexOf(shot) !== index,
  )
  if (args.shots.length === 0 || unknownShots.length > 0) {
    throw new Error(
      `--shot must contain one or more of: ${Object.keys(SHOTS).join(', ')}${
        unknownShots.length > 0 ? ` (unknown: ${unknownShots.join(', ')})` : ''
      }`,
    )
  }
  if (duplicateShots.length > 0) {
    throw new Error(
      `--shot contains duplicate ids: ${[...new Set(duplicateShots)].join(', ')}`,
    )
  }
  if (args.quality > 100) throw new Error('--quality must be between 1 and 100')
  if (args.port > 65_535) throw new Error('--port must be at most 65535')

  if (args.base !== null) args.base = new URL(args.base).origin
  args.contentBase = new URL(args.contentBase).origin
  return args
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => {
    globalThis.setTimeout(resolvePromise, milliseconds)
  })
}

function isLocalOrigin(base) {
  const hostname = new URL(base).hostname
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  )
}

function gitValue(args, fallback = 'unknown') {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return fallback
  }
}

function gitBuffer(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return Buffer.alloc(0)
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function captureSourceState() {
  const status = gitBuffer(['status', '--porcelain=v1', '-z'])
  const trackedDiff = gitBuffer(['diff', '--binary', 'HEAD', '--'])
  return {
    commit: gitValue(['rev-parse', 'HEAD']),
    shortCommit: gitValue(['rev-parse', '--short', 'HEAD']),
    headTree: gitValue(['rev-parse', 'HEAD^{tree}']),
    branch: gitValue(['branch', '--show-current']),
    dirty: status.length > 0,
    statusSha256: sha256(status),
    trackedDiffSha256: sha256(trackedDiff),
  }
}

function posixProcessGroupExists(pid) {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return !(
      error instanceof Error &&
      'code' in error &&
      error.code === 'ESRCH'
    )
  }
}

function terminateWindowsTree(pid, force) {
  const args = ['/pid', String(pid), '/t']
  if (force) args.push('/f')
  try {
    execFileSync('taskkill', args, { stdio: 'ignore' })
  } catch {
    // The tree may have exited between the liveness check and taskkill.
  }
}

function startOwnedServer(port) {
  const base = `https://127.0.0.1:${port}`
  const viteEntry = resolve(repoRoot, 'node_modules/vite/bin/vite.js')
  const child = spawn(
    process.execPath,
    [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: appDir,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        BROWSER: 'none',
        NODE_ENV: 'development',
        VITE_GA_ID: '',
        VITE_SKIP_WELCOME: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const log = []
  let exited = null
  let stopping = false
  const collect = (chunk) => {
    for (const rawLine of String(chunk).split('\n')) {
      const line = rawLine.trimEnd()
      if (line.length === 0) continue
      log.push(line)
      if (log.length > 60) log.shift()
    }
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  child.on('exit', (code, signal) => {
    exited = { code, signal }
  })
  child.on('error', (error) => {
    exited = { code: null, signal: null, error: error.message }
  })

  async function stop() {
    if (stopping || child.pid === undefined) return
    stopping = true
    console.log('Stopping the owned Vite server ...')
    const pid = child.pid
    if (process.platform === 'win32') {
      terminateWindowsTree(pid, false)
    } else {
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        // The process group may already be gone.
      }
    }
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const alive =
        process.platform === 'win32'
          ? exited === null
          : posixProcessGroupExists(pid)
      if (!alive) return
      await delay(100)
    }
    if (process.platform === 'win32') {
      terminateWindowsTree(pid, true)
    } else if (posixProcessGroupExists(pid)) {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        // The process group exited between the check and the signal.
      }
    }
  }

  return {
    base,
    log,
    stop,
    get exited() {
      return exited
    },
  }
}

async function waitForOwnedServer(server, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exited !== null) {
      throw new Error(
        `Vite exited before becoming ready (${JSON.stringify(
          server.exited,
        )})\n${server.log.slice(-20).join('\n')}`,
      )
    }
    if ((await probeCapturePage(server.base, 1_500)) === 200) {
      const result = await verifyServedCheckout({
        base: server.base,
        appDir,
        timeoutMs: 10_000,
      })
      if (result.verdict !== 'match') {
        throw new Error(
          `The capture server could not prove it serves this checkout: ${JSON.stringify(
            result,
          )}`,
        )
      }
      return result
    }
    await delay(500)
  }
  throw new Error(
    `Vite did not become ready at ${server.base}\n${server.log
      .slice(-20)
      .join('\n')}`,
  )
}

async function verifyExternalLocalServer(base) {
  const result = await verifyServedCheckout({ base, appDir, timeoutMs: 10_000 })
  if (result.verdict !== 'match') {
    throw new Error(
      `${base} is not serving this checkout (${JSON.stringify(result)}). ` +
        'Use the default owned server or pass a deployed --base URL.',
    )
  }
  return result
}

async function waitForStudio(page, timeout) {
  await page.locator('[data-tour-target="canvas"] canvas').first().waitFor({
    state: 'visible',
    timeout,
  })
  await page.waitForFunction(
    () => {
      const canvas = globalThis.document.querySelector(
        '[data-tour-target="canvas"] canvas',
      )
      return (
        canvas instanceof HTMLCanvasElement &&
        canvas.width > 64 &&
        canvas.height > 64
      )
    },
    undefined,
    { timeout },
  )

  // The selected quality pill exposes the renderer's accumulation progress as
  // an inline CSS property. A timeout is non-fatal: slow GPUs still produce a
  // useful image after the fixed settle below, and the manifest records it.
  try {
    await page.waitForFunction(
      () => {
        const selected = globalThis.document.querySelector(
          '[data-tour-target="quality-presets"] button[class*="selectedPill"]',
        )
        const raw = selected?.style.getPropertyValue('--fill-percent') ?? '0'
        return Number.parseFloat(raw) >= 97
      },
      undefined,
      { timeout: Math.min(timeout, 60_000), polling: 250 },
    )
  } catch {
    return ['Studio did not reach 97% accumulation before capture.']
  }
  await page.waitForTimeout(500)
  return []
}

async function waitForHome(page, timeout) {
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector('#home-hero') !== null ||
      globalThis.document.body.textContent?.includes(
        'The gallery is unavailable right now',
      ),
    undefined,
    { timeout },
  )
  if (
    await page
      .getByText('The gallery is unavailable right now', { exact: false })
      .isVisible()
  ) {
    throw new Error('Home gallery content could not be loaded')
  }
  await page.locator('#home-hero').waitFor({ state: 'visible', timeout })
  await page.waitForFunction(
    () => {
      const hero = globalThis.document.querySelector('#home-hero')
      if (hero === null || hero.childElementCount === 0) return false
      const poster = hero.querySelector('img')
      const canvas = hero.querySelector('canvas')
      const posterReady =
        poster instanceof HTMLImageElement &&
        poster.complete &&
        poster.naturalWidth > 0
      const canvasReady =
        canvas instanceof HTMLCanvasElement &&
        canvas.width > 64 &&
        canvas.height > 64
      return posterReady || canvasReady
    },
    undefined,
    { timeout },
  )
  await page.waitForTimeout(1_500)
  return []
}

async function waitForBenchmarks(page, timeout) {
  await page
    .locator('[data-testid="benchmarks-page"]')
    .waitFor({ state: 'visible', timeout })
  await page
    .getByText('Local GPU ready', { exact: true })
    .waitFor({ state: 'visible', timeout })
  await page.waitForTimeout(500)
  return []
}

function imageStats(page, buffer) {
  const encoded = buffer.toString('base64')
  return page.evaluate(async (base64) => {
    const image = new globalThis.Image()
    image.src = `data:image/jpeg;base64,${base64}`
    await image.decode()
    const scale = Math.min(1, 320 / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = globalThis.document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) throw new Error('Could not inspect captured pixels')
    context.drawImage(image, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height).data
    let sum = 0
    let sumSquares = 0
    let maximum = 0
    let colorful = 0
    const count = pixels.length / 4
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]
      const green = pixels[index + 1]
      const blue = pixels[index + 2]
      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722
      sum += luma
      sumSquares += luma * luma
      maximum = Math.max(maximum, red, green, blue)
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 18) {
        colorful += 1
      }
    }
    const mean = sum / count
    return {
      mean,
      standardDeviation: Math.sqrt(
        Math.max(0, sumSquares / count - mean * mean),
      ),
      maximum,
      colorfulFraction: colorful / count,
    }
  }, encoded)
}

async function installGalleryProxy(page, base, contentBase, responses) {
  if (
    !isLocalOrigin(base) ||
    new URL(base).origin === new URL(contentBase).origin
  ) {
    return false
  }
  await page.route('**/api/gallery**', async (route) => {
    const source = new URL(route.request().url())
    const target = new URL(`${source.pathname}${source.search}`, contentBase)
    const headers = { ...route.request().headers() }
    delete headers.host
    delete headers.origin
    delete headers.referer
    const response = await route.fetch({
      url: target.href,
      headers,
      maxRedirects: 5,
    })
    const body = await response.body()
    let itemIds = []
    try {
      const payload = JSON.parse(body.toString('utf8'))
      itemIds = Array.isArray(payload?.items)
        ? payload.items
            .map((item) => item?.slug ?? item?.id)
            .filter((id) => typeof id === 'string' || typeof id === 'number')
        : []
    } catch {
      // The digest still identifies non-JSON or changed response formats.
    }
    responses.push({
      url: target.href,
      status: response.status(),
      sha256: sha256(body),
      itemCount: itemIds.length,
      itemIds,
    })
    await route.fulfill({ response, body })
  })
  return true
}

async function captureShot(browser, recipeId, options) {
  const recipe = SHOTS[recipeId]
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    ignoreHTTPSErrors: true,
  })
  const warnings = []
  const galleryResponses = []
  try {
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('chaos-master-welcome-dismissed', 'true')
      globalThis.localStorage.setItem('chaos-master-dontShowWelcome', 'true')
      globalThis.localStorage.setItem('chaos-master-hardwareTier', '"high"')
      globalThis.localStorage.setItem('cm-ui-theme', 'dark')
    })
    const page = await context.newPage()
    page.setDefaultTimeout(options.timeout)
    page.on('pageerror', (error) => {
      warnings.push(`page error: ${error.message}`)
    })
    page.on('console', (message) => {
      if (message.type() === 'error')
        warnings.push(`console: ${message.text()}`)
    })
    const proxiedGallery = await installGalleryProxy(
      page,
      options.base,
      options.contentBase,
      galleryResponses,
    )
    const url = new URL(recipe.path, `${options.base}/`).href
    console.log(`Capturing ${recipeId} from ${url} ...`)
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout,
    })
    warnings.push(...(await recipe.ready(page, options.timeout)))
    await page.evaluate(() => globalThis.document.fonts.ready)
    await page.addStyleTag({
      content:
        'html{scroll-behavior:auto!important}*{caret-color:transparent!important}',
    })
    await page.evaluate(() => {
      globalThis.scrollTo(0, 0)
    })

    const auditBuffer = await page
      .locator(recipe.visualTarget)
      .first()
      .screenshot({ type: 'jpeg', quality: 75 })
    const stats = await imageStats(page, auditBuffer)
    if (stats.maximum < 36 || stats.standardDeviation < 1.5) {
      throw new Error(
        `${recipeId} visual readiness check found a blank capture: ${JSON.stringify(
          stats,
        )}`,
      )
    }

    const stagedOutput = resolve(options.stagingOut, recipe.output)
    const publicOutput = resolve(options.out, recipe.output)
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: options.quality,
      fullPage: false,
    })
    writeFileSync(stagedOutput, screenshot)
    console.log(
      `  staged ${relative(repoRoot, publicOutput)} (${Math.round(screenshot.length / 1024)} KiB)`,
    )
    return {
      id: recipeId,
      route: recipe.path,
      output: relative(repoRoot, publicOutput),
      viewport: {
        width: options.width,
        height: options.height,
        deviceScaleFactor: 1,
      },
      setup: [
        'fresh browser context',
        'dark theme',
        'welcome dismissed',
        'high hardware tier',
      ],
      readiness: recipe.ready.name,
      jpegQuality: options.quality,
      galleryContentProxy: proxiedGallery ? options.contentBase : null,
      galleryResponses,
      bytes: screenshot.length,
      visualStats: stats,
      warnings: warnings.slice(0, 20),
    }
  } finally {
    await context.close()
  }
}

function publishCaptureSet(stagingOut, out, captures) {
  mkdirSync(out, { recursive: true })
  for (const capture of captures) {
    const filename = basename(capture.output)
    renameSync(resolve(stagingOut, filename), resolve(out, filename))
  }
  // Publish the manifest last so it never describes a partially captured run.
  renameSync(
    resolve(stagingOut, 'manifest.json'),
    resolve(out, 'manifest.json'),
  )
}

let options
try {
  options = parseArgs(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.error(`\n${usage()}`)
  process.exit(2)
}

if (options.help) {
  console.log(usage())
  process.exit(0)
}

const sourceState = captureSourceState()
mkdirSync(dirname(options.out), { recursive: true })
const stagingOut = mkdtempSync(
  resolve(dirname(options.out), `.${basename(options.out)}-capture-`),
)
options.stagingOut = stagingOut

let server = null
let browser = null
let cleanupStarted = false

async function cleanup() {
  if (cleanupStarted) return
  cleanupStarted = true
  if (browser !== null) {
    await browser.close().catch(() => {})
    browser = null
  }
  if (server !== null) await server.stop()
  rmSync(stagingOut, { recursive: true, force: true })
}

function onSignal() {
  void cleanup().finally(() => process.exit(130))
}

process.once('SIGINT', onSignal)
process.once('SIGTERM', onSignal)

try {
  let serverMode = 'external'
  let checkout = null
  if (options.base === null) {
    serverMode = 'owned-vite'
    server = startOwnedServer(options.port)
    options.base = server.base
    console.log(`Starting an owned Vite server at ${options.base} ...`)
    checkout = await waitForOwnedServer(server)
  } else if (isLocalOrigin(options.base)) {
    checkout = await verifyExternalLocalServer(options.base)
  }

  browser = await chromium.launch({
    headless: options.headless,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--ignore-gpu-blocklist',
    ],
  })

  const captures = []
  for (const shot of options.shots) {
    captures.push(await captureShot(browser, shot, options))
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      ...sourceState,
      base: options.base,
      mode: serverMode,
      servedCheckout:
        checkout?.served === undefined || checkout.served === null
          ? null
          : relative(repoRoot, checkout.served),
    },
    browser: {
      engine: 'chromium',
      version: browser.version(),
      headless: options.headless,
      sequential: true,
    },
    captures,
  }
  const manifestPath = resolve(stagingOut, 'manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  publishCaptureSet(stagingOut, options.out, captures)
  console.log(`Published ${relative(repoRoot, options.out)}`)
} finally {
  process.off('SIGINT', onSignal)
  process.off('SIGTERM', onSignal)
  await cleanup()
}
