import { BlobParamsSchema } from '../variations/parametric/blob'
import { CurlParamsSchema } from '../variations/parametric/curl'
import { Fan2ParamsSchema } from '../variations/parametric/fan2'
import { GridParamsSchema } from '../variations/parametric/grid'
import { JuliaNParamsSchema } from '../variations/parametric/juliaN'
import { JuliaScopeParamsSchema } from '../variations/parametric/juliaScope'
import { NgonParamsSchema } from '../variations/parametric/ngon'
import { PdjParamsSchema } from '../variations/parametric/pdj'
import { PerspectiveParamsSchema } from '../variations/parametric/perspective'
import { PieParamsSchema } from '../variations/parametric/pie'
import { RadialBlurParamsSchema } from '../variations/parametric/radialBlur'
import { RectanglesParamsSchema } from '../variations/parametric/rectangles'
import { Rings2ParamsSchema } from '../variations/parametric/rings2'

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
