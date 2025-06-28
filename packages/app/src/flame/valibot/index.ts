import * as v from 'valibot'

export const BlobParamsSchema = v.object({
  high: v.number(),
  low: v.number(),
  waves: v.number(),
})
export const CurlParamsSchema = v.object({
  c1: v.number(),
  c2: v.number(),
})

export const Fan2ParamsSchema = v.object({
  x: v.number(),
  y: v.number(),
})

export const GridParamsSchema = v.object({
  divisions: v.number(),
  size: v.number(),
  jitterNearIntersectionsDistance: v.number(),
})

export const JuliaNParamsSchema = v.object({
  power: v.number(),
  dist: v.number(),
})

export const JuliaScopeParamsSchema = v.object({
  power: v.number(),
  dist: v.number(),
})

export const NgonParamsSchema = v.object({
  power: v.number(),
  sides: v.number(),
  corners: v.number(),
  circle: v.number(),
})

export const PdjParamsSchema = v.object({
  a: v.number(),
  b: v.number(),
  c: v.number(),
  d: v.number(),
})

export const PerspectiveParamsSchema = v.object({
  angle: v.number(),
  dist: v.number(),
})

export const PieParamsSchema = v.object({
  slices: v.number(),
  rotation: v.number(),
  thickness: v.number(),
})

export const RadialBlurParamsSchema = v.object({
  angle: v.number(),
})

export const RectanglesParamsSchema = v.object({
  x: v.number(),
  y: v.number(),
})

export const Rings2ParamsSchema = v.object({
  val: v.number(),
})

export const parametricVariationParamsSchemas = {
  blob: BlobParamsSchema,
  curl: CurlParamsSchema,
  fan2: Fan2ParamsSchema,
  grid: GridParamsSchema,
  juliaN: JuliaNParamsSchema,
  juliaScope: JuliaScopeParamsSchema,
  ngonVar: NgonParamsSchema,
  pdjVar: PdjParamsSchema,
  perspective: PerspectiveParamsSchema,
  pie: PieParamsSchema,
  radialBlurVar: RadialBlurParamsSchema,
  rectanglesVar: RectanglesParamsSchema,
  rings2: Rings2ParamsSchema,
}
