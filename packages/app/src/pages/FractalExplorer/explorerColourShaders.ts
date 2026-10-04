/**
 * The explorer's colouring and present shaders. Colouring turns each
 * pixel's final state into OkLab colour, maps it into the sRGB gamut and
 * averages supersamples in linear light; unfinished pixels show the previous
 * picture reprojected. Presenting scales the display buffer to the canvas.
 *
 * Helpers stay in this module, next to the entry points that call them (see
 * `explorerShaders.ts`).
 */
import { tgpu } from 'typegpu'
import { builtin, vec2f, vec2i, vec2u, vec3f, vec4f } from 'typegpu/data'
import { colourLayout, presentLayout, Shade, WORKGROUP, } from './explorerShaders'

// ---------------------------------------------------------- colour pass

const oklabToLinear = tgpu.fn([vec3f], vec3f) /* wgsl */ `
  (lab: vec3f) -> vec3f {
    let l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
    let m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
    let s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;
    return vec3f(
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    );
  }
`

/**
 * OkLab to linear sRGB inside the gamut: chroma is pulled in (hue and
 * lightness kept) until the colour fits, instead of clipping each channel,
 * which turns every saturated palette into flat primaries.
 */
const oklabInGamut = tgpu.fn([vec3f], vec3f) /* wgsl */ `
  (lab: vec3f) -> vec3f {
    var lin = oklabToLinear(lab);
    if (any(lin < vec3f(0.0)) || any(lin > vec3f(1.0))) {
      var lo = 0.0;
      var hi = 1.0;
      for (var i = 0; i < 7; i = i + 1) {
        let mid = 0.5 * (lo + hi);
        let c = oklabToLinear(vec3f(lab.x, lab.yz * mid));
        if (all(c >= vec3f(-0.001)) && all(c <= vec3f(1.001))) { lo = mid; } else { hi = mid; }
      }
      lin = oklabToLinear(vec3f(lab.x, lab.yz * lo));
    }
    return clamp(lin, vec3f(0.0), vec3f(1.0));
  }
`.$uses({ oklabToLinear })

const encodeSrgb = tgpu.fn([vec3f], vec3f) /* wgsl */ `
  (c: vec3f) -> vec3f {
    return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
  }
`

const decodeSrgb = tgpu.fn([vec3f], vec3f) /* wgsl */ `
  (c: vec3f) -> vec3f {
    return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
  }
`

const backdropTexel = tgpu.fn([vec2i, vec2u], vec4f) /* wgsl */ `
  (p: vec2i, size: vec2u) -> vec4f {
    let q = clamp(p, vec2i(0), vec2i(size) - vec2i(1));
    return unpack4x8unorm(shade.$.backdrop[u32(q.y) * size.x + u32(q.x)]);
  }
`.$uses({ shade: colourLayout })

const colourPixelAt = tgpu.fn([vec2u]) /* wgsl */ `
  (gid: vec2u) {
    let C = shade.$.uniforms;
    if (gid.x >= C.size.x || gid.y >= C.size.y) { return; }
    let idx = gid.y * C.size.x + gid.x;
    var status: u32;
    var n: u32;
    var corr: f32;
    var log2De: f32;
    var normal: vec2f;
    if (C.fromBase != 0u) {
      let b = shade.$.base[idx];
      status = b.n >> 30u;
      n = b.n & 0x3fffffffu;
      corr = b.corr;
      log2De = b.log2De;
      normal = unpack2x16snorm(b.normal);
    } else {
      let px = shade.$.pixels[idx];
      status = px.m >> 30u;
      n = px.n;
      corr = px.w.x;
      log2De = px.w.y;
      normal = px.dm;
      if (C.sample == 0u) {
        shade.$.base[idx] = Shade(n | (status << 30u), corr, log2De, pack2x16snorm(normal));
      }
    }
    var lin = vec3f(0.0);
    if (status == 1u) {
      let period = max(C.period, 1u);
      let t = fract((f32(n % period) + corr) / f32(period) + C.phase);
      let x = t * f32(C.paletteSize);
      let i0 = u32(floor(x)) % C.paletteSize;
      let i1 = (i0 + 1u) % C.paletteSize;
      var ab = mix(shade.$.palette[i0], shade.$.palette[i1], fract(x));
      // Lightness rises and falls once per cycle; the palette itself only
      // carries chroma.
      var L = mix(0.3, 0.9, 0.5 - 0.5 * cos(6.283185307 * t));
      // One cycle spans about period * DE * ln2 / 2 pixels. Bands thinner
      // than a pixel alias into noise that no number of samples settles, so
      // fade them towards what they average to: the palette's mean.
      let band = f32(period) * exp2(log2De) * 0.34657359;
      let resolved = smoothstep(0.5, 2.0, band);
      ab = mix(C.paletteMean, ab, resolved);
      L = mix(0.6, L, resolved);
      let light = vec2f(-0.70710678, 0.70710678);
      let slope = dot(normal, light) * resolved;
      let edge = smoothstep(-2.0, 1.0, log2De);
      L = L + C.relief * (0.2 * slope - 0.28 * (1.0 - edge));
      lin = oklabInGamut(vec3f(clamp(L, 0.0, 1.0), ab));
    } else if (status == 2u) {
      lin = decodeSrgb(C.interior.rgb);
    } else {
      // Unfinished: only the first sample shows anything, the backdrop.
      if (C.sample != 0u) { return; }
      var rgb = C.background.rgb;
      if (C.backdropValid != 0u) {
        let half = vec2f(C.size) * 0.5;
        let p = vec2f(f32(gid.x) + 0.5 - half.x, half.y - f32(gid.y) - 0.5);
        let q = p * C.backdropScale + C.backdropOffset;
        let bh = vec2f(C.backdropSize) * 0.5;
        let b = vec2f(q.x + bh.x - 0.5, bh.y - q.y - 0.5);
        let inside = all(b >= vec2f(-0.5)) && all(b <= vec2f(C.backdropSize) - vec2f(0.5));
        if (inside) {
          let b0 = floor(b);
          let f = b - b0;
          let i = vec2i(b0);
          let c00 = backdropTexel(i, C.backdropSize);
          let c10 = backdropTexel(i + vec2i(1, 0), C.backdropSize);
          let c01 = backdropTexel(i + vec2i(0, 1), C.backdropSize);
          let c11 = backdropTexel(i + vec2i(1, 1), C.backdropSize);
          rgb = mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y).rgb;
        }
      }
      shade.$.display[idx] = pack4x8unorm(vec4f(rgb, 1.0));
      return;
    }
    // Average in linear light; averaging encoded values darkens edges.
    var sum = vec4f(lin, 1.0);
    if (C.sample != 0u) {
      let a = shade.$.accum[idx];
      sum = sum + vec4f(unpack2x16float(a.x), unpack2x16float(a.y));
    }
    shade.$.accum[idx] = vec2u(pack2x16float(sum.xy), pack2x16float(sum.zw));
    shade.$.display[idx] = pack4x8unorm(vec4f(encodeSrgb(sum.rgb / sum.w), 1.0));
  }
`.$uses({
  shade: colourLayout,
  Shade,
  oklabInGamut,
  encodeSrgb,
  decodeSrgb,
  backdropTexel,
})

export const colourEntry = tgpu.computeFn({
  in: { gid: builtin.globalInvocationId },
  workgroupSize: [WORKGROUP, WORKGROUP, 1],
})(({ gid }) => {
  colourPixelAt(gid.xy)
})

const presentAt = tgpu.fn([vec2f], vec4f) /* wgsl */ `
  (uv: vec2f) -> vec4f {
    let size = present.$.size;
    let g = vec2f((uv.x * 0.5 + 0.5) * f32(size.x) - 0.5, (0.5 - uv.y * 0.5) * f32(size.y) - 0.5);
    let g0 = floor(g);
    let f = g - g0;
    let hi = vec2i(size) - vec2i(1);
    let a = clamp(vec2i(g0), vec2i(0), hi);
    let b = clamp(vec2i(g0) + vec2i(1), vec2i(0), hi);
    let c00 = unpack4x8unorm(present.$.display[u32(a.y) * size.x + u32(a.x)]);
    let c10 = unpack4x8unorm(present.$.display[u32(a.y) * size.x + u32(b.x)]);
    let c01 = unpack4x8unorm(present.$.display[u32(b.y) * size.x + u32(a.x)]);
    let c11 = unpack4x8unorm(present.$.display[u32(b.y) * size.x + u32(b.x)]);
    return vec4f(mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y).rgb, 1.0);
  }
`.$uses({ present: presentLayout })

const PresentVarying = {
  pos: builtin.position,
  uv: vec2f,
}

export const presentVertex = tgpu.vertexFn({
  in: { vertexIndex: builtin.vertexIndex },
  out: PresentVarying,
})(({ vertexIndex }) => {
  const pos = [vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)]
  return {
    pos: vec4f(pos[vertexIndex]!, 0.0, 1.0),
    uv: pos[vertexIndex]!,
  }
})

export const presentFragment = tgpu.fragmentFn({
  in: PresentVarying,
  out: vec4f,
})(({ uv }) => {
  return presentAt(uv)
})
