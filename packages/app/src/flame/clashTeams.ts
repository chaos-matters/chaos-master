/**
 * Team-locked walkers: two Flame Clash fighters in one IFS, each keeping its
 * own attractor.
 *
 * A flame whose every transform carries a `team` ('A' or 'B'), with both teams
 * present, compiles a different chaos-game step. Each walker belongs to one
 * team for its whole chain and samples only its own team's transforms, so each
 * fighter keeps its true shape instead of the distorted union of both. Three
 * uniforms from `renderSettings.clash` carry the fight, and they are written
 * on every update, so nothing a fight does recompiles the shader:
 *
 * - `split` is the share of walkers on team A: walker `i` is on A when
 *   `i % 1024 < split * 1024`. Pushed to the end, one fighter consumes the
 *   other.
 * - `leakA` and `leakB` are the chance, per step, that a team-A or team-B
 *   walker borrows one map of the other team. The borrowed step lands the
 *   walker's own attractor inside the other fighter as small copies of
 *   itself: a pulse of it reads as a hit.
 *
 * A team whose probabilities sum to 0 (every map hidden or at probability 0,
 * which a uniform write can do at any frame) has no map to pick, and its
 * walkers would sit where they started, drawn as a bright ball. They walk the
 * other team's maps instead.
 *
 * Every other flame, including one where only some transforms are tagged,
 * compiles to exactly the shader it compiled to before this existed:
 * `clashTeamsOf` reports it disabled, the pipelines skip every team statement
 * at code generation, and ifsPipeline.wgslGolden.test.ts holds them to that
 * byte for byte.
 */
import { hash } from '@typegpu/noise'
import { tgpu } from 'typegpu'
import { f32, struct, u32 } from 'typegpu/data'
import { random } from '@/shaders/random'
import { recordEntries } from '@/utils/record'
import type { TgpuFn } from 'typegpu'
import type { AnyWgslData } from 'typegpu/data'
import type { FlameDescriptor, TransformRecord } from './schema/flameSchema'

/** Walkers are dealt to the teams in blocks of this many. */
export const CLASH_TEAM_BLOCK = 1024

export const ClashTeamUniforms = struct({
  split: f32,
  leakA: f32,
  leakB: f32,
}).$name('ClashTeamUniforms')

/** The team of the walker this invocation runs: 0 is A, 1 is B. */
export const clashTeamState = tgpu.privateVar(u32, 0).$name('clashTeam')

export type ClashTeams = {
  enabled: boolean
  /** Transform ids of team A and team B, in record order. */
  a: string[]
  b: string[]
}

const DISABLED: ClashTeams = { enabled: false, a: [], b: [] }

/**
 * The flame's teams. Enabled only when every transform names a team and both
 * teams have at least one; anything else renders as one flame, as it always
 * did. A blend never uses teams, so the 2D pipeline passes nothing for one.
 */
export function clashTeamsOf(transforms: TransformRecord | undefined) {
  if (!transforms) return DISABLED
  const a: string[] = []
  const b: string[] = []
  for (const [tid, transform] of recordEntries(transforms)) {
    if (transform.team === 'A') a.push(tid)
    else if (transform.team === 'B') b.push(tid)
    else return DISABLED
  }
  return a.length > 0 && b.length > 0 ? { enabled: true, a, b } : DISABLED
}

/**
 * What the teams add to a pipeline's cache key: which transform is on which
 * team is baked into the shader. Nothing for a flame without teams, so its
 * key is the one it always had.
 */
export function clashTeamsSignature(teams: ClashTeams) {
  return teams.enabled ? { clashTeams: { a: teams.a, b: teams.b } } : {}
}

/** The uniform-struct member the team kernel reads, when it compiles. */
export function clashTeamsUniformEntries(teams: ClashTeams) {
  return teams.enabled ? [['clashTeams', ClashTeamUniforms] as const] : []
}

const unit = (value: number | undefined, fallback: number) =>
  value !== undefined && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback

/** The fight's uniforms: an even split and no leak unless the flame says so. */
export function clashTeamValues(
  flame: Pick<FlameDescriptor, 'renderSettings'>,
) {
  const clash = flame.renderSettings.clash
  return {
    split: unit(clash?.split, 0.5),
    leakA: unit(clash?.leakA, 0),
    leakB: unit(clash?.leakB, 0),
  }
}

/** The sum of one team's probabilities, declared as `total`. */
function teamTotal(total: string, ids: readonly string[]) {
  return [
    `var ${total} = f32(0);`,
    ...ids.map(
      (tid) => `${total} += layout.$.flameUniforms.flame${tid}.probability;`,
    ),
  ].join('\n        ')
}

/** One team's step: pick a transform by probability among its own. */
function teamStep(total: string, ids: readonly string[]) {
  const picks = ids
    .map(
      (tid) => /* wgsl */ `{
            let u = layout.$.flameUniforms.flame${tid};
            probabilitySum += u.probability;
            if (flameIndex < probabilitySum) {
              return flame${tid}(point, u);
            }
          }`,
    )
    .join('\n          ')
  return /* wgsl */ `{
          let flameIndex = random() * ${total};
          var probabilitySum = f32(0);
          ${picks}
        }`
}

/**
 * The team kernel for a pipeline: the chaos-game step that replaces
 * `executeRandomFlame`, and the hash of a walker's index that replaces the
 * plain `hash` the compute entry seeds the walker with. That hash also deals
 * the walker its team, so the compute entry is the same for every flame.
 * Undefined for a flame without teams.
 *
 * `pointType` is the pipeline's Point struct (the header below leaves the
 * types to it); `flames` maps `flame<tid>` to each transform's function, and `layout` is the
 * pipeline's bind-group layout, which holds `flameUniforms`.
 */
export function clashKernel<P extends AnyWgslData>(
  teams: ClashTeams,
  pointType: P,
  flames: Record<string, TgpuFn>,
  layout: unknown,
) {
  if (!teams.enabled) return undefined
  const executeRandomFlame = tgpu.fn([pointType], pointType) /* wgsl */ `
      (point) {
        let clash = layout.$.flameUniforms.clashTeams;
        ${teamTotal('totalA', teams.a)}
        ${teamTotal('totalB', teams.b)}
        var team = clashTeam;
        if (team == 0u) {
          if (random() < clash.leakA) { team = 1u; }
        } else {
          if (random() < clash.leakB) { team = 0u; }
        }
        if (team == 0u && totalA <= 0.0) {
          team = 1u;
        } else if (team == 1u && totalB <= 0.0) {
          team = 0u;
        }
        if (team == 0u) ${teamStep('totalA', teams.a)} else ${teamStep('totalB', teams.b)}
        return point;
      }
    `
    .$uses({ ...flames, random, layout, clashTeam: clashTeamState })
    .$name('executeRandomFlame')
  const indexHash = tgpu.fn([u32], u32) /* wgsl */ `
      (pointIndex: u32) -> u32 {
        let split = layout.$.flameUniforms.clashTeams.split;
        clashTeam = select(1u, 0u, f32(pointIndex % ${CLASH_TEAM_BLOCK}u) < split * ${CLASH_TEAM_BLOCK}.0);
        return hash(pointIndex);
      }
    `
    .$uses({ layout, clashTeam: clashTeamState, hash })
    .$name('clashIndexHash')
  return { executeRandomFlame, indexHash }
}
