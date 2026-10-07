/**
 * One frame of a Flame Clash as the flame the renderer draws: both fighters'
 * transforms placed, tinted and tagged with their team, and the fight
 * uniforms, on a neutral stage.
 *
 * The fight flame is rebuilt every frame, but its shape never changes during
 * a bout (the same transform ids, variation ids and types, and teams), so
 * the renderer compiles it once and every frame after is a uniform write.
 *
 * The stage is neutral on purpose: neither fighter brings its palette or its
 * grading, so neither side looks stronger for its author's exposure. Each
 * keeps its own transform colours, turned toward its team's hue.
 *
 * Each team also carries one transform of the stage's own, its beam: a map
 * that lays the fighter's body onto a thin rod from its front to where the
 * beam ends. Its probability is the beam's strength, 0 outside a beam, so it
 * changes what is drawn without changing the shader. The map is bounded, so
 * no walker lands past either end of the rod, wherever it was.
 */
import { latestSchemaVersion, renderSettingsDefault, } from '../schema/flameSchema'
import { BEAM_FRONT } from './choreographer'
import { fighterForm } from './convert2Dto3D'
import { authoredFraming } from './framing'
import { composeAffine, fighterFrame, IDENTITY_AFFINE, invertAffine, placementAffine, placeTransform, } from './placement'
import { TEAM_COLOUR, tintColour } from './tint'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '../schema/flameSchema'
import type { BoutFrame, FighterPose } from './choreographer'
import type { FighterForm } from './convert2Dto3D'
import type { Affine3 } from './placement'
import type { Team } from './tint'

export type ClashFighter = {
  name: string
  form: FighterForm
  framing: Affine3
}

/**
 * Why a flame cannot fight, or undefined when it can. A fighter needs at
 * least one visible transform with a positive probability: with none, its
 * walkers would have no map to take and would sit where they started.
 */
export function unfitReason(flame: FlameDescriptor): string | undefined {
  const live = Object.values(flame.transforms).some(
    (t) => t.visible && t.probability > 0,
  )
  return live ? undefined : 'it has no visible transform to fight with'
}

export function clashFighter(
  flame: FlameDescriptor,
  name = flame.metadata.name || 'Untitled',
): ClashFighter {
  return { name, form: fighterForm(flame), framing: authoredFraming(flame) }
}

/** The neutral stage every bout renders on. */
export const STAGE_SETTINGS: FlameDescriptor['renderSettings'] = {
  ...renderSettingsDefault,
  dimensions: 3,
  drawMode: 'light',
  exposure: 0.35,
  vibrancy: 1,
  contrast: 1.15,
  gamma: 2.4,
  depthColorPower: 0.3,
  autoExposure3D: true,
  pointInitMode: 'pointInitUnitBall',
  colorInitMode: 'colorInitZero',
  skipIters: 20,
  densityEstimationQuality: 0.8,
}

const prefixOf = (team: Team) => (team === 'A' ? 'a_' : 'b_')

/**
 * The share of a team's steps a beam of unit length takes at full strength.
 * A beam's steps grow with its length, from half this share at length 0.5
 * to BEAM_FULL_LENGTH times it, so a beam is lit about as brightly along its
 * length as it grows and the winner's does not dim as it drives the contact
 * point back.
 */
export const BEAM_SHARE = 0.15
/**
 * The length past which a beam takes no more of its team's steps. At twice
 * the share, the winner's body was left hollow behind its longest beam.
 */
export const BEAM_FULL_LENGTH = 1.5
/** A beam's thickness, against its fighter's size. */
const BEAM_WIDTH = 0.1

/**
 * The id of each team's beam transform, and of its one variation. A fighter's
 * own ids all start `a_` or `b_`, so no fighter transform can take a beam's.
 */
export const beamId = (team: Team) =>
  `beam_${team.toLowerCase()}` as TransformId
const BEAM_VARIATION = 'beam' as VariationId

/**
 * The team's beam for this frame. It maps the fighter's body, about `scale`
 * around its position, onto a rod along the fight line from the fighter's
 * front to `beam.to`; the fighter's own maps then pull each point back, so
 * the rod glows in the fighter's colours. `teamProbability` is the sum of
 * the fighter's own probabilities, which the beam's share is taken against.
 *
 * The map runs through sinusoidal3D: the pre-affine spreads the body over a
 * quarter turn either side of the fighter's centre, where the sine climbs
 * from -1 to 1, and the post-affine lays that range along the rod. A linear
 * map would carry a walker far from the body (one a leak carried into the
 * other fighter) as far past the rod's ends; the sine folds it back onto the
 * rod instead. Across the rod the body spans only a twelfth of a turn either
 * side, where the sine is still nearly straight, so the rod is lit through
 * its core like the body it carries; spread over the whole quarter turn, the
 * sine would pile the body onto the rod's two edges and leave it hollow.
 */
export function beamTransform(
  team: Team,
  pose: FighterPose,
  teamProbability: number,
): TransformFunction {
  const [x, y, z] = pose.placement.position
  const size = pose.placement.scale > 0 ? pose.placement.scale : 1
  const toward = Math.sign(pose.beam.to - x) || (team === 'A' ? 1 : -1)
  const start = x + toward * BEAM_FRONT * size
  const half = Math.abs(pose.beam.to - start) / 2
  const middle = (start + pose.beam.to) / 2
  const turn = Math.PI / 2 / size
  const turnAcross = Math.PI / 6 / size
  // The body's edge lands at the beam's width; a stray walker folds back
  // within twice that.
  const width = (BEAM_WIDTH * size) / Math.sin(Math.PI / 6)
  const reach = Math.min(BEAM_FULL_LENGTH, Math.max(0.5, 2 * half))
  const share = BEAM_SHARE * reach * Math.min(1, Math.max(0, pose.beam.amount))
  const { hue, chroma } = TEAM_COLOUR[team]
  return {
    probability: (teamProbability * share) / (1 - share),
    preAffine: {
      ...IDENTITY_AFFINE,
      a: turn,
      d: -turn * x,
      f: turnAcross,
      h: -turnAcross * y,
      k: turnAcross,
      l: -turnAcross * z,
    },
    postAffine: {
      ...IDENTITY_AFFINE,
      a: half,
      d: middle,
      f: width,
      h: y,
      k: width,
      l: z,
    },
    color: { x: chroma * Math.cos(hue), y: chroma * Math.sin(hue) },
    colorSpeed: 0.4,
    visible: true,
    team,
    variations: {
      [BEAM_VARIATION]: { type: 'sinusoidal3D', weight: 1, visible: true },
    },
  }
}

/** One fighter's transforms for this frame, keyed `a_<id>` or `b_<id>`. */
export function fighterTransforms(
  fighter: ClashFighter,
  team: Team,
  pose: FighterPose,
): Record<string, TransformFunction> {
  const place = composeAffine(placementAffine(pose.placement), fighter.framing)
  const frame = fighterFrame(place, fighter.form.finalTransform)
  // A placement always inverts (its scale and squash are positive), so the
  // fallback only guards a degenerate framing.
  const inverse = invertAffine(frame)
  const out: Record<string, TransformFunction> = {}
  let probability = 0
  for (const [tid, t] of Object.entries(
    fighter.form.transformsAt(pose.morph),
  )) {
    const placed = inverse ? placeTransform(t, frame, inverse) : t
    out[`${prefixOf(team)}${tid}`] = {
      ...placed,
      color: tintColour(t.color, team, pose.tint),
      team,
    }
    if (t.visible) probability += t.probability
  }
  out[beamId(team)] = beamTransform(team, pose, probability)
  return out
}

/** The fight flame at `frame`. */
export function fightFlame(
  a: ClashFighter,
  b: ClashFighter,
  frame: BoutFrame,
): FlameDescriptor {
  return {
    version: latestSchemaVersion,
    metadata: {
      name: `${a.name} vs ${b.name}`,
      author: 'Flame Clash',
      description: 'A Flame Clash preview bout.',
    },
    renderSettings: {
      ...STAGE_SETTINGS,
      exposure: STAGE_SETTINGS.exposure + Math.log(frame.exposure),
      clash: { split: frame.split, leakA: frame.leakA, leakB: frame.leakB },
    },
    transforms: {
      ...fighterTransforms(a, 'A', frame.a),
      ...fighterTransforms(b, 'B', frame.b),
    },
  }
}
