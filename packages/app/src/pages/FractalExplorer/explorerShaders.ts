/**
 * The explorer's GPU data layout and its iteration shaders: per-pixel
 * perturbation, advanced a bounded number of steps per dispatch. Colouring
 * and presenting are `explorerColourShaders.ts`.
 *
 * The iteration is a transliteration of `@chaos-master/core`'s
 * `deepzoom/perturbation.ts`, which is the tested specification — the
 * comments there explain every constant. Change one, change the other.
 *
 * Each pixel keeps its full state in a storage buffer, so a frame advances
 * every pixel by at most `stepBudget` steps and returns: no dispatch runs
 * long enough to trip a driver watchdog, however deep the view.
 *
 * Each pass's helpers live in the module of its entry point, because a
 * WGSL-string `tgpu.fn` imported into another file's entry function is not
 * reliably traced. Structs and layouts are shared from here.
 */
import { EXPONENT_FLOOR } from '@chaos-master/core'
import { tgpu } from 'typegpu'
import { arrayOf, atomic, builtin, f32, i32, struct, u32, vec2f, vec2u, vec4f, } from 'typegpu/data'

export const WORKGROUP = 8

/** Pixel status, stored in the top two bits of `Pixel.m`. */
export const PIXEL_ITERATING = 0
export const PIXEL_ESCAPED = 1
export const PIXEL_INTERIOR = 2

export const FLAG_HAS_DC = 1
export const FLAG_USE_BLA = 2
export const FLAG_DERIVATIVE = 4

/**
 * One pixel's iteration state, 32 bytes. While iterating, `w * 2^e` is the
 * delta and `dm * 2^de` the derivative. Once escaped, `w` holds
 * (smooth-count correction, log2 distance estimate in pixels) and `dm` the
 * surface normal. `m`: reference index in bits 0-27, orbit in bit 28, status
 * in bits 30-31.
 */
export const Pixel = struct({
  w: vec2f,
  dm: vec2f,
  e: i32,
  de: i32,
  m: u32,
  n: u32,
})

/** Matches `gpuPacking.ts`: a normalised mantissa pair and its exponent. */
export const OrbitEntry = struct({
  m: vec2f,
  e: i32,
  pad: i32,
})

/** Matches `bla.ts`: `d' = A d + B dc`, valid while log2|d| < logR. */
export const BlaEntry = struct({
  a: vec2f,
  b: vec2f,
  ae: i32,
  be: i32,
  logR: f32,
  steps: u32,
})

export const OrbitInfo = struct({
  base: u32,
  length: u32,
  blaStart: u32,
  levelBase: u32,
  levelCount: u32,
  minLevel: u32,
})

export const IterateUniforms = struct({
  size: vec2u,
  /** View centre minus reference, in pixels, y up. */
  centerOffset: vec2f,
  spacingMant: f32,
  spacingExp: i32,
  maxIterations: u32,
  stepBudget: u32,
  flags: u32,
  orbit0: OrbitInfo,
  orbit1: OrbitInfo,
})

/**
 * What colouring needs of a finished pixel, kept from the centre sample so a
 * colour change recolours at once while supersamples are being recomputed.
 * `n` carries the status in its top two bits, as `Pixel.m` does.
 */
export const Shade = struct({
  n: u32,
  corr: f32,
  log2De: f32,
  /** The distance-estimate normal, `pack2x16snorm`. */
  normal: u32,
})

export const ColourUniforms = struct({
  size: vec2u,
  backdropSize: vec2u,
  /** Backdrop pixel = pixel * backdropScale + backdropOffset (centred, y up). */
  backdropOffset: vec2f,
  backdropScale: f32,
  backdropValid: u32,
  period: u32,
  phase: f32,
  relief: f32,
  paletteSize: u32,
  /** The palette's average (a, b): what a band too thin to resolve looks like. */
  paletteMean: vec2f,
  /**
   * Which supersample this pass colours: 0 replaces the accumulated colour
   * (and draws the backdrop under unfinished pixels), k > 0 adds sample k.
   */
  sample: u32,
  /** 1: colour from `base` (a recolour); 0: from the pixels, and at sample 0 record `base`. */
  fromBase: u32,
  interior: vec4f,
  background: vec4f,
})

const Fe = struct({ m: vec2f, e: i32 })

export const iterateLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: IterateUniforms },
  orbits: { storage: arrayOf(OrbitEntry), access: 'readonly' },
  bla: { storage: arrayOf(BlaEntry), access: 'readonly' },
  blaLevels: { storage: arrayOf(vec2u), access: 'readonly' },
  pixels: { storage: arrayOf(Pixel), access: 'mutable' },
  counters: { storage: arrayOf(atomic(u32)), access: 'mutable' },
})

export const colourLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: ColourUniforms },
  pixels: { storage: arrayOf(Pixel), access: 'readonly' },
  palette: { storage: arrayOf(vec2f), access: 'readonly' },
  backdrop: { storage: arrayOf(u32), access: 'readonly' },
  base: { storage: arrayOf(Shade), access: 'mutable' },
  /** Sum of linear-light samples in rgb and their count, as 4 x f16. */
  accum: { storage: arrayOf(vec2u), access: 'mutable' },
  display: { storage: arrayOf(u32), access: 'mutable' },
})

export const presentLayout = tgpu.bindGroupLayout({
  size: { uniform: vec2u },
  display: { storage: arrayOf(u32), access: 'readonly' },
})

// ---------------------------------------------------------------- helpers

/** `x * 2^k`; 0 below 2^-126 (see `ldexp` in perturbation.ts). */
const ldx2 = tgpu.fn([vec2f, i32], vec2f) /* wgsl */ `
  (x: vec2f, k: i32) -> vec2f {
    if (k < -126) { return vec2f(0.0); }
    let p = bitcast<f32>(u32(min(k, 127) + 127) << 23u);
    let r = x * p;
    return select(r, vec2f(0.0), abs(r) < vec2f(1.17549435e-38));
  }
`

const cmul = tgpu.fn([vec2f, vec2f], vec2f) /* wgsl */ `
  (a: vec2f, b: vec2f) -> vec2f {
    return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }
`

const maxAbs = tgpu.fn([vec2f], f32) /* wgsl */ `
  (v: vec2f) -> f32 {
    return max(abs(v.x), abs(v.y));
  }
`

const frexpE = tgpu.fn([f32], i32) /* wgsl */ `
  (x: f32) -> i32 {
    return frexp(x).exp;
  }
`

/** Sum up to three floatexp terms aligned to the largest; zeros skipped. */
const feSum = tgpu.fn(
  [vec2f, i32, vec2f, i32, vec2f, i32, i32],
  Fe,
) /* wgsl */ `
  (am: vec2f, ae: i32, bm: vec2f, be: i32, cm: vec2f, ce: i32, fallback: i32) -> Fe {
    let minNormal = 1.17549435e-38;
    let aa = maxAbs(am);
    let ab = maxAbs(bm);
    let ac = maxAbs(cm);
    var top = i32(-2147483647);
    var found = false;
    if (aa >= minNormal) { top = ae + frexpE(aa); found = true; }
    if (ab >= minNormal) {
      let t = be + frexpE(ab);
      top = select(t, max(top, t), found);
      found = true;
    }
    if (ac >= minNormal) {
      let t = ce + frexpE(ac);
      top = select(t, max(top, t), found);
      found = true;
    }
    if (!found) { return Fe(vec2f(0.0), fallback); }
    var s = vec2f(0.0);
    if (aa >= minNormal) { s = s + ldx2(am, ae - top); }
    if (ab >= minNormal) { s = s + ldx2(bm, be - top); }
    if (ac >= minNormal) { s = s + ldx2(cm, ce - top); }
    return Fe(s, top);
  }
`.$uses({ Fe, maxAbs, frexpE, ldx2 })

/** Keep |w| in [2^-20, 2^20] and the exponent at or above `floorE`. */
const rescale = tgpu.fn([vec2f, i32, i32], Fe) /* wgsl */ `
  (w0: vec2f, e0: i32, floorE: i32) -> Fe {
    var w = w0;
    var e = e0;
    let a = maxAbs(w);
    if (a < 1.17549435e-38) {
      w = vec2f(0.0);
    } else if (a > 1048576.0 || a < 9.5367431640625e-7) {
      let k = frexpE(a);
      w = ldx2(w, -k);
      e = e + k;
    }
    if (e < floorE) {
      w = ldx2(w, e - floorE);
      e = floorE;
    }
    return Fe(w, e);
  }
`.$uses({ Fe, maxAbs, frexpE, ldx2 })

/** This pixel's offset from the reference, in units of 2^spacingExp. */
const pixelDc = tgpu.fn([vec2u], vec2f) /* wgsl */ `
  (gid: vec2u) -> vec2f {
    let U = layout.$.uniforms;
    let half = vec2f(U.size) * 0.5;
    let p = vec2f(f32(gid.x) + 0.5 - half.x, half.y - f32(gid.y) - 0.5);
    return (p + U.centerOffset) * U.spacingMant;
  }
`.$uses({ layout: iterateLayout })

/** `EXPONENT_FLOOR` in perturbation.ts: -2^24 keeps every sum inside i32. */
const EXP_FLOOR = tgpu.const(i32, EXPONENT_FLOOR)

/** perturbation.ts `rescale`'s floor; 60 is its `DC_HEADROOM_EXP`. */
const exponentFloor = tgpu.fn([], i32) /* wgsl */ `
  () -> i32 {
    let U = layout.$.uniforms;
    return select(EXP_FLOOR, U.spacingExp - 60, (U.flags & 1u) != 0u);
  }
`.$uses({ layout: iterateLayout, EXP_FLOOR })

// ------------------------------------------------------------ init pass

const initPixelAt = tgpu.fn([vec2u]) /* wgsl */ `
  (gid: vec2u) {
    let U = layout.$.uniforms;
    if (gid.x >= U.size.x || gid.y >= U.size.y) { return; }
    let idx = gid.y * U.size.x + gid.x;
    var px: Pixel;
    if ((U.flags & 1u) != 0u) {
      px.w = vec2f(0.0);
      px.dm = vec2f(0.0);
    } else {
      px.w = pixelDc(gid);
      px.dm = vec2f(U.spacingMant, 0.0);
    }
    px.e = U.spacingExp;
    px.de = U.spacingExp;
    let r = rescale(px.w, px.e, exponentFloor());
    px.w = r.m;
    px.e = r.e;
    px.m = 0u;
    px.n = 0u;
    // rebaseAtStart: a reference escaping at its first entry leaves nothing
    // to step along, so start on orbit 1 as testPixel would rebase at m = 0.
    if (U.orbit0.length <= 1u) {
      let t = layout.$.orbits[U.orbit0.base];
      let diff = t.e - px.e;
      if (diff > 40) {
        px.w = t.m + ldx2(px.w, -diff);
        px.e = t.e;
      } else {
        px.w = ldx2(t.m, diff) + px.w;
      }
      let r2 = rescale(px.w, px.e, exponentFloor());
      px.w = r2.m;
      px.e = r2.e;
      px.m = 1u << 28u;
    }
    layout.$.pixels[idx] = px;
  }
`.$uses({ layout: iterateLayout, Pixel, pixelDc, rescale, exponentFloor, ldx2 })

// ------------------------------------------------------- iteration pass

const iteratePixelAt = tgpu.fn([vec2u]) /* wgsl */ `
  (gid: vec2u) {
    let U = layout.$.uniforms;
    if (gid.x >= U.size.x || gid.y >= U.size.y) { return; }
    let idx = gid.y * U.size.x + gid.x;
    var px = layout.$.pixels[idx];
    var status = px.m >> 30u;
    if (status != 0u) { return; }
    let hasDc = (U.flags & 1u) != 0u;
    let useBla = (U.flags & 2u) != 0u;
    let wantD = (U.flags & 4u) != 0u;
    let dcm = pixelDc(gid);
    let floorE = exponentFloor();
    var w = px.w;
    var e = px.e;
    var dm = px.dm;
    var de = px.de;
    var m = px.m & 0x0fffffffu;
    var orbit = (px.m >> 28u) & 1u;
    var n = px.n;
    var info = U.orbit0;
    if (orbit == 1u) { info = U.orbit1; }
    var zOut = vec2f(0.0);
    for (var k = 0u; k < U.stepBudget; k = k + 1u) {
      if (n >= U.maxIterations) { status = 2u; break; }

      var skipped = false;
      if (useBla && info.levelCount > 0u && m >= info.blaStart) {
        let rel = m - info.blaStart;
        let top = min(countTrailingZeros(rel), info.minLevel + info.levelCount - 1u);
        let wl = length(w);
        if (top >= info.minLevel && wl > 0.0) {
          let logD = f32(e) + log2(wl);
          var j = top;
          loop {
            let lv = layout.$.blaLevels[info.levelBase + j - info.minLevel];
            let index = rel >> j;
            if (index < lv.y) {
              let b = layout.$.bla[lv.x + index];
              if (logD < b.logR && n + b.steps <= U.maxIterations) {
                var bTerm = vec2f(0.0);
                if (hasDc) { bTerm = cmul(b.b, dcm); }
                let nw = feSum(cmul(b.a, w), b.ae + e, bTerm, b.be + U.spacingExp, vec2f(0.0), 0, e);
                if (wantD) {
                  var bd = vec2f(0.0);
                  if (hasDc) { bd = b.b * U.spacingMant; }
                  let nd = feSum(cmul(b.a, dm), b.ae + de, bd, b.be + U.spacingExp, vec2f(0.0), 0, de);
                  dm = select(nd.m, vec2f(0.0), nd.e < EXP_FLOOR);
                  de = max(nd.e, EXP_FLOOR);
                }
                w = nw.m;
                e = nw.e;
                m = m + b.steps;
                n = n + b.steps;
                skipped = true;
                break;
              }
            }
            if (j <= info.minLevel) { break; }
            j = j - 1u;
          }
        }
      }

      if (!skipped) {
        let z = layout.$.orbits[info.base + m];
        if (wantD) {
          let diff = z.e - e;
          var zv = z.m;
          var zve = z.e;
          if (diff <= 40) {
            zv = ldx2(z.m, diff) + w;
            zve = e;
          }
          var cTerm = vec2f(0.0);
          if (hasDc) { cTerm = vec2f(U.spacingMant, 0.0); }
          let nd = feSum(2.0 * cmul(zv, dm), zve + de, cTerm, U.spacingExp, vec2f(0.0), 0, de);
          dm = select(nd.m, vec2f(0.0), nd.e < EXP_FLOOR);
          de = max(nd.e, EXP_FLOOR);
        }
        if (z.e >= -60) {
          let zf = ldx2(z.m, z.e);
          var d = vec2f(0.0);
          if (hasDc) { d = ldx2(dcm, U.spacingExp - e); }
          w = 2.0 * cmul(zf, w) + ldx2(cmul(w, w), e) + d;
        } else {
          var cT = vec2f(0.0);
          if (hasDc) { cT = dcm; }
          let nw = feSum(2.0 * cmul(z.m, w), z.e + e, cmul(w, w), 2 * e, cT, U.spacingExp, e);
          w = nw.m;
          e = nw.e;
        }
        m = m + 1u;
        n = n + 1u;
      }

      let r = rescale(w, e, floorE);
      w = r.m;
      e = r.e;

      let t = layout.$.orbits[info.base + m];
      let diff = t.e - e;
      let far = diff > 40;
      var zs = t.m;
      var zAbs = vec2f(0.0);
      var have = false;
      var rebase = false;
      if (far) {
        zAbs = ldx2(t.m, t.e);
        have = true;
      } else {
        zs = ldx2(t.m, diff) + w;
        rebase = dot(zs, zs) < dot(w, w);
        if (e > -33) {
          zAbs = ldx2(zs, e);
          have = true;
        }
      }
      if (have && dot(zAbs, zAbs) > 65536.0) {
        status = 1u;
        zOut = zAbs;
        break;
      }
      if (rebase || m + 1u >= info.length) {
        if (far) {
          w = t.m + ldx2(w, -diff);
          e = t.e;
        } else {
          w = zs;
        }
        m = 0u;
        orbit = 1u;
        info = U.orbit1;
        let r2 = rescale(w, e, floorE);
        w = r2.m;
        e = r2.e;
      }
    }

    if (status == 1u) {
      let r2 = dot(zOut, zOut);
      let lnAbs = 0.5 * log(r2);
      // log2(ln 256)
      let corr = 2.4712336270551024 - log2(lnAbs);
      var log2De = 0.0;
      var normal = vec2f(0.0);
      if (wantD) {
        log2De = log2(2.0 * sqrt(r2) * lnAbs) - (f32(de) + log2(length(dm)));
        let u = cmul(zOut, vec2f(dm.x, -dm.y));
        let ul = length(u);
        if (ul > 0.0) { normal = u / ul; }
      }
      px.w = vec2f(corr, log2De);
      px.dm = normal;
    } else {
      px.w = w;
      px.dm = dm;
    }
    px.e = e;
    px.de = de;
    px.n = n;
    px.m = (m & 0x0fffffffu) | (orbit << 28u) | (status << 30u);
    layout.$.pixels[idx] = px;
    if (status == 0u) { atomicAdd(&layout.$.counters[0], 1u); }
  }
`.$uses({
  layout: iterateLayout,
  EXP_FLOOR,
  pixelDc,
  exponentFloor,
  feSum,
  rescale,
  cmul,
  ldx2,
})

// ---------------------------------------------------------- entry points

export const initEntry = tgpu.computeFn({
  in: { gid: builtin.globalInvocationId },
  workgroupSize: [WORKGROUP, WORKGROUP, 1],
})(({ gid }) => {
  initPixelAt(gid.xy)
})

export const iterateEntry = tgpu.computeFn({
  in: { gid: builtin.globalInvocationId },
  workgroupSize: [WORKGROUP, WORKGROUP, 1],
})(({ gid }) => {
  iteratePixelAt(gid.xy)
})
