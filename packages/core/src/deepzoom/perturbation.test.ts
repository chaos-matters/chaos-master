import { describe, expect, it } from 'vitest'
import { parseFixed, scaledNumberToFixed } from './bigFixed'
import { buildBla } from './bla'
import { GUARD_BITS, pixelSpacing, viewBits } from './deepZoomView'
import { packOrbit, readOrbitEntry } from './gpuPacking'
import { BAILOUT, renderPixel, STATUS_ESCAPED, STATUS_INTERIOR, } from './perturbation'
import { computeOrbit } from './referenceOrbit'
import { STAND_IN_GUARD_BITS } from './referencePlan'
import type { KernelOrbit, KernelParams } from './perturbation'

/**
 * The kernel mirror against the truth: every sampled pixel is also iterated
 * directly in BigInt at the pixel's own coordinate, and the escape counts
 * must agree. This is what licenses the f32 arithmetic on the GPU.
 */

const SIZE = 256
const SEAHORSE = {
  re: '-0.743643887037158704752191506114774',
  im: '0.131825904205311970493132056385139',
}

interface Scene {
  kind: 'mandelbrot' | 'julia'
  re: string
  im: string
  zoomLog2: number
  maxIterations: number
  julia?: { re: string; im: string }
  /** The reference orbit passes within 2^-60 of 0: the floatexp step runs. */
  tinyReference?: boolean
}

/**
 * Direct iteration at full precision, with the derivative carried in doubles
 * along the exact orbit: the escape count (or -1) and the true distance to
 * the set in pixels, which decides how much agreement to demand.
 */
function exactEscape(
  scene: Scene,
  dx: number,
  dy: number,
  bits: number,
): { n: number; dePx: number } {
  const s = pixelSpacing(scene.zoomLog2, SIZE)
  const px =
    parseFixed(scene.re, bits)! +
    scaledNumberToFixed(dx * s.mantissa, s.exponent, bits)
  const py =
    parseFixed(scene.im, bits)! +
    scaledNumberToFixed(dy * s.mantissa, s.exponent, bits)
  const b = BigInt(bits)
  const julia = scene.kind === 'julia'
  const cx = julia ? parseFixed(scene.julia!.re, bits)! : px
  const cy = julia ? parseFixed(scene.julia!.im, bits)! : py
  let x = julia ? px : 0n
  let y = julia ? py : 0n
  let dRe = julia ? 1 : 0
  let dIm = 0
  const r2 = BigInt(BAILOUT * BAILOUT) << b
  const toDouble = (v: bigint) => Number(v >> (b - 60n)) * 2 ** -60
  const spacing = s.mantissa * 2 ** s.exponent
  for (let n = 1; n <= scene.maxIterations; n += 1) {
    const zr = toDouble(x)
    const zi = toDouble(y)
    const nr = 2 * (zr * dRe - zi * dIm) + (julia ? 0 : 1)
    dIm = 2 * (zr * dIm + zi * dRe)
    dRe = nr
    const x2 = (x * x) >> b
    const y2 = (y * y) >> b
    const xy = (x * y) >> (b - 1n)
    x = x2 - y2 + cx
    y = xy + cy
    if ((x * x + y * y) >> b > r2) {
      const abs = Math.hypot(toDouble(x), toDouble(y))
      const de = (2 * abs * Math.log(abs)) / Math.hypot(dRe, dIm)
      return { n, dePx: de / spacing }
    }
  }
  return { n: -1, dePx: Number.POSITIVE_INFINITY }
}

function kernelFor(scene: Scene, useBla: boolean, bits: number): KernelParams {
  const s = pixelSpacing(scene.zoomLog2, SIZE)
  const julia = scene.kind === 'julia'
  const main = computeOrbit({
    startRe: julia ? scene.re : '0',
    startIm: julia ? scene.im : '0',
    cRe: julia ? scene.julia!.re : scene.re,
    cIm: julia ? scene.julia!.im : scene.im,
    bits,
    maxIterations: scene.maxIterations,
    escapeRadius: BAILOUT,
  })
  // The widest pixel offset any sample uses, with headroom.
  const cMaxLog2 = s.exponent + Math.log2(s.mantissa * SIZE)
  const mainOrbit: KernelOrbit = {
    data: packOrbit(main),
    length: main.length,
    bla: buildBla(main, { hasDc: !julia, start: julia ? 0 : 1, cMaxLog2 }),
  }
  let critical = mainOrbit
  if (julia) {
    const k = computeOrbit({
      startRe: '0',
      startIm: '0',
      cRe: scene.julia!.re,
      cIm: scene.julia!.im,
      bits,
      maxIterations: scene.maxIterations,
      escapeRadius: BAILOUT,
    })
    critical = {
      data: packOrbit(k),
      length: k.length,
      bla: buildBla(k, { hasDc: false, start: 1, cMaxLog2 }),
    }
  }
  return {
    hasDc: !julia,
    spacingMant: s.mantissa,
    spacingExp: s.exponent,
    maxIterations: scene.maxIterations,
    useBla,
    wantDerivative: true,
    orbits: [mainOrbit, critical],
  }
}

/** A deterministic scatter of pixel offsets over the view. */
const SAMPLES: [number, number][] = Array.from({ length: 24 }, (_, i) => {
  const t = i * 2.399963
  const r = (SIZE / 2) * Math.sqrt((i + 0.5) / 24)
  return [Math.round(r * Math.cos(t)), Math.round(r * Math.sin(t))]
})

/**
 * Each sample against exact iteration with twice the explorer's guard bits.
 * `guardBits` is how far below the pixel size the reference's own precision
 * reaches: by default as far as the exact iteration's.
 */
function compare(
  scene: Scene,
  useBla: boolean,
  samples: number,
  guardBits = 2 * GUARD_BITS,
) {
  const bits = viewBits(scene.zoomLog2, SIZE) + GUARD_BITS
  const params = kernelFor(scene, useBla, bits - 2 * GUARD_BITS + guardBits)
  const s = pixelSpacing(scene.zoomLog2, SIZE)
  return SAMPLES.slice(0, samples).map(([dx, dy]) => {
    const truth = exactEscape(scene, dx, dy, bits)
    const px = renderPixel(params, [dx * s.mantissa, dy * s.mantissa])
    const got =
      px.status === STATUS_ESCAPED
        ? px.n
        : px.status === STATUS_INTERIOR
          ? -1
          : -2
    return { dx, dy, truth: truth.n, dePx: truth.dePx, got }
  })
}

/**
 * A pixel further than 1/256 of a pixel from the set must get exactly the
 * count exact iteration gives. Closer than that, the count is decided by
 * digits past the f32 delta's 24 bits, so it is not compared: at 1e100 most
 * of a view is that close, and the measured disagreements all sit below
 * 2^-11 px. Enough pixels must be resolvable for the scene to prove anything.
 */
function expectAgreement(rows: ReturnType<typeof compare>) {
  const resolvable = rows.filter((r) => r.dePx >= 1 / 256)
  const wrong = resolvable.filter((r) => r.truth !== r.got)
  expect(wrong, JSON.stringify(wrong)).toEqual([])
  expect(resolvable.length).toBeGreaterThanOrEqual(Math.min(8, rows.length / 3))
  // A test that only saw one kind of pixel would prove little.
  expect(new Set(rows.map((r) => r.truth)).size).toBeGreaterThan(3)
}

/** log2 of the smallest |Z_n|, n >= 1, of the scene's reference orbit. */
function smallestReference(scene: Scene): number {
  const params = kernelFor(scene, false, viewBits(scene.zoomLog2, SIZE) + 64)
  let smallest = Number.POSITIVE_INFINITY
  for (const orbit of params.orbits) {
    for (let n = 1; n < orbit.length; n += 1) {
      const z = readOrbitEntry(orbit.data, n)
      const size = Math.hypot(z.re, z.im)
      if (size > 0) smallest = Math.min(smallest, z.e + Math.log2(size))
    }
  }
  return smallest
}

const RABBIT = { re: '-0.12256116687665', im: '0.74486176661974' }

// The period-3 nucleus: its critical orbit returns to 0 every third step.
const AIRPLANE = {
  re: '-1.754877666246692760049508896358528691894606617772793143989283970646080655128',
  im: '0',
}

// Deep centres found by walking towards the highest escape count, 2^4 per
// step, from the seahorse point (and from 0.5i for the rabbit Julia set).
const scenes: [string, Scene, number][] = [
  [
    'Mandelbrot, shallow',
    { kind: 'mandelbrot', ...SEAHORSE, zoomLog2: 8, maxIterations: 600 },
    24,
  ],
  [
    'Mandelbrot, 1e5',
    { kind: 'mandelbrot', ...SEAHORSE, zoomLog2: 17, maxIterations: 3000 },
    24,
  ],
  [
    'Mandelbrot, 1e24',
    { kind: 'mandelbrot', ...SEAHORSE, zoomLog2: 80, maxIterations: 20000 },
    24,
  ],
  [
    'Mandelbrot, 1e45 (rescaled deltas)',
    {
      kind: 'mandelbrot',
      re: '-0.743643887037158705788269260115841076482576272774585',
      im: '0.131825904205311969195485641764580768967093211354255',
      zoomLog2: 152,
      maxIterations: 20000,
    },
    16,
  ],
  [
    'Mandelbrot, 1e75',
    {
      kind: 'mandelbrot',
      re: '-0.743643887037158705788269260115841076482576272614578647209894395787694528699625322',
      im: '0.131825904205311969195485641764580768967093211085685580704007548116196275472616128',
      zoomLog2: 252,
      maxIterations: 40000,
    },
    12,
  ],
  [
    'Mandelbrot, 1e103',
    {
      kind: 'mandelbrot',
      re: '-0.7436438870371587057882692601158410764825762726145786472098943957876945286996481755008104598049341075041819833',
      im: '0.1318259042053119691954856417645807689670932110856855807040075481161962754725901962540983759140666095417402054',
      zoomLog2: 344,
      maxIterations: 100000,
    },
    8,
  ],
  [
    // A period-998 minibrot, found by Newton from the 1e45 centre. The
    // reference sits on its nucleus, so every 998th value is almost 0.
    'Mandelbrot, minibrot nucleus (tiny reference)',
    {
      kind: 'mandelbrot',
      re: '-0.74364388703715887077806454349364257504760996232125506021388744740332244044484948',
      im: '0.13182590420531229282109735487476726526298859967904297493747635123907031437169717',
      zoomLog2: 49,
      maxIterations: 30000,
      tinyReference: true,
    },
    16,
  ],
  [
    'Julia, 1e33 (rescaled deltas)',
    {
      kind: 'julia',
      re: '0.219641694418744870666226149601692887939',
      im: '0.279530238717129787674324509639513191261',
      zoomLog2: 110,
      maxIterations: 2000,
      julia: RABBIT,
    },
    24,
  ],
  [
    'Julia, 1e50',
    {
      kind: 'julia',
      re: '0.2196416944187448706662261496016936214292141340785582171',
      im: '0.2795302387171297876743245096395124912436791094449249151',
      zoomLog2: 166,
      maxIterations: 2000,
      julia: RABBIT,
    },
    24,
  ],
  [
    // Centred on the repelling fixed point, which is on the Julia set.
    'Julia, airplane at 1e30 (tiny critical orbit)',
    {
      kind: 'julia',
      re: '1.9159370276416577842051813877480532778989139263018473152394452238872518656135',
      im: '0',
      zoomLog2: 100,
      maxIterations: 3000,
      julia: AIRPLANE,
      tinyReference: true,
    },
    24,
  ],
]

describe.each(scenes)('%s', (_name, scene, samples) => {
  it('matches exact iteration with plain perturbation', () => {
    expectAgreement(compare(scene, false, samples))
  })

  it('matches it with a stand-in reference, 32 bits past the pixel size', () => {
    expectAgreement(compare(scene, true, samples, STAND_IN_GUARD_BITS))
  })

  it('matches exact iteration with bilinear approximation', () => {
    expectAgreement(compare(scene, true, samples))
  })

  it.runIf(scene.tinyReference)(
    'passes the reference within 2^-60 of zero',
    () => {
      expect(smallestReference(scene)).toBeLessThan(-60)
    },
  )
})

describe('a Julia view centred outside the bailout radius', () => {
  // The main orbit is then one entry long: the reference escapes at once and
  // there is no Z_1 to step along. The pixel must start on the critical orbit.
  it('escapes where exact iteration does', () => {
    const scene: Scene = {
      kind: 'julia',
      re: '1000',
      im: '0',
      zoomLog2: 4,
      maxIterations: 300,
      julia: RABBIT,
    }
    const bits = viewBits(scene.zoomLog2, SIZE) + 64
    const params = kernelFor(scene, true, bits)
    expect(params.orbits[0].length).toBe(1)
    const s = pixelSpacing(scene.zoomLog2, SIZE)
    for (const [dx, dy] of SAMPLES.slice(0, 8)) {
      const truth = exactEscape(scene, dx, dy, bits)
      const px = renderPixel(params, [dx * s.mantissa, dy * s.mantissa])
      expect(px.status).toBe(STATUS_ESCAPED)
      expect(px.n).toBe(truth.n)
    }
  })
})

describe('a superattracting cycle', () => {
  // At 180 bits the airplane's critical orbit returns to exactly 0, so a
  // captured pixel's delta squares every period and its exponent doubles.
  // Unfloored it leaves i32 by n = 142, where the shader wrapped around and
  // reported an escape at 143 for pixels that never escape.
  it('keeps a captured pixel interior, with exponents inside i32', () => {
    const s = pixelSpacing(100, 800)
    const scene = {
      re: '1.9159370276416577842051813877480532778989139263018473152394452238872518656135',
      c: AIRPLANE,
    }
    const orbit = (startRe: string) =>
      computeOrbit({
        startRe,
        startIm: '0',
        cRe: scene.c.re,
        cIm: scene.c.im,
        bits: 180,
        maxIterations: 3000,
        escapeRadius: BAILOUT,
      })
    const main = orbit(scene.re)
    const critical = orbit('0')
    const cMaxLog2 = s.exponent + 12
    const params: KernelParams = {
      hasDc: false,
      spacingMant: s.mantissa,
      spacingExp: s.exponent,
      maxIterations: 3000,
      useBla: true,
      wantDerivative: true,
      orbits: [
        {
          data: packOrbit(main),
          length: main.length,
          bla: buildBla(main, { hasDc: false, start: 0, cMaxLog2 }),
        },
        {
          data: packOrbit(critical),
          length: critical.length,
          bla: buildBla(critical, { hasDc: false, start: 1, cMaxLog2 }),
        },
      ],
    }
    // Pixel (352, 405) of a 1280 x 800 view.
    const px = renderPixel(params, [
      (352.5 - 640) * s.mantissa,
      (400 - 405.5) * s.mantissa,
    ])
    expect(px.status).toBe(STATUS_INTERIOR)
  })
})
