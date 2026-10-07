import * as v from 'valibot'

export const ColorInitMode = v.picklist(['colorInitZero', 'colorInitPosition'])
export type ColorInitMode = v.InferOutput<typeof ColorInitMode>

export const DrawMode = v.picklist(['light', 'paint'])
export type DrawMode = v.InferOutput<typeof DrawMode>

export const PointInitMode = v.picklist([
  'pointInitCircle',
  'pointInitSquare',
  'pointInitCross',
  'pointInitPlus',
  'pointInitTriangle',
  'pointInitGaussian',
  'pointInitAnnulus',
  'pointInitStar',
  'pointInitHexagon',
  'pointInitSpiral',
  'pointInitHalton',
  'pointInitPerlin',
  'pointInitUnitDisk',
  'pointInitGaussianDisk',
  'pointInitUnitSquare',
  'pointInitModeGaussianSquare',
  'pointInitModeGaussianCircle',
  'pointInitUnitSphere',
  'pointInitUnitBall',
])
export type PointInitMode = v.InferOutput<typeof PointInitMode>
