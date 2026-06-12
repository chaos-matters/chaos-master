/**
 * Migration map from old variation type names to their canonical Var-suffixed names.
 *
 * Background: Variations were originally defined with short names (e.g. 'horseshoe')
 * in simple/general/index.ts. They were later refactored into individual files with
 * Var-suffixed names (e.g. 'horseshoeVar'). This map enables loading old flames that
 * still reference the short names.
 *
 * This map should be integrated into the official flame migration toolset once it exists.
 */
const VARIATION_TYPE_MIGRATIONS: Record<string, string> = {
  // Short names → Var-suffixed canonical names
  linear: 'linearVar',
  sinusoidal: 'sinusoidalVar',
  spherical: 'sphericalVar',
  swirl: 'swirlVar',
  horseshoe: 'horseshoeVar',
  polar: 'polarVar',
  handkerchief: 'handkerchiefVar',
  heart: 'heartVar',
  disc: 'discVar',
  spiral: 'spiralVar',
  hyperbolic: 'hyperbolicVar',
  diamond: 'diamondVar',
  julia: 'juliaVar',
  bent: 'bentVar',
  fisheye: 'fisheyeVar',
  eyefish: 'eyefishVar',
  exponential: 'exponentialVar',
  power: 'powerVar',
  cosine: 'cosineVar',
  bubble: 'bubbleVar',
  cylinder: 'cylinderVar',
  noise: 'noiseVar',
  waves: 'wavesVar',
  popcorn: 'popcornVar',
  rings: 'ringsVar',
  fan: 'fanVar',

  // Casing fixes
  flipyVar: 'flipYVar',
  flipcircleVar: 'flipCircleVar',

  // Later additions
  pie: 'pieVar',
  gaussian: 'gaussianVar',
  juliaN: 'juliaNVar',

  // Newly renamed variations lacking 'Var' suffix
  radialBlur: 'radialBlurVar',
  blurZoom: 'blurZoomVar',
  blurLinear: 'blurLinearVar',
  blob: 'blobVar',
  juliaScope: 'juliaScopeVar',
  fan2: 'fan2Var',
  grid: 'gridVar',
  invCircle2: 'invCircle2Var',
  perspective: 'perspectiveVar',
  invEllipse: 'invEllipseVar',
  invCircle: 'invCircleVar',
  circus: 'circusVar',
  rings2: 'rings2Var',
  symNetG10: 'symNetG10Var',
  symBandG2: 'symBandG2Var',
  symNetG9: 'symNetG9Var',
  symNetG16: 'symNetG16Var',
  postCircleCrop: 'postCircleCropVar',
  postMirrorWf: 'postMirrorWfVar',
  symNetG4: 'symNetG4Var',
  symBandG4: 'symBandG4Var',
  symBandG6: 'symBandG6Var',
  symNetG2: 'symNetG2Var',
  postAxisSymmetryWf: 'postAxisSymmetryWfVar',
  postCurl: 'postCurlVar',
  postPointSymmetryWf: 'postPointSymmetryWfVar',
  symNetG3: 'symNetG3Var',
  postBWraps2: 'postBWraps2Var',
  symNetG1: 'symNetG1Var',
  symNetG11: 'symNetG11Var',
  symNetG7: 'symNetG7Var',
  symNetG5: 'symNetG5Var',
  postCrop: 'postCropVar',
  symNetG12: 'symNetG12Var',
  symBandG1: 'symBandG1Var',
  symNetG14: 'symNetG14Var',
  symNetG15: 'symNetG15Var',
  symNetG8: 'symNetG8Var',
  symNetG17: 'symNetG17Var',
  symNetG6: 'symNetG6Var',
  symBandG5: 'symBandG5Var',
  symNetG13: 'symNetG13Var',
  symBandG7: 'symBandG7Var',
  symBandG3: 'symBandG3Var',
  blurCircle: 'blurCircleVar',
  gaussianBlur: 'gaussianBlurVar',
  circleBlur: 'circleBlurVar',
  randomDisk: 'randomDiskVar',
  postSpherical: 'postSphericalVar',
  postSpinZ: 'postSpinZVar',
  preSpinZ: 'preSpinZVar',
  preBlur: 'preBlurVar',
  preSpherical: 'preSphericalVar',
  preDisc: 'preDiscVar',
}

/**
 * Migrates old variation type names to their canonical forms in-place.
 *
 * Walks all `transforms.*.variations.*.type` fields in the raw flame data
 * and remaps any deprecated type names. This must be called on the raw
 * (unvalidated) data before schema validation, since the schema only
 * accepts canonical type literals.
 *
 * @param data - Raw flame descriptor object (mutated in place)
 * @returns The same object with migrated type names
 */
export function migrateFlameVariationTypes<T>(data: T): T {
  if (typeof data !== 'object' || data === null) return data

  const obj = data as Record<string, unknown>
  const transforms = obj.transforms as
    | Record<string, Record<string, unknown>>
    | undefined

  if (typeof transforms !== 'object' || transforms === null) return data

  for (const transform of Object.values(transforms)) {
    if (typeof transform !== 'object' || transform === null) continue

    const variations = transform.variations as
      | Record<string, Record<string, unknown>>
      | undefined

    if (typeof variations !== 'object' || variations === null) continue

    for (const variation of Object.values(variations)) {
      if (typeof variation !== 'object' || variation === null) continue

      const type = variation.type
      if (typeof type === 'string' && type in VARIATION_TYPE_MIGRATIONS) {
        variation.type = VARIATION_TYPE_MIGRATIONS[type]
      }
    }
  }

  return data
}
