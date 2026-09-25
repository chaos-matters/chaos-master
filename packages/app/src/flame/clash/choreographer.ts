/**
 * The scripted 12-second bout of the Flame Clash preview: the intro, one hit,
 * a beam clash, the Devour finisher and the victory, as a pure function of
 * time.
 *
 * Everything that moves is a uniform of the fight flame (placements, morph,
 * tint, split, leak, exposure) or the camera, so a whole bout compiles one
 * shader. The same wall time always gives the same frame, which is what a
 * clip export and a test both need.
 *
 * Two clocks run through it. Wall time is the real clock. Story time is wall
 * time held still for a few frames at each impact (a hit-stop): the action
 * freezes, the progressive renderer converges, and the impact frame becomes
 * the sharpest of the fight. The camera shake keeps to wall time, so the
 * freeze still trembles.
 *
 * Reduced motion keeps the story, the outcome and the captions, and drops
 * what moves the eye: the camera holds still, a fighter moves only by a short
 * slide or by a cut between beats, nothing squashes, spins or shakes, a flash
 * stays under x1.15, and the hit arrives as a slow leak.
 *
 * The winner is an input. Phase 1 scripts it; phase 2 hands in the result of
 * the rules, and `boutCues` is where sound and clip export will hook on.
 */
import { DEFAULT_TINT } from './tint'
import type { Placement, Vec3 } from './placement'
import type { Team } from './tint'

export type Beat = 'intro' | 'strike' | 'clash' | 'devour' | 'victory'

/**
 * A beam a fighter throws along the fight line: its strength (0 for none,
 * 1 at full) and the x on the fight line where it ends.
 */
export type Beam = { amount: number; to: number }

export const NO_BEAM: Beam = { amount: 0, to: 0 }

/**
 * Where a beam starts: this far out from its fighter's centre towards the
 * other fighter, by the fighter's scale. The script ends the winner's beam at
 * the loser's front and the loser's stream at the winner's, so neither beam
 * carries a walker into the other fighter's body.
 */
export const BEAM_FRONT = 0.3

export type FighterPose = {
  placement: Placement
  /** 0 the flat card, 1 the full 3D form (2D fighters only). */
  morph: number
  /** How far the fighter's hues are pulled to its team colour. */
  tint: number
  beam: Beam
}

/** The orbit camera, and how much of the arena it must show. */
export type ClashCamera = {
  theta: number
  phi: number
  fov: number
  target: Vec3
  /** Half the arena width and height, in arena units, the frame must hold. */
  halfWidth: number
  halfHeight: number
}

export type BoutFrame = {
  wall: number
  story: number
  beat: Beat
  /** True once the bout has played out; the frame then holds the victory. */
  done: boolean
  a: FighterPose
  b: FighterPose
  /** The fight uniforms: team A's share of walkers, and each side's leak. */
  split: number
  leakA: number
  leakB: number
  /** Multiplies the stage exposure: above 1 is an impact flash. */
  exposure: number
  camera: ClashCamera
}

export type BoutOptions = { winner: Team; reducedMotion: boolean }

export const BOUT_SECONDS = 12

/** Story times of the impacts, and how long each one holds. */
export const HIT_STOPS = [
  { at: 3.15, hold: 0.09 },
  { at: 9.9, hold: 0.11 },
] as const

const STORY_SECONDS =
  BOUT_SECONDS - HIT_STOPS.reduce((sum, stop) => sum + stop.hold, 0)

/** Story time of the start of each beat. */
const BEAT_STARTS: readonly (readonly [Beat, number])[] = [
  ['intro', 0],
  ['strike', 2.4],
  ['clash', 5.0],
  ['devour', 8.2],
  ['victory', 10.4],
]

/** Story time at wall time `wall`: the wall clock with each hit-stop held. */
export function storyTime(wall: number): number {
  const t = Number.isFinite(wall) ? Math.max(0, wall) : 0
  let shift = 0
  for (const stop of HIT_STOPS) {
    const start = stop.at + shift
    if (t < start) break
    if (t < start + stop.hold) return stop.at
    shift += stop.hold
  }
  return Math.min(STORY_SECONDS, t - shift)
}

/** The wall time a story moment first shows. */
export function wallTime(story: number): number {
  let wall = story
  for (const stop of HIT_STOPS) if (story > stop.at) wall += stop.hold
  return wall
}

export type BoutCue = {
  /** Wall seconds from the start of the bout. */
  wall: number
  kind: 'intro' | 'impact' | 'clash' | 'devour' | 'swallow' | 'victory' | 'end'
  /** The team that acts, where one does. */
  by?: Team
}

/** The moments sound and clip export hook onto, in wall time. */
export function boutCues(winner: Team): BoutCue[] {
  return [
    { wall: 0, kind: 'intro' },
    { wall: wallTime(HIT_STOPS[0].at), kind: 'impact', by: winner },
    { wall: wallTime(5.0), kind: 'clash' },
    { wall: wallTime(8.2), kind: 'devour', by: winner },
    { wall: wallTime(HIT_STOPS[1].at), kind: 'swallow', by: winner },
    { wall: wallTime(10.4), kind: 'victory', by: winner },
    { wall: BOUT_SECONDS, kind: 'end' },
  ]
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** 0 before a, 1 after b, a smooth S between. */
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}
/** 0 outside [a, b]; jumps to 1 at a and decays: a hit envelope. */
const pulse = (a: number, b: number, t: number) =>
  t < a || t > b ? 0 : Math.exp((-5 * (t - a)) / (b - a))
/** Fast early, slow late: the morph's visible change sits near 1. */
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3

/** The arena's fight line: A stands at -x, B at +x. */
const sideOf = (team: Team) => (team === 'A' ? -1 : 1)
/** B walks on a beat after A. */
const entranceDelay = (team: Team) => (team === 'A' ? 0 : 0.2)
/** Each fighter's mark on the fight line, and where it walks on from. */
const SEPARATION = 1.45
const ENTRANCE = 4.4
/** The marks of the beam clash, apart enough for the beams to show. */
const CLASH_MARK = 1.25
/**
 * Reduced motion: how far towards the loser the beams meet from the first
 * frame of the beam clash, and half how far they meet after its one step.
 * The contact point cannot slide, so the winner's beam is the longer from
 * the start.
 */
const REDUCED_LEAD = 0.3
/** How far the beam pressure pushes the loser back. */
const CLASH_SHOVE = 0.2
/** Half the arena width the beam clash frames. */
const CLASH_HALF_WIDTH = 2.7
/** Centre distance at which two fighters of scale 1 touch. */
const CONTACT = 1.1
/** The strike's dash ends at contact, never short of it. */
const DASH_REACH = 2 * SEPARATION - CONTACT
const MORPH_START = 0.5
const MORPH_END = 2.2
/** The turn that shows a flat card's depth as it inflates. */
const INFLATE_TURN = 0.9
/**
 * Each side's leak in the beam clash. The design's 0.2 cost a fifth more GPU
 * time and still read as two flames pressed together; the beams carry the
 * shot, and the leak only mixes a little colour across. It stays small
 * because a leaked walker scatters before its own maps pull it home: at 0.1
 * a julian fighter's scatter reached the frame's edge.
 */
const BEAM_LEAK = 0.05
/** How often the beam clash sways; kept under the 3 flashes a second limit. */
const SWAY_HZ = 1.2
/**
 * The winner's share of walkers from its surge in the beam clash to the
 * gulp. The loser keeps enough to be seen while it is drawn in.
 */
const DEVOUR_SHARE = 0.65
/** How much of the loser's walking borrows the winner's maps in the Devour. */
const SWALLOW_LEAK = 0.35
/** Reduced motion: the longest slide (0.2 of the separation) and the flash cap. */
const SLIDE = 0.2 * 2 * SEPARATION
const REDUCED_FLASH = 0.15

export function beatAt(story: number): Beat {
  let beat: Beat = 'intro'
  for (const [name, start] of BEAT_STARTS) if (story >= start) beat = name
  return beat
}

/**
 * Shared by both scripts: each fighter walks on in its own colours, so it is
 * recognised, takes its team colour as it reaches its mark, and then a flat
 * card inflates, so the recolour and the inflation read as two changes.
 */
function introLooks(story: number) {
  return {
    morph: easeOut((story - MORPH_START) / (MORPH_END - MORPH_START)),
    tint: DEFAULT_TINT * smooth(0.6, 1.4, story),
  }
}

/**
 * The beams of the full-motion script. In the beam clash both fighters throw
 * one to the contact point, and the winner's drives it back to the loser's
 * front as the loser's gives way. The winner's holds there, then hands the
 * light over to the loser's stream into the winner, the Devour: between the
 * two there is always a beam lit, and never both at full, since side by side
 * the stream reads as the loser's beam landing.
 *
 * The hand-over is a trade. Each beam's far end sits inside the other
 * fighter, where the owner's maps fling some of its walkers out as streaks:
 * a longer hold streaks the winner's walkers, an earlier stream the loser's.
 * It comes as the loser starts to be drawn in, so the stream reads as the
 * pull. Measured on a julian loser, handing over 0.2 s earlier streaked
 * half as much again.
 */
function beamsOf(s: number, winnerFront: number, contact: number) {
  const beaming = smooth(5.2, 5.7, s)
  const handOver = smooth(8.8, 9.2, s)
  // Out at 8.3 before it turns round, so the turn never shows.
  const givingWay = beaming * (1 - smooth(7.9, 8.3, s))
  return {
    winner: { amount: beaming * (1 - handOver), to: contact },
    loser:
      s < 8.3
        ? { amount: givingWay, to: contact }
        : { amount: handOver * (1 - smooth(9.6, 9.9, s)), to: winnerFront },
  }
}

/** Walker share and leaks: the fight's uniforms, as the winner's share. */
function fightUniforms(s: number, reducedMotion: boolean) {
  const approach = smooth(5.0, 5.7, s)
  // The loser keeps a share it can be seen with while it is drawn in, and
  // loses the rest at the gulp. Reduced motion cuts the loser against the
  // winner, where with all its walkers it flared (its brightest pixels went
  // from 437 to 1849), so the cut also takes half of them: measured, 23.
  const drawnIn = smooth(8.3, 9.3, s)
  const halved = reducedMotion && s >= 8.2 ? 0.5 : 0
  const gone = smooth(9.9, 10.3, s)
  // The struggle sways the walkers between the two, then stops for the
  // winner's surge: from 7.0 the winner only gains. A last swing to the
  // loser as the push slowed read as the loser holding.
  const sway = reducedMotion
    ? 0
    : 0.1 *
      Math.sin(2 * Math.PI * SWAY_HZ * (s - 5.3)) *
      approach *
      (1 - smooth(6.6, 7.0, s))
  // Reduced motion cannot show the push, so the winner has its walkers as
  // soon as the beams are up.
  const surge = reducedMotion ? smooth(5.2, 5.7, s) : smooth(7.0, 8.2, s)
  const clashShare = 0.5 + sway + (DEVOUR_SHARE - 0.5) * surge
  const devourShare = lerp(clashShare, DEVOUR_SHARE, drawnIn)
  const winnerShare = lerp(lerp(devourShare, 1, halved), 1, gone)
  const inClinch = approach * (1 - smooth(8.2, 8.6, s))
  const hit = reducedMotion
    ? 0.18 * smooth(2.9, 3.3, s) * (1 - smooth(3.6, 4.6, s))
    : 0.32 * pulse(3.15, 3.5, s)
  const swallowed = SWALLOW_LEAK * drawnIn * (1 - gone)
  return {
    winnerShare,
    winnerLeak: Math.max(hit, BEAM_LEAK * inClinch),
    loserLeak: Math.max(BEAM_LEAK * inClinch, swallowed),
  }
}

const pose = (
  position: Vec3,
  rest: Partial<Omit<Placement, 'position'>>,
  looks: { morph: number; tint: number },
  beam: Beam = NO_BEAM,
): FighterPose => ({
  placement: {
    position,
    yaw: rest.yaw ?? 0,
    lean: rest.lean ?? 0,
    scale: rest.scale ?? 1,
    squash: rest.squash ?? 1,
  },
  ...looks,
  beam,
})

function fullMotion(s: number, wall: number, winner: Team) {
  const loser: Team = winner === 'A' ? 'B' : 'A'
  const sw = sideOf(winner)
  const sl = sideOf(loser)
  const looks = introLooks(s)
  const enter = (delay: number) => easeOut((s - delay) / 1.4)
  const approach = smooth(5.0, 5.7, s)
  const bob = (phase: number) => 0.06 * Math.sin(1.7 * s + phase)
  // Both turn while the flat cards inflate, so the new depth shows.
  const turn = INFLATE_TURN * Math.sin(Math.PI * clamp01((s - 0.9) / 1.6))
  // The winner's strike: wind up, dash in, stop at contact on the impact,
  // recover. The loser is knocked back only after the hit-stop, so the frozen
  // impact frame shows the two touching.
  const wind = smooth(2.4, 2.9, s) * (1 - smooth(2.9, 3.15, s))
  const dash = smooth(2.9, 3.15, s) * (1 - smooth(3.35, 3.95, s))
  const knock = smooth(3.15, 3.45, s) * (1 - smooth(3.6, 4.4, s))
  // Through the beam clash the pressure pushes the loser back.
  const shove = sl * CLASH_SHOVE * smooth(5.9, 8.2, s)
  // Devour: the loser shrinks into the winner, the winner takes the centre.
  const shrink = smooth(8.6, 9.9, s)
  const drawn = smooth(8.8, 9.9, s)
  const centre = smooth(9.6, 10.4, s)
  const victory = smooth(10.4, 11.0, s)
  const stand = (team: Team) =>
    sideOf(team) *
    lerp(
      lerp(ENTRANCE, SEPARATION, enter(entranceDelay(team))),
      CLASH_MARK,
      approach,
    )
  const winnerX =
    lerp(stand(winner), 0, centre) - sw * (DASH_REACH * dash - 0.3 * wind)
  const loserX = lerp(stand(loser) + shove + sl * 0.55 * knock, sw * 0.3, drawn)
  const winnerScale =
    lerp(0.75, 1, enter(entranceDelay(winner))) *
    lerp(1, 1.12, smooth(9.0, 10.2, s))
  const loserScale =
    lerp(0.75, 1, enter(entranceDelay(loser))) * lerp(1, 0.35, shrink)
  // The beams meet between the two, and the winner's drives the contact
  // point back to the loser's front: slowly as they meet, then faster, and
  // never stalling, since a push that stops reads as the loser holding.
  const push = clamp01((s - 5.6) / 2.8) ** 1.3
  const loserFront = loserX - sl * BEAM_FRONT * loserScale
  const contact = lerp((winnerX + loserX) / 2, loserFront, push)
  const beams = beamsOf(s, winnerX - sw * BEAM_FRONT * winnerScale, contact)
  const facing = (side: number) => -side * lerp(0.3, 0.55, approach)
  const winnerPose = pose(
    [winnerX, bob(0), 0],
    {
      yaw: lerp(facing(sw), 0, victory) + turn + 0.5 * Math.max(0, s - 10.4),
      lean: -sw * (0.22 * dash - 0.18 * wind),
      scale: winnerScale,
      // The gulp: stretched at the swallow, settling back.
      squash: 1 + 0.15 * pulse(9.9, 10.4, s),
    },
    looks,
    beams.winner,
  )
  const loserPose = pose(
    [loserX, bob(1.3), 0],
    {
      yaw: facing(sl) + turn,
      lean: sl * 0.25 * knock,
      scale: loserScale,
      squash: 1 - 0.32 * pulse(3.15, 3.6, s),
    },
    looks,
    beams.loser,
  )
  const shake = 0.05 * pulse(3.15, 3.45, s)
  // The camera keeps the two fighters' midpoint in the middle of the frame:
  // through the strike, to its contact point and back, and from the beam
  // clash until the loser has been drawn in, so the shoved loser never
  // leaves the frame. Then it closes on the winner.
  const follow = smooth(2.6, 3.1, s) * (1 - smooth(3.9, 4.8, s))
  const close = smooth(9.3, 10.4, s)
  const track = Math.max(follow, approach) * (1 - close)
  const camera: ClashCamera = {
    // Keeps the fight line across the frame until only the winner is left.
    theta:
      -0.5 +
      0.5 * smooth(0, 2.4, s) +
      0.15 * smooth(2.4, 5.0, s) +
      0.6 * smooth(5.0, 8.2, s) -
      0.2 * smooth(8.2, 10.4, s) +
      0.5 * smooth(10.4, 11.8, s),
    phi: lerp(1.28, 1.18, smooth(5.0, 6.0, s)),
    fov: 50,
    target: [
      ((winnerX + loserX) / 2) * track +
        winnerX * close +
        shake * Math.sin(wall * 83),
      shake * Math.cos(wall * 71),
      0,
    ],
    halfWidth: lerp(
      lerp(SEPARATION + 1.3, CLASH_HALF_WIDTH, approach),
      1.5,
      close,
    ),
    halfHeight: 1.4,
  }
  const exposure = 1 + 0.8 * pulse(3.15, 3.33, s) + 0.8 * pulse(9.9, 10.3, s)
  return { winnerPose, loserPose, camera, exposure }
}

function reduced(s: number, winner: Team) {
  const loser: Team = winner === 'A' ? 'B' : 'A'
  const looks = introLooks(s)
  // Beats change by cuts: the intro marks, closer marks from the beam clash,
  // the loser pressed against the winner for the Devour, and the centre for
  // the victor. The winner holds its mark through the Devour cut: cutting
  // both to the middle read as the loser lunging. Within a beat the only
  // moves are the strike's short slide in and back and the swallow's.
  const closer = s >= 5.0
  const drawn = s >= 8.2
  const won = s >= 10.4
  const mark = (team: Team) => sideOf(team) * (closer ? CLASH_MARK : SEPARATION)
  const lunge = smooth(2.9, 3.15, s) * (1 - smooth(3.6, 4.4, s))
  const winnerX = won ? 0 : mark(winner) - sideOf(winner) * SLIDE * lunge
  const pressed = drawn ? mark(winner) - sideOf(winner) * CONTACT : mark(loser)
  // The swallow: the loser slides into the winner as it goes.
  const loserX = pressed - sideOf(loser) * SLIDE * smooth(9.3, 10.3, s)
  // The contact point cannot slide, so it steps towards the loser by a cut:
  // held in one place for the whole clash, it read as a stalemate. Then the
  // loser's beam fails and the winner's reaches the loser's front rather
  // than empty space, and the Devour cut ends both: between two fighters
  // that touch, a beam is only a stub.
  const failed = s >= 7.9
  const contact = sideOf(loser) * REDUCED_LEAD * (s < 6.8 ? 1 : 2)
  const loserFront = loserX - sideOf(loser) * BEAM_FRONT
  const beaming = drawn ? 0 : smooth(5.2, 5.7, s)
  const beams = {
    winner: { amount: beaming, to: failed ? loserFront : contact },
    loser: { amount: failed ? 0 : beaming, to: contact },
  }
  const still = (team: Team, x: number, beam: Beam) =>
    pose([x, 0, 0], { yaw: -sideOf(team) * 0.3 }, looks, beam)
  const camera: ClashCamera = {
    theta: 0.25,
    phi: 1.25,
    fov: 50,
    target: [0, 0, 0],
    halfWidth: SEPARATION + 1.3,
    halfHeight: 1.4,
  }
  return {
    winnerPose: still(winner, winnerX, beams.winner),
    loserPose: still(loser, loserX, beams.loser),
    camera,
    exposure: 1 + REDUCED_FLASH * (pulse(3.15, 3.33, s) + pulse(9.9, 10.3, s)),
  }
}

/** The bout at wall time `wall` (seconds). */
export function boutFrame(wall: number, options: BoutOptions): BoutFrame {
  const w = Number.isFinite(wall) ? Math.max(0, wall) : 0
  const s = storyTime(w)
  const { winner, reducedMotion } = options
  const staged = reducedMotion ? reduced(s, winner) : fullMotion(s, w, winner)
  const fight = fightUniforms(s, reducedMotion)
  const aWins = winner === 'A'
  return {
    wall: w,
    story: s,
    beat: beatAt(s),
    done: w >= BOUT_SECONDS,
    a: aWins ? staged.winnerPose : staged.loserPose,
    b: aWins ? staged.loserPose : staged.winnerPose,
    split: aWins ? fight.winnerShare : 1 - fight.winnerShare,
    leakA: aWins ? fight.winnerLeak : fight.loserLeak,
    leakB: aWins ? fight.loserLeak : fight.winnerLeak,
    exposure: staged.exposure,
    camera: staged.camera,
  }
}

/**
 * The orbit camera for a canvas of `aspect` (width / height): the radius
 * that holds the arena's half-width and half-height in the frame.
 */
export function orbitCamera(camera: ClashCamera, aspect: number) {
  const slope = Math.tan((camera.fov * Math.PI) / 360)
  const wide = Number.isFinite(aspect) && aspect > 0.1 ? aspect : 0.1
  return {
    theta: camera.theta,
    phi: camera.phi,
    radius: Math.max(
      camera.halfHeight / slope,
      camera.halfWidth / (slope * wide),
    ),
    target: [...camera.target] as [number, number, number],
    fov: camera.fov,
    roll: 0,
  }
}

/** What the stage says during `beat`, by the fighters' names. */
export function beatCaption(
  beat: Beat,
  names: Record<Team, string>,
  winner: Team,
): string {
  const loser: Team = winner === 'A' ? 'B' : 'A'
  switch (beat) {
    case 'intro':
      return `${names.A} vs ${names.B}`
    case 'strike':
      return `${names[winner]} strikes`
    case 'clash':
      return 'Beam clash'
    case 'devour':
      return `${names[winner]} devours ${names[loser]}`
    case 'victory':
      return `${names[winner]} wins`
  }
}
