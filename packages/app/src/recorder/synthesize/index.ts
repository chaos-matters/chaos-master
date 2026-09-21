export {
  canonicalFlame,
  canonicallyEqual,
  diffPaths,
  stableStringify,
} from './canonical'
export type { CanonicalFlame } from './canonical'
export {
  baseFlameFor,
  DEFAULT_SYNTHESIS_HOLD_MS,
  planCreation,
} from './planCreation'
export type { SynthesisOptions } from './planCreation'
export { replaySessionHeadless } from './replaySandbox'
export { createFlameSandbox } from './sandbox'
export type { FlameSandbox } from './sandbox'
export { isSynthesisStrategy, SYNTHESIS_STRATEGIES } from './strategies'
export type { SynthesisStrategy } from './strategies'
