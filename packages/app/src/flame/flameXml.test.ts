import { describe, expect, it } from 'vitest'
import { rgbToOklab } from './flam3PaletteParser'
import { FLAM3_SAMPLES } from './flam3Samples'
import { exportFlameXml, extractFlamePalette, isFlameXmlContent, parseFlameXml, resolveVariationType, } from './flameXml'
import { isVariationType } from './variations'

// ── helpers ───────────────────────────────────────────────────────────────

/** Read a parsed transform by index without fighting the descriptor types. */
function xforms(
  flame: ReturnType<typeof parseFlameXml>,
): Record<string, never>[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.values(flame.transforms) as any
}

function affineOf(t: Record<string, never>, which: 'preAffine' | 'postAffine') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (t as any)[which] as Record<string, number>
}

// ── Sample .flame XML fixtures ────────────────────────────────────────────

const SIMPLE_FLAME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Simple Test" version="Apophysis 7X" size="800 600"
       center="0 0" scale="200" oversample="1" filter="0.5"
       quality="100" background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`

// A deliberately asymmetric affine so coefs-order bugs are visible.
// flam3 coefs = "c00 c01 c10 c11 c20 c21".
const ASYMMETRIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Asym" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" spherical="1"
         coefs="0.8 -0.2 0.3 0.1 0.9 -0.1"/>
</flame>`

// Has an explicit post affine.
const POST_AFFINE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Post" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1"
         coefs="1 0 0 1 0 0" post="2 0 0 2 0.5 -0.5"/>
</flame>`

// Embedded palette: red at 0, blue at 1 (2 stops). xform color="0" → red.
const PALETTE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Pal" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
  <palette count="2" format="RGB">ff0000 0000ff</palette>
</flame>`

const VAR_ELEMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Var Elements" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" coefs="1 0 0 1 0 0">
    <var name="linear" weight="0.7"/>
    <var name="horseshoe" weight="0.3"/>
  </xform>
</flame>`

// Parametric variation with flam3 params (julian_power / julian_dist).
const PARAM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Param" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" julian="1" julian_power="3" julian_dist="2"
         coefs="1 0 0 1 0 0"/>
</flame>`

// A finalxform (post ∘ coefs) plus a normal xform.
const FINAL_XFORM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Final" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
  <finalxform color="0" linear="1" coefs="2 0 0 3 0.5 -0.5"/>
</flame>`

// ── resolveVariationType ──────────────────────────────────────────────────

describe('resolveVariationType', () => {
  it('maps standard flam3 names to chaos types', () => {
    expect(resolveVariationType('linear')).toBe('linearVar')
    expect(resolveVariationType('spherical')).toBe('sphericalVar')
    expect(resolveVariationType('swirl')).toBe('swirlVar')
    expect(resolveVariationType('horseshoe')).toBe('horseshoeVar')
    expect(resolveVariationType('julia')).toBe('juliaVar')
    expect(resolveVariationType('polar')).toBe('polarVar')
  })

  it('resolves variations that DO exist instead of collapsing to linear', () => {
    // These were all mis-mapped to linearVar before.
    expect(resolveVariationType('pie')).toBe('pieVar')
    expect(resolveVariationType('ngon')).toBe('ngonVar')
    expect(resolveVariationType('mobius')).toBe('mobiusVar')
    expect(resolveVariationType('foci')).toBe('fociVar')
    expect(resolveVariationType('wedge')).toBe('wedgeVar')
    expect(resolveVariationType('separation')).toBe('separationVar')
    expect(resolveVariationType('curl')).toBe('curlVar')
    expect(resolveVariationType('waves2')).toBe('waves2Var')
    expect(resolveVariationType('boarders2')).toBe('boarders2Var')
  })

  it('resolves flam3 snake_case + renamed names via the registry', () => {
    expect(resolveVariationType('julian')).toBe('juliaNVar')
    expect(resolveVariationType('juliascope')).toBe('juliaScopeVar')
    expect(resolveVariationType('wedge_julia')).toBe('wedgeJuliaVar')
    expect(resolveVariationType('wedge_sph')).toBe('wedgeSphVar')
    expect(resolveVariationType('pre_blur')).toBe('preBlurVar')
    expect(resolveVariationType('gaussian_blur')).toBe('gaussianBlurVar')
  })

  it('applies explicit aliases', () => {
    expect(resolveVariationType('sinusoidal')).toBe('sinVar')
    expect(resolveVariationType('sinusodial')).toBe('sinVar')
    expect(resolveVariationType('blur')).toBe('circleBlurVar')
  })

  it('returns undefined for unknown variations (does not invent a type)', () => {
    expect(resolveVariationType('customFractal')).toBeUndefined()
    expect(resolveVariationType('totally_made_up_xyz')).toBeUndefined()
    expect(resolveVariationType('')).toBeUndefined()
  })

  it('is case insensitive', () => {
    expect(resolveVariationType('Linear')).toBe('linearVar')
    expect(resolveVariationType('SPHERICAL')).toBe('sphericalVar')
  })

  it('only ever returns valid registry types', () => {
    const names = [
      'linear',
      'spherical',
      'swirl',
      'julia',
      'julian',
      'juliascope',
      'pie',
      'ngon',
      'mobius',
      'foci',
      'wedge',
      'wedge_julia',
      'wedge_sph',
      'separation',
      'curl',
      'waves',
      'waves2',
      'boarders',
      'boarders2',
      'sinusoidal',
      'gaussian_blur',
      'blur',
      'pre_blur',
      'horseshoe',
      'bubble',
      'eyefish',
      'cylinder',
      'fan',
      'rings',
      'disc',
      'heart',
    ]
    for (const n of names) {
      const t = resolveVariationType(n)
      if (t !== undefined) expect(isVariationType(t)).toBe(true)
    }
  })
})

// The canonical flam3 variation set (variations 0-98 from flam3/variations.c).
// Every one must resolve to a Chaos Master type.
const CANONICAL_FLAM3 = [
  'linear',
  'sinusoidal',
  'spherical',
  'swirl',
  'horseshoe',
  'polar',
  'handkerchief',
  'heart',
  'disc',
  'spiral',
  'hyperbolic',
  'diamond',
  'ex',
  'julia',
  'bent',
  'waves',
  'fisheye',
  'popcorn',
  'exponential',
  'power',
  'cosine',
  'rings',
  'fan',
  'blob',
  'pdj',
  'fan2',
  'rings2',
  'eyefish',
  'bubble',
  'cylinder',
  'perspective',
  'noise',
  'julian',
  'juliascope',
  'blur',
  'gaussian_blur',
  'radial_blur',
  'pie',
  'ngon',
  'curl',
  'rectangles',
  'arch',
  'tangent',
  'square',
  'rays',
  'blade',
  'secant2',
  'twintrian',
  'cross',
  'disc2',
  'super_shape',
  'flower',
  'conic',
  'parabola',
  'bent2',
  'bipolar',
  'boarders',
  'butterfly',
  'cell',
  'cpow',
  'curve',
  'edisc',
  'elliptic',
  'escher',
  'foci',
  'lazysusan',
  'loonie',
  'pre_blur',
  'modulus',
  'oscilloscope',
  'polar2',
  'popcorn2',
  'scry',
  'separation',
  'split',
  'splits',
  'stripes',
  'wedge',
  'wedge_julia',
  'wedge_sph',
  'whorl',
  'waves2',
  'exp',
  'log',
  'sin',
  'cos',
  'tan',
  'sec',
  'csc',
  'cot',
  'sinh',
  'cosh',
  'tanh',
  'sech',
  'csch',
  'coth',
  'auger',
  'flux',
  'mobius',
]

describe('flam3 variation coverage', () => {
  it('maps every canonical flam3 variation (0-98) to a valid type', () => {
    for (const name of CANONICAL_FLAM3) {
      const t = resolveVariationType(name)
      expect(t, `flam3 "${name}" should map`).toBeDefined()
      expect(isVariationType(t!), `"${name}" -> "${t}"`).toBe(true)
    }
  })
})

// ── isFlameXmlContent ──────────────────────────────────────────────────────

describe('isFlameXmlContent', () => {
  it('detects valid flame XML', () => {
    expect(isFlameXmlContent(SIMPLE_FLAME_XML)).toBe(true)
  })
  it('rejects non-XML content', () => {
    expect(isFlameXmlContent('{"type":"json"}')).toBe(false)
    expect(isFlameXmlContent('plain text')).toBe(false)
  })
  it('detects flame tag even with leading whitespace', () => {
    expect(isFlameXmlContent('  \n  <flame name="x">')).toBe(true)
  })
})

// ── parseFlameXml ──────────────────────────────────────────────────────────

describe('parseFlameXml', () => {
  it('parses a simple single-xform flame', () => {
    const result = parseFlameXml(SIMPLE_FLAME_XML)
    expect(result.metadata?.name).toBe('Simple Test')
    expect(Object.keys(result.transforms)).toHaveLength(1)
  })

  it('unpacks flam3 coefs into preAffine with the correct order', () => {
    // coefs="c00 c01 c10 c11 c20 c21" = "0.8 -0.2 0.3 0.1 0.9 -0.1"
    // chaos: a=c00, b=c10, c=c20, d=c01, e=c11, f=c21
    const t = xforms(parseFlameXml(ASYMMETRIC_XML))[0]!
    const pre = affineOf(t, 'preAffine')
    expect(pre.a).toBeCloseTo(0.8)
    expect(pre.b).toBeCloseTo(0.3)
    expect(pre.c).toBeCloseTo(0.9)
    expect(pre.d).toBeCloseTo(-0.2)
    expect(pre.e).toBeCloseTo(0.1)
    expect(pre.f).toBeCloseTo(-0.1)
    // coefs is the PRE-variation affine; post stays identity without a `post`.
    const post = affineOf(t, 'postAffine')
    expect(post).toEqual({ a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 })
  })

  it('parses an explicit post affine into postAffine', () => {
    const t = xforms(parseFlameXml(POST_AFFINE_XML))[0]!
    const post = affineOf(t, 'postAffine')
    // post="2 0 0 2 0.5 -0.5" → a=2,b=0,c=0.5,d=0,e=2,f=-0.5
    expect(post.a).toBeCloseTo(2)
    expect(post.e).toBeCloseTo(2)
    expect(post.c).toBeCloseTo(0.5)
    expect(post.f).toBeCloseTo(-0.5)
  })

  it('keeps flam3 variation weights additive (does NOT normalize them)', () => {
    // linear="1" spherical="1" must stay 1 and 1, not 0.5 / 0.5.
    const t = xforms(parseFlameXml(ASYMMETRIC_XML))[0]!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weights = Object.values((t as any).variations).map(
      (v: unknown) => (v as { weight: number }).weight,
    )
    expect(weights).toHaveLength(2)
    for (const w of weights) expect(w).toBeCloseTo(1)
  })

  it('bakes per-transform colour from the embedded palette', () => {
    const t = xforms(parseFlameXml(PALETTE_XML))[0]!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const color = (t as any).color as { x: number; y: number }
    const red = rgbToOklab(255, 0, 0) // color index 0 → first stop (red)
    expect(color.x).toBeCloseTo(red.a, 3)
    expect(color.y).toBeCloseTo(red.b, 3)
  })

  it('parses variations from <var> child elements', () => {
    const t = xforms(parseFlameXml(VAR_ELEMENT_XML))[0]!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(Object.keys((t as any).variations)).toHaveLength(2)
  })

  it('imports parametric variation params (julian_power/dist)', () => {
    const t = xforms(parseFlameXml(PARAM_XML))[0]!
    const vars: { type: string; params?: Record<string, number> }[] =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.values((t as any).variations)
    const julian = vars.find((v) => v.type === 'juliaNVar')
    expect(julian).toBeDefined()
    expect(julian!.params!.power).toBeCloseTo(3)
    expect(julian!.params!.dist).toBeCloseTo(2)
    // The param attributes must NOT be mis-read as their own variations.
    expect(vars).toHaveLength(1)
  })

  it('imports a finalxform into finalTransform (post ∘ coefs)', () => {
    const flame = parseFlameXml(FINAL_XFORM_XML)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ft = (flame as any).finalTransform as Record<string, number>
    expect(ft).toBeDefined()
    // coefs "2 0 0 3 0.5 -0.5" → a=2, b=0, c=0.5, d=0, e=3, f=-0.5
    expect(ft.a).toBeCloseTo(2)
    expect(ft.e).toBeCloseTo(3)
    expect(ft.c).toBeCloseTo(0.5)
    expect(ft.f).toBeCloseTo(-0.5)
    // The finalxform is NOT counted as a regular transform.
    expect(Object.keys(flame.transforms)).toHaveLength(1)
  })

  it('skips unknown variations instead of failing the whole import', () => {
    const xml = `<?xml version="1.0"?>
<flame name="Mixed" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" totally_made_up="0.5" coefs="1 0 0 1 0 0"/>
</flame>`
    const t = xforms(parseFlameXml(xml))[0]!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const types = Object.values((t as any).variations).map(
      (v: unknown) => (v as { type: string }).type,
    )
    expect(types).toContain('linearVar')
    expect(types).not.toContain('totally_made_upVar')
  })

  it('converts background 0-255 to 0-1', () => {
    const xml = `<?xml version="1.0"?>
<flame name="Bg" size="800 600" center="0 0" scale="200"
       background="255 128 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`
    const bg = parseFlameXml(xml).renderSettings.backgroundColor!
    expect(bg[0]).toBeCloseTo(1)
    expect(bg[1]).toBeCloseTo(128 / 255)
    expect(bg[2]).toBeCloseTo(0)
  })

  it('extracts camera + exposure from flam3 attributes', () => {
    const result = parseFlameXml(ASYMMETRIC_XML)
    expect(result.renderSettings.camera.zoom).toBeGreaterThan(0)
    expect(result.renderSettings.camera.position).toHaveLength(2)
    expect(result.renderSettings.exposure).toBeGreaterThan(0)
  })

  it('normalizes transform probabilities to sum ~1', () => {
    const xml = `<?xml version="1.0"?>
<flame name="P" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="0.6" color="0" linear="1" coefs="1 0 0 1 0 0"/>
  <xform weight="0.4" color="1" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`
    const total = Object.values(parseFlameXml(xml).transforms).reduce(
      (s, t) => s + (t.probability ?? 0),
      0,
    )
    expect(total).toBeGreaterThan(0.99)
    expect(total).toBeLessThan(1.01)
  })

  it('throws on invalid XML / missing <flame>', () => {
    expect(() => parseFlameXml('not xml')).toThrow()
    expect(() => parseFlameXml('<root><notflame/></root>')).toThrow(
      'Invalid .flame file',
    )
  })
})

// ── extractFlamePalette ────────────────────────────────────────────────────

describe('extractFlamePalette', () => {
  it('extracts an embedded gradient as a Palette', () => {
    const pal = extractFlamePalette(PALETTE_XML)
    expect(pal).toBeDefined()
    expect(pal!.entries.length).toBeGreaterThan(1)
    expect(pal!.source).toBe('imported')
  })

  it('returns undefined when there is no palette', () => {
    expect(extractFlamePalette(SIMPLE_FLAME_XML)).toBeUndefined()
  })
})

// ── exportFlameXml ─────────────────────────────────────────────────────────

describe('exportFlameXml', () => {
  it('round-trips the affine through preAffine with coefs order intact', () => {
    const original = parseFlameXml(ASYMMETRIC_XML)
    const reparsed = parseFlameXml(exportFlameXml(original))
    const a0 = affineOf(xforms(original)[0]!, 'preAffine')
    const a1 = affineOf(xforms(reparsed)[0]!, 'preAffine')
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
      expect(a1[k]).toBeCloseTo(a0[k]!, 4)
    }
  })

  it('round-trips a post affine', () => {
    const original = parseFlameXml(POST_AFFINE_XML)
    const xml = exportFlameXml(original)
    expect(xml).toContain('post=')
    const post = affineOf(xforms(parseFlameXml(xml))[0]!, 'postAffine')
    expect(post.a).toBeCloseTo(2)
    expect(post.c).toBeCloseTo(0.5)
  })

  it('writes variations as flam3 attributes (preBlur -> pre_blur)', () => {
    const xml = `<?xml version="1.0"?>
<flame name="Pb" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" pre_blur="0.5" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`
    const exported = exportFlameXml(parseFlameXml(xml))
    expect(exported).toContain('pre_blur="0.500000"')
    expect(exported).toContain('linear="1.000000"')
  })

  it('round-trips parametric variation params', () => {
    const reparsed = parseFlameXml(exportFlameXml(parseFlameXml(PARAM_XML)))
    const vars: { type: string; params?: Record<string, number> }[] =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.values((xforms(reparsed)[0] as any).variations)
    const julian = vars.find((v) => v.type === 'juliaNVar')
    expect(julian!.params!.power).toBeCloseTo(3)
    expect(julian!.params!.dist).toBeCloseTo(2)
  })

  it('round-trips a finalxform through finalTransform', () => {
    const original = parseFlameXml(FINAL_XFORM_XML)
    const xml = exportFlameXml(original)
    expect(xml).toContain('<finalxform')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ft = (parseFlameXml(xml) as any).finalTransform as Record<
      string,
      number
    >
    expect(ft.a).toBeCloseTo(2)
    expect(ft.e).toBeCloseTo(3)
    expect(ft.c).toBeCloseTo(0.5)
  })

  it('throws for 3D flames', () => {
    const fake3D = parseFlameXml(SIMPLE_FLAME_XML)
    Object.defineProperty(fake3D.renderSettings, 'dimensions', { value: 3 })
    expect(() => exportFlameXml(fake3D)).toThrow('2D')
  })

  it('produces XML that isFlameXmlContent detects', () => {
    const xml = exportFlameXml(parseFlameXml(SIMPLE_FLAME_XML), 'Export Test')
    expect(isFlameXmlContent(xml)).toBe(true)
  })
})

// ── bundled samples ─────────────────────────────────────────────────────────

describe('FLAM3_SAMPLES', () => {
  it('every sample is detected, imports, and has an embedded palette', () => {
    expect(FLAM3_SAMPLES.length).toBeGreaterThan(0)
    for (const sample of FLAM3_SAMPLES) {
      expect(isFlameXmlContent(sample.xml)).toBe(true)
      const flame = parseFlameXml(sample.xml)
      expect(Object.keys(flame.transforms).length).toBeGreaterThan(0)
      // All bundled samples ship a palette, so colours bake from it.
      expect(extractFlamePalette(sample.xml)).toBeDefined()
    }
  })

  it('every sample round-trips through export', () => {
    for (const sample of FLAM3_SAMPLES) {
      const flame = parseFlameXml(sample.xml)
      const reparsed = parseFlameXml(exportFlameXml(flame))
      expect(Object.keys(reparsed.transforms)).toHaveLength(
        Object.keys(flame.transforms).length,
      )
    }
  })
})
