export {
  composeAffine2D,
  decomposeAffine2D,
  decomposedDeviation,
  interpolateAffine,
  isNearSingular,
  isReflection,
  lerpAngleShortest,
  lerpScaleLog,
  shortestAngleDelta,
} from './affine'
export { reduceTrack, reductionError } from './decimate'
export {
  classifyChange,
  clampGlideMs,
  easingFor,
  GLIDE_DURATIONS,
  glideFrameCount,
} from './durations'
export { pairTransforms, pairVariations } from './pairing'
export { DEFAULT_GLIDE_FPS, planGlide } from './plan'
export {
  GLIDE_QUALITY_SCALE,
  GLIDE_QUALITY_TIER_KEYS,
  GLIDE_QUALITY_TIERS,
  glideFrameQuality,
  glideTierForQualityPreset,
  isGlideQualityPreference,
  isGlideQualityTier,
  resolveGlideQuality,
} from './quality'
export {
  channelValuesAt,
  glideEndState,
  sampleGlide,
  writeGlidePath,
} from './sample'
export { buildGlideTracks, glideTrackCost } from './tracks'
export { isGlideRefusal, MAX_GLIDE_MS, MIN_GLIDE_MS } from './types'
export type {
  GlideChangeClass,
  GlideChannel,
  GlideNote,
  GlideOptions,
  GlidePlan,
  GlideQuality,
  GlideQualityPreference,
  GlideQualityTier,
  GlideRefusal,
} from './types'
