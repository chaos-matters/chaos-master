import * as v from 'valibot'

export const BlobParamsSchema = v.object({
  high: v.number(),
  low: v.number(),
  waves: v.number(),
})
const BlobParamsDefaults = {
  high: 2,
  low: 1,
  waves: 1,
}
const CurlParamsDefaults = {
  c1: 1,
  c2: 1,
}
export const CurlParamsSchema = v.object({
  c1: v.number(),
  c2: v.number(),
})
const Fan2ParamsDefaults = {
  x: 1,
  y: 1,
}

export const Fan2ParamsSchema = v.object({
  x: v.number(),
  y: v.number(),
})

const GridParamsDefaults = {
  divisions: 10.0,
  size: 1.0,
  jitterNearIntersectionsDistance: 0.002,
}
export const GridParamsSchema = v.object({
  divisions: v.number(),
  size: v.number(),
  jitterNearIntersectionsDistance: v.number(),
})

const JuliaNParamsDefaults = {
  power: 1,
  dist: 5,
}
export const JuliaNParamsSchema = v.object({
  power: v.number(),
  dist: v.number(),
})

const JuliaScopeParamsDefaults = {
  power: 1,
  dist: 5,
}
export const JuliaScopeParamsSchema = v.object({
  power: v.number(),
  dist: v.number(),
})

const NgonParamsDefaults = {
  power: 2,
  sides: 3,
  corners: 4,
  circle: 4,
}
export const NgonParamsSchema = v.object({
  power: v.number(),
  sides: v.number(),
  corners: v.number(),
  circle: v.number(),
})

const PdjParamsDefaults = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
}
export const PdjParamsSchema = v.object({
  a: v.number(),
  b: v.number(),
  c: v.number(),
  d: v.number(),
})
const PerspectiveParamsDefaults = {
  angle: Math.PI,
  dist: 3,
}

export const PerspectiveParamsSchema = v.object({
  angle: v.number(),
  dist: v.number(),
})

const PieParamsDefaults = {
  slices: 6,
  rotation: Math.PI,
  thickness: 0.5,
}
export const PieParamsSchema = v.object({
  slices: v.number(),
  rotation: v.number(),
  thickness: v.number(),
})
const RadialBlurParamsDefaults = {
  angle: Math.PI,
}
export const RadialBlurParamsShema = v.object({
  angle: v.number(),
})

const RectanglesParamsDefaults = {
  x: 2,
  y: 4,
}
export const RectanglesParamsSchema = v.object({
  x: v.number(),
  y: v.number(),
})

const Rings2ParamsDefaults = {
  val: 6,
}
export const Rings2ParamsSchema = v.object({
  val: v.number(),
})

export const parametricVariationParamsSchemas = {
  blob: {
    schema: BlobParamsSchema,
    defaults: BlobParamsDefaults,
  },
  curlVar: {
    schema: CurlParamsSchema,
    defaults: CurlParamsDefaults,
  },
  fan2: {
    schema: Fan2ParamsSchema,
    defaults: Fan2ParamsDefaults,
  },
  grid: {
    schema: GridParamsSchema,
    defaults: GridParamsDefaults,
  },
  juliaN: {
    schema: JuliaNParamsSchema,
    defaults: JuliaNParamsDefaults,
  },
  juliaScope: {
    schema: JuliaScopeParamsSchema,
    defaults: JuliaScopeParamsDefaults,
  },
  ngonVar: {
    schema: NgonParamsSchema,
    defaults: NgonParamsDefaults,
  },
  pdjVar: {
    schema: PdjParamsSchema,
    defaults: PdjParamsDefaults,
  },
  perspective: {
    schema: PerspectiveParamsSchema,
    defaults: PerspectiveParamsDefaults,
  },
  pie: {
    schema: PieParamsSchema,
    defaults: PieParamsDefaults,
  },
  radialBlurVar: {
    schema: RadialBlurParamsShema,
    defaults: RadialBlurParamsDefaults,
  },
  rectanglesVar: {
    schema: RectanglesParamsSchema,
    defaults: RectanglesParamsDefaults,
  },
  rings2: {
    schema: Rings2ParamsSchema,
    defaults: Rings2ParamsDefaults,
  },
}
