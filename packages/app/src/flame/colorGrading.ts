import { oklabToRgb } from '@typegpu/color'
import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, struct, vec2f, vec2i, vec3f, vec4f, } from 'typegpu/data'
import { abs, add, clamp, cos, div, dot, fract, log, max, mix, mul, pow, saturate, sin, smoothstep, sub, } from 'typegpu/std'
import { vramLog } from '@/utils/vramLog'
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER_INV } from './types'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'
import type { Palette } from './colorMap'
import type { DrawModeFn } from './drawMode'

export const ColorGradingUniforms = struct({
  averagePointCountPerBucketInv: f32,
  exposure: f32,
  backgroundColor: vec4f,
  /** Adds a slight fade towards the edge of the viewport */
  edgeFadeColor: vec4f,
  /** Vibrancy: 0 = none, 1 = full saturation boost in dense regions */
  vibrancy: f32,
  /** Palette phase offset (0-1) — shifts the density→palette mapping */
  palettePhase: f32,
  /** Palette cycle speed (0-1) — maps to 0.02..0.5 density scale */
  paletteSpeed: f32,
  /** Number of palette entries */
  paletteEntryCount: i32,
  /** Contrast multiplier for log-density (0.1-10, default 1) */
  contrast: f32,
  /** Gamma exponent for power curve (0.2-5, default 2.2 = sRGB) */
  gamma: f32,
  /** Highlight desaturation power (0-1, default 0.5) */
  highlightPower: f32,
  /** When > 0.5, output raw rgba with transparent background instead of blending */
  outputAlpha: f32,
})

/** Palette entry: R=a, G=b, B=unused, A=position */
export const PaletteEntry = struct({
  a: f32,
  b: f32,
  position: f32,
})

const bindGroupLayout = tgpu.bindGroupLayout({
  uniforms: {
    uniform: ColorGradingUniforms,
  },
  textureSize: {
    uniform: vec2i,
  },
  accumulationBuffer: {
    storage: arrayOf(Bucket),
    access: 'readonly',
  },
  paletteBuffer: {
    storage: arrayOf(PaletteEntry),
    access: 'readonly',
  },
})

export function createColorGradingPipeline(
  root: TgpuRoot,
  uniforms: LayoutEntryToInput<(typeof bindGroupLayout)['entries']['uniforms']>,
  textureSize: readonly [number, number],
  accumulationBuffer: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['accumulationBuffer']
  >,
  canvasFormat: GPUTextureFormat,
  drawMode: DrawModeFn,
  palette: Palette | undefined,
  paletteMode: number = 0,
) {
  const textureSizeBuffer = root
    .createBuffer(vec2i, vec2i(...textureSize))
    .$usage('uniform')
  vramLog('[colorGrading] Created textureSizeBuffer')

  // NOTE: synchronous destroy, no requestAnimationFrame wrapper.
  // WebGPU spec §5.1.4 allows destroying a buffer referenced by pending GPU commands —
  // the driver handles it. rAF-delayed cleanup creates a window where old and new buffers
  // coexist if this pipeline factory is called again before the rAF fires (e.g. on canvas
  // resize or rapid modal reopen). See Flam3.tsx pointRandomSeeds note for full rationale.
  onCleanup(() => {
    vramLog('[colorGrading] Destroying textureSizeBuffer')
    textureSizeBuffer.destroy()
  })

  const entryCount = Math.max(palette?.entries.length ?? 0, 1)

  // Create palette buffer using tgpu (avoids texture binding origin "handle" issues)
  const paletteBuffer = root
    .createBuffer(arrayOf(PaletteEntry, entryCount))
    .$usage('storage')

  if (palette) {
    const sorted = [...palette.entries].sort((a, b) => a.position - b.position)
    const entries = sorted.map((entry) => ({
      a: entry.a,
      b: entry.b,
      position: entry.position,
    }))
    paletteBuffer.write(entries)
  }

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    uniforms,
    accumulationBuffer,
    textureSize: textureSizeBuffer,
    paletteBuffer,
  })

  const VertexOutput = {
    pos: builtin.position,
    uv: vec2f,
  }

  const vertex = tgpu.vertexFn({
    in: { vertexIndex: builtin.vertexIndex },
    out: VertexOutput,
  })(({ vertexIndex }) => {
    const pos = [vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)]
    return {
      pos: vec4f(pos[vertexIndex]!, 0.0, 1.0),
      uv: pos[vertexIndex]!,
    }
  })

  const fragmentBodyMode0 = ({ pos, uv }: { pos: any; uv: any }) => {
    'use gpu'
    const uniforms = bindGroupLayout.$.uniforms
    const textureSize = bindGroupLayout.$.textureSize
    const accumulationBuffer = bindGroupLayout.$.accumulationBuffer

    const edgeFade =
      uniforms.edgeFadeColor.a * smoothstep(0.75, 1, max(abs(uv.x), abs(uv.y)))
    const backgroundColor = mix(
      uniforms.backgroundColor,
      uniforms.edgeFadeColor,
      edgeFade,
    )
    const pos2i = vec2i(pos.xy)
    const texelIndex = pos2i.y * textureSize.x + pos2i.x
    const tex = accumulationBuffer[texelIndex]!
    const count = f32(tex.count) * BUCKET_FIXED_POINT_MULTIPLIER_INV
    const texColorAb = div(
      mul(
        vec2f(f32(tex.color.a), f32(tex.color.b)),
        BUCKET_FIXED_POINT_MULTIPLIER_INV,
      ),
      count,
    )

    const adjustedCount = mul(
      mul(count, uniforms.averagePointCountPerBucketInv),
      f32(0.1),
    )
    const density = clamp(log(add(adjustedCount, f32(1))), f32(0), f32(1))

    let finalAb = vec2f(texColorAb)
    if (uniforms.paletteEntryCount > i32(0) && uniforms.vibrancy > f32(0)) {
      const paletteBuffer = bindGroupLayout.$.paletteBuffer
      const logDensity = clamp(log(add(count, f32(1))), f32(0), f32(10))
      const paletteScale = add(
        f32(0.02),
        mul(uniforms.paletteSpeed, f32(0.298)),
      )
      // Mode 0: density-shift — palettePhase shifts the density→palette mapping
      const logDensityNorm = fract(
        add(mul(logDensity, paletteScale), uniforms.palettePhase),
      )
      const idx = i32(mul(f32(uniforms.paletteEntryCount), logDensityNorm))
      const clampedIdx = clamp(
        idx,
        i32(0),
        sub(uniforms.paletteEntryCount, i32(1)),
      )
      const entry = paletteBuffer[clampedIdx]!
      const paletteAb = vec2f(entry.a, entry.b)

      const gamma = f32(0.5)
      const linrange = f32(1.0)
      const frac = div(density, linrange)
      const funcval = pow(linrange, gamma)
      const baseAlpha = add(
        mul(mul(sub(f32(1), frac), density), div(funcval, linrange)),
        mul(frac, pow(density, gamma)),
      )
      const paletteBlend = clamp(
        mul(uniforms.vibrancy, saturate(baseAlpha)),
        f32(0),
        f32(1),
      )
      finalAb = mix(texColorAb, paletteAb, paletteBlend)
    }

    const logDensity = log(add(adjustedCount, f32(1)))
    const tonemapped = mul(
      mul(uniforms.exposure, uniforms.contrast),
      logDensity,
    )
    const value = clamp(
      pow(saturate(tonemapped), div(f32(1), uniforms.gamma)),
      f32(0),
      f32(2),
    )

    let rgb = oklabToRgb(vec3f(drawMode(value), finalAb))

    // Highlight desaturation: ramps from 0 at mid-tones to 1 at peak brightness.
    // Works regardless of gamut clipping — affects all bright pixels.
    const highlightMask = pow(saturate(value), f32(2))
    const lum = dot(rgb, vec3f(f32(0.299), f32(0.587), f32(0.114)))
    const desaturatedRgb = mix(rgb, vec3f(lum), mul(uniforms.highlightPower, highlightMask))
    rgb = saturate(desaturatedRgb)

    const flameAlpha = saturate(value) * (1 - edgeFade)
    if (uniforms.outputAlpha > f32(0.5)) {
      return vec4f(mul(rgb, flameAlpha), flameAlpha)
    }
    return vec4f(mix(backgroundColor.rgb, rgb, flameAlpha), f32(1))
  }

  const fragmentBodyMode1 = ({ pos, uv }: { pos: any; uv: any }) => {
    'use gpu'
    const uniforms = bindGroupLayout.$.uniforms
    const textureSize = bindGroupLayout.$.textureSize
    const accumulationBuffer = bindGroupLayout.$.accumulationBuffer

    const edgeFade =
      uniforms.edgeFadeColor.a * smoothstep(0.75, 1, max(abs(uv.x), abs(uv.y)))
    const backgroundColor = mix(
      uniforms.backgroundColor,
      uniforms.edgeFadeColor,
      edgeFade,
    )
    const pos2i = vec2i(pos.xy)
    const texelIndex = pos2i.y * textureSize.x + pos2i.x
    const tex = accumulationBuffer[texelIndex]!
    const count = f32(tex.count) * BUCKET_FIXED_POINT_MULTIPLIER_INV
    const texColorAb = div(
      mul(
        vec2f(f32(tex.color.a), f32(tex.color.b)),
        BUCKET_FIXED_POINT_MULTIPLIER_INV,
      ),
      count,
    )

    const adjustedCount = mul(
      mul(count, uniforms.averagePointCountPerBucketInv),
      f32(0.1),
    )
    const density = clamp(log(add(adjustedCount, f32(1))), f32(0), f32(1))

    let finalAb = vec2f(texColorAb)
    if (uniforms.paletteEntryCount > i32(0) && uniforms.vibrancy > f32(0)) {
      const paletteBuffer = bindGroupLayout.$.paletteBuffer
      const logDensity = clamp(log(add(count, f32(1))), f32(0), f32(10))
      const paletteScale = add(
        f32(0.02),
        mul(uniforms.paletteSpeed, f32(0.298)),
      )
      // Mode 1: flam3 hue rotation — density mapping without phase,
      // then rotate OkLab a/b chroma by palettePhase * 2π
      const logDensityNorm = fract(mul(logDensity, paletteScale))
      const idx = i32(mul(f32(uniforms.paletteEntryCount), logDensityNorm))
      const clampedIdx = clamp(
        idx,
        i32(0),
        sub(uniforms.paletteEntryCount, i32(1)),
      )
      const entry = paletteBuffer[clampedIdx]!
      const hueAngle = mul(uniforms.palettePhase, f32(6.283185307))
      const cosH = cos(hueAngle)
      const sinH = sin(hueAngle)
      const paletteAb = vec2f(
        sub(mul(entry.a, cosH), mul(entry.b, sinH)),
        add(mul(entry.a, sinH), mul(entry.b, cosH)),
      )

      const gamma = f32(0.5)
      const linrange = f32(1.0)
      const frac = div(density, linrange)
      const funcval = pow(linrange, gamma)
      const baseAlpha = add(
        mul(mul(sub(f32(1), frac), density), div(funcval, linrange)),
        mul(frac, pow(density, gamma)),
      )
      const paletteBlend = clamp(
        mul(uniforms.vibrancy, saturate(baseAlpha)),
        f32(0),
        f32(1),
      )
      finalAb = mix(texColorAb, paletteAb, paletteBlend)
    }

    const logDensity = log(add(adjustedCount, f32(1)))
    const tonemapped = mul(
      mul(uniforms.exposure, uniforms.contrast),
      logDensity,
    )
    const value = clamp(
      pow(saturate(tonemapped), div(f32(1), uniforms.gamma)),
      f32(0),
      f32(2),
    )

    let rgb = oklabToRgb(vec3f(drawMode(value), finalAb))

    // Highlight desaturation: ramps from 0 at mid-tones to 1 at peak brightness.
    // Works regardless of gamut clipping — affects all bright pixels.
    const highlightMask = pow(saturate(value), f32(2))
    const lum = dot(rgb, vec3f(f32(0.299), f32(0.587), f32(0.114)))
    const desaturatedRgb = mix(rgb, vec3f(lum), mul(uniforms.highlightPower, highlightMask))
    rgb = saturate(desaturatedRgb)

    const flameAlpha = saturate(value) * (1 - edgeFade)
    if (uniforms.outputAlpha > f32(0.5)) {
      return vec4f(mul(rgb, flameAlpha), flameAlpha)
    }
    return vec4f(mix(backgroundColor.rgb, rgb, flameAlpha), f32(1))
  }

  const fragment = tgpu.fragmentFn({
    in: VertexOutput,
    out: vec4f,
  })(paletteMode === 0 ? fragmentBodyMode0 : fragmentBodyMode1)

  const renderPipeline = root
    .createRenderPipeline({
      vertex,
      fragment,
      targets: { format: canvasFormat },
    })
    .with(bindGroup)

  return {
    run: (pass: GPURenderPassEncoder) => {
      renderPipeline.with(pass).draw(3)
    },
  }
}
