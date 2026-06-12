import { oklabToRgb } from '@typegpu/color'
import { onCleanup } from 'solid-js'
import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, struct, vec2f, vec2i, vec3f, vec4f, } from 'typegpu/data'
import { abs, add, clamp, cos, div, dot, exp, fract, log, max, min, mix, mul, normalize, pow, saturate, select, sin, smoothstep, sub, } from 'typegpu/std'
import { vramLog } from '@/utils/vramLog'
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER_INV } from './types'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'
import type { Palette } from './colorMap'
import type { DrawModeFn } from './drawMode'

const EPSILON = 0.001

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
  /** Palette mode: 0 = density-shift, 1 = flam3 hue rotation */
  paletteMode: i32,
  /** Contrast multiplier for log-density (0.1-10, default 1) */
  contrast: f32,
  /** Gamma exponent for power curve (0.2-5, default 2.2 = sRGB) */
  gamma: f32,
  /** Highlight desaturation power (0-1, default 0.5) */
  highlightPower: f32,
  /** When > 0.5, output raw rgba with transparent background instead of blending */
  outputAlpha: f32,
  /** Power of depth-based brightness modulation */
  depthColorPower: f32,
  /** Direction of the 3D lighting (x, y, z, w unused) */
  lightDirection: vec4f,
  /** Strength of directional lighting */
  lightPower: f32,
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
      pos: vec4f(pos[vertexIndex], 0.0, 1.0),
      uv: pos[vertexIndex]!,
    }
  })

  const fragmentBody = ({
    pos,
    uv,
  }: {
    pos: ReturnType<typeof vec4f>
    uv: ReturnType<typeof vec2f>
  }) => {
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
    const count = max(
      f32(tex.count) * BUCKET_FIXED_POINT_MULTIPLIER_INV,
      f32(EPSILON),
    )
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
    const exposedCount = mul(adjustedCount, max(uniforms.exposure, f32(0)))
    const logDensity = log(add(exposedCount, f32(1)))
    const tonemapped = mul(logDensity, max(uniforms.contrast, f32(0)))

    const density = clamp(tonemapped, f32(0), f32(1))

    let finalAb = vec2f(texColorAb)
    if (uniforms.paletteEntryCount > i32(0) && uniforms.vibrancy > f32(0)) {
      const paletteBuffer = bindGroupLayout.$.paletteBuffer
      const logDensityClamp = clamp(tonemapped, f32(0), f32(10))
      const paletteScale = add(
        f32(0.02),
        mul(uniforms.paletteSpeed, f32(0.298)),
      )

      let paletteAb = vec2f(0)
      let densityInput = f32(0)
      if (uniforms.paletteMode === i32(0)) {
        densityInput = add(
          mul(logDensityClamp, paletteScale),
          uniforms.palettePhase,
        )
      } else {
        densityInput = mul(logDensityClamp, paletteScale)
      }
      const logDensityNorm = fract(densityInput)

      let lowerA = paletteBuffer[0]!.a
      let lowerB = paletteBuffer[0]!.b
      let lowerPos = paletteBuffer[0]!.position

      const upperIdx = sub(uniforms.paletteEntryCount, i32(1))
      let upperA = paletteBuffer[upperIdx]!.a
      let upperB = paletteBuffer[upperIdx]!.b
      let upperPos = paletteBuffer[upperIdx]!.position

      let matched = false
      for (let i = i32(0); i < upperIdx; i = add(i, i32(1))) {
        const entry1 = paletteBuffer[i]!
        const entry2 = paletteBuffer[add(i, i32(1))]!
        if (
          logDensityNorm >= entry1.position &&
          logDensityNorm <= entry2.position
        ) {
          lowerA = entry1.a
          lowerB = entry1.b
          lowerPos = entry1.position
          upperA = entry2.a
          upperB = entry2.b
          upperPos = entry2.position
          matched = true
        }
      }

      let range = f32(1)
      let localT = f32(0)

      if (matched) {
        range = sub(upperPos, lowerPos)
        if (range > f32(0)) {
          localT = div(sub(logDensityNorm, lowerPos), range)
        }
      } else {
        const lastEntry = paletteBuffer[upperIdx]!
        const firstEntry = paletteBuffer[0]!

        lowerA = lastEntry.a
        lowerB = lastEntry.b
        lowerPos = lastEntry.position

        upperA = firstEntry.a
        upperB = firstEntry.b
        upperPos = add(firstEntry.position, f32(1))

        let adjustedNorm = logDensityNorm
        if (adjustedNorm < firstEntry.position) {
          adjustedNorm = add(adjustedNorm, f32(1))
        }

        range = sub(upperPos, lowerPos)
        if (range > f32(0)) {
          localT = div(sub(adjustedNorm, lowerPos), range)
        }
      }

      const interpA = add(lowerA, mul(sub(upperA, lowerA), localT))
      const interpB = add(lowerB, mul(sub(upperB, lowerB), localT))

      if (uniforms.paletteMode === i32(0)) {
        paletteAb = vec2f(interpA, interpB)
      } else {
        const hueAngle = mul(uniforms.palettePhase, f32(6.283185307))
        const cosH = cos(hueAngle)
        const sinH = sin(hueAngle)
        paletteAb = vec2f(
          sub(mul(interpA, cosH), mul(interpB, sinH)),
          add(mul(interpA, sinH), mul(interpB, cosH)),
        )
      }

      const gamma = f32(0.5)
      const baseAlpha = add(
        mul(sub(f32(1), density), density),
        mul(density, pow(density, gamma)),
      )
      // We cap the topographical palette blend at 65% so it never completely overwrites the structural flame colors
      const paletteBlend = mul(saturate(baseAlpha), f32(0.65))
      finalAb = mix(texColorAb, paletteAb, paletteBlend)
    }

    // Apply vibrancy as a true Saturation multiplier on the OkLab chroma
    finalAb = mul(finalAb, max(uniforms.vibrancy, f32(0)))

    // Remove saturate() before pow to allow highlights to exceed 1.0,
    // which enables the highlightPower roll-off to actually work.
    const value = clamp(
      pow(max(tonemapped, f32(0)), div(f32(1), uniforms.gamma)),
      f32(0),
      f32(2),
    )

    let rgb = oklabToRgb(vec3f(drawMode(value), finalAb))

    // Modulate brightness based on average Z depth
    let modL = drawMode(value)
    if (uniforms.depthColorPower > f32(0)) {
      const avgZ = mul(
        div(f32(tex.z), max(f32(tex.count), f32(EPSILON))),
        f32(10.0),
      )
      const zFactor = clamp(avgZ, f32(-2), f32(2))

      // Exponential falloff: always positive, deeper = dimmer (atmospheric perspective)
      // Scaled by 0.1 to provide a smooth, gradual effect over the 0-5 slider range
      modL =
        modL * exp(mul(f32(-1.0), zFactor * uniforms.depthColorPower * 0.1))

      // Depth-based color shift: warm (positive a) for near, cool (negative a) for far
      const shift = zFactor * uniforms.depthColorPower * f32(0.04)
      finalAb = vec2f(
        sub(finalAb.x, shift),
        add(finalAb.y, mul(shift, f32(0.5))),
      )
    }

    // Apply directional lighting (Lambertian)
    if (uniforms.lightPower > f32(0)) {
      const leftIdx = add(max(sub(pos2i.x, 1), 0), mul(pos2i.y, textureSize.x))
      const rightIdx = add(
        min(add(pos2i.x, 1), sub(textureSize.x, 1)),
        mul(pos2i.y, textureSize.x),
      )
      const upIdx = add(pos2i.x, mul(max(sub(pos2i.y, 1), 0), textureSize.x))
      const downIdx = add(
        pos2i.x,
        mul(min(add(pos2i.y, 1), sub(textureSize.y, 1)), textureSize.x),
      )

      const centerZ = mul(
        div(f32(tex.z), max(f32(tex.count), f32(EPSILON))),
        f32(10.0),
      )

      const leftCount = accumulationBuffer[leftIdx]!.count
      const leftZVal = mul(
        div(
          f32(accumulationBuffer[leftIdx]!.z),
          max(f32(leftCount), f32(EPSILON)),
        ),
        f32(10.0),
      )
      const leftZ = select(centerZ, leftZVal, leftCount > 0)

      const rightCount = accumulationBuffer[rightIdx]!.count
      const rightZVal = mul(
        div(
          f32(accumulationBuffer[rightIdx]!.z),
          max(f32(rightCount), f32(EPSILON)),
        ),
        f32(10.0),
      )
      const rightZ = select(centerZ, rightZVal, rightCount > 0)

      const upCount = accumulationBuffer[upIdx]!.count
      const upZVal = mul(
        div(f32(accumulationBuffer[upIdx]!.z), max(f32(upCount), f32(EPSILON))),
        f32(10.0),
      )
      const upZ = select(centerZ, upZVal, upCount > 0)

      const downCount = accumulationBuffer[downIdx]!.count
      const downZVal = mul(
        div(
          f32(accumulationBuffer[downIdx]!.z),
          max(f32(downCount), f32(EPSILON)),
        ),
        f32(10.0),
      )
      const downZ = select(centerZ, downZVal, downCount > 0)

      const dz_dx = mul(sub(rightZ, leftZ), f32(0.5))
      const dz_dy = mul(sub(downZ, upZ), f32(0.5))

      // Z scale factor to balance screen pixels with depth range
      // Z scale factor to balance screen pixels with depth range.
      // Lowered from 150 to 100 to smooth out normal calculations on high-frequency fractal depth transitions.
      const zScale = f32(100.0)
      const normal = normalize(
        vec3f(
          mul(sub(f32(0), dz_dx), zScale),
          mul(sub(f32(0), dz_dy), zScale),
          f32(1.0),
        ),
      )
      const lightDir = normalize(uniforms.lightDirection.xyz)
      const diffuse = max(dot(normal, sub(vec3f(0.0), lightDir)), f32(0.0))

      // Ambient lighting controls the base light level in shadows.
      // We interpolate between unshaded (1.0) and shaded using saturate(lightPower)
      // to avoid negative extrapolation when lightPower > 1.0, which causes harsh black lines.
      const ambient = f32(0.15)
      const shaded = add(
        ambient,
        mul(diffuse, mul(uniforms.lightPower, f32(1.15))),
      )
      const lightFactor = mix(f32(1.0), shaded, saturate(uniforms.lightPower))
      modL = modL * max(lightFactor, f32(0.15))
    }

    rgb = oklabToRgb(vec3f(saturate(modL), finalAb))

    const maxChan = max(rgb.r, max(rgb.g, rgb.b))
    const excess = saturate(sub(maxChan, f32(1)))
    const desat = sub(
      f32(1),
      mul(uniforms.highlightPower, div(excess, max(maxChan, f32(EPSILON)))),
    )
    const lum = dot(rgb, vec3f(f32(0.299), f32(0.587), f32(0.114)))
    const desaturatedRgb = mix(vec3f(lum), rgb, saturate(desat))
    rgb = saturate(mix(rgb, desaturatedRgb, excess))

    const flameAlpha = saturate(value) * (1 - edgeFade)
    if (uniforms.outputAlpha > f32(0.5)) {
      return vec4f(mul(rgb, flameAlpha), flameAlpha)
    }
    return vec4f(mix(backgroundColor.rgb, rgb, flameAlpha), f32(1))
  }

  const fragment = tgpu.fragmentFn({
    in: VertexOutput,
    out: vec4f,
  })(fragmentBody)

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
