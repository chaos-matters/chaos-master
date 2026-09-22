import type { DuelStartFrom, LessonTopic, TopicId } from './types'
import type { TacticalStance } from '@/flame/stats'
import type { Dims } from '@/flame/variationRegistry'

export type { DuelStartFrom, LessonTopic, TopicId }

/** Commands every Arcade mode may use. */
export const ALWAYS_ALLOWED = [
  'lesson.note',
  'sidebar.open',
  'sidebar.close',
] as const

/**
 * How a change is PRESENTED, as against what the change is.
 *
 * Teach, Cinema and Beats may flip these. They present to somebody watching,
 * and an agent that wants every change from here on to flow rather than cut
 * should not have to remember a duration on each call. The per-call
 * `glideMs` on `execute_command` is the other half of the same permission
 * and is gated separately, in `webmcp/tools/executeCommand.ts`. They last
 * for the take: it holds both as the viewer left them, and `finishPilot`
 * gives them back once whatever transition is in flight has landed.
 *
 * Enforced, never advertised. Each of those modes adds them to the list its
 * lock enforces and describes its brief from the list without them: a brief
 * is a tool result held to ~1.5 KB, and the variations brief already sits at
 * the edge of it. An agent finds them where it already looks for what it may
 * do: the refusal message prints the enforced list, and `list_commands`
 * names every command, with its argument shape once the query is narrowed to
 * a prefix.
 *
 * Not a duel, which refuses transitions outright: the switch would be a
 * setting with no effect, and a duel points the tools at the rival's seat
 * while the only glide runtime belongs to the player's workspace.
 *
 * Not `glide.toFlame`, in any mode. It carries a whole descriptor and
 * REPLACES the document with it, which is the `flame.load` permission wearing
 * a glide's name — a different thing from choosing how a change appears.
 */
export const PRESENTATION_SWITCHES = [
  'glide.setEnabled',
  'glide.setQuality',
] as const

export const LESSON_TOPICS: Record<TopicId, LessonTopic> = {
  variations: {
    id: 'variations',
    title: 'Variations',
    goal: "Teach what a variation is, from a blank canvas. Show three different variation families on separate transforms and change enough weights and parameters that each family's effect is attributable. Pick the families and values yourself.",
    allowed: [
      'flame.addTransform',
      'flame.deleteTransform',
      'flame.addVariation',
      'flame.deleteVariation',
      'flame.setVariation',
      'flame.setVariationWeight',
      'flame.setVariationParams',
      'flame.setVariationVisible',
      'flame.setProbability',
      'flame.setColorSpeed',
      'camera.center',
      'camera.zoomTo',
    ],
    stepBudget: 45,
    defaultStartFrom: 'blank',
  },
  affine: {
    id: 'affine',
    title: 'Affine transforms',
    goal: 'Teach what the affine matrix does. Demonstrate scale, rotation, shear and translation one at a time so each is attributable, then show what a final transform adds. Pick the values yourself.',
    allowed: [
      'flame.addTransform',
      'flame.setTransformAffine',
      'flame.setAffine',
      'flame.setFinalAffine',
      'flame.setFinalTransform',
      'flame.applySymmetry',
      'flame.setProbability',
      'camera.center',
      'camera.zoomTo',
    ],
    stepBudget: 45,
    defaultStartFrom: 'blank',
  },
  color: {
    id: 'color',
    title: 'Colour and tone',
    goal: "Teach how colour and tone are decided on this flame: where a transform's colour comes from, what colour speed changes, and how the tone controls trade brightness for detail. Pick the controls that make the point.",
    allowed: [
      'flame.applyPalette',
      'flame.removePalette',
      'flame.setTransformColor',
      'flame.setAllTransformColors',
      'flame.setColorSpeed',
      'flame.setExposure',
      'flame.setGamma',
      'flame.setVibrancy',
      'flame.setContrast',
      'flame.setBackgroundColor',
      'flame.setDrawMode',
    ],
    stepBudget: 40,
    defaultStartFrom: 'current',
  },
  camera: {
    id: 'camera',
    title: 'Camera and framing',
    goal: 'Teach framing on this flame: what the camera changes about the picture and what it leaves untouched in the fractal, and how to find and hold a detail. Pick the moves yourself.',
    allowed: [
      'camera.',
      'flame.setSkipIters',
      'flame.setDrawMode',
      'view.setShowTimeline',
    ],
    stepBudget: 32,
    defaultStartFrom: 'current',
  },
  genetics: {
    id: 'genetics',
    title: 'Randomness and mutation',
    goal: 'Teach how the randomizer and the mutator explore flame space. Draw a few fresh flames, then mutate one of them repeatedly so the family resemblance between generations is visible. Pick the strengths yourself.',
    allowed: [
      'flame.randomize',
      'flame.mutate',
      'flame.setExposure',
      'camera.center',
      'camera.zoomTo',
    ],
    stepBudget: 32,
    defaultStartFrom: 'current',
  },
  sonification: {
    id: 'sonification',
    title: 'Sound and sonification',
    goal: 'Teach how this flame is turned into sound. Switch sonification on, then change the model, the scale and the voice count one at a time so each is audible on its own. Say what to listen for before each change.',
    allowed: [
      'sonification.setEnabled',
      'sonification.setConfig',
      'camera.center',
      'camera.zoomTo',
    ],
    stepBudget: 28,
    defaultStartFrom: 'current',
  },
  render: {
    id: 'render',
    title: 'Noise and convergence',
    goal: 'Teach how the picture converges: what the quality preset, the skipped iterations and the two filters change about noise and detail, and what each costs. Lowering quality is allowed, raising it is not.',
    allowed: [
      'view.setQualityPreset',
      'view.setPixelRatio',
      'view.setAdaptiveFilter',
      'view.setStochasticFilter',
      'flame.setSkipIters',
      'flame.setDrawMode',
      'camera.zoomTo',
    ],
    stepBudget: 28,
    defaultStartFrom: 'current',
  },
}

export const TOPIC_IDS = Object.keys(LESSON_TOPICS) as TopicId[]

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === 'string' && value in LESSON_TOPICS
}

/** Same reset the Example 1 creation tour performs. */
export const BLANK_CANVAS_STEPS: readonly (readonly [string, ...unknown[]])[] =
  [
    ['flame.clearTransforms'],
    ['flame.setSkipIters', 1],
    ['flame.setExposure', 0.25],
    ['flame.setDrawMode', 'light'],
    ['camera.center'],
    ['camera.zoomTo', 1],
  ]

/**
 * One-click starting points for a Cinema wish.
 *
 * A blank description is the worst moment in the flow: it asks the viewer to
 * art-direct a fractal before they have seen the mode work. Each preset fills
 * the field with a sentence they can then edit, and names a scope as well as
 * an ambition — "small" alone tells the agent how much to move but not what,
 * which is the half that decides whether the take reads.
 */
export interface CinemaPreset {
  id: string
  label: string
  wish: string
}

export const CINEMA_PRESETS: readonly CinemaPreset[] = [
  {
    id: 'small',
    label: 'Small and slow',
    wish: 'one idea only, moved slowly — about five seconds, so the change reads clearly',
  },
  {
    id: 'big',
    label: 'Big and cinematic',
    wish: 'a full take with the camera, the colour and the transforms all moving together, about nine seconds, building to a resolve',
  },
  {
    id: 'surprise',
    label: 'Surprise me',
    wish: 'surprise me — read the flame first and pick whichever move suits it, then tell me why you chose it',
  },
]

export const CINEMA_ALLOWED = [
  'timeline.',
  'camera.',
  'view.setShowTimeline',
  'flame.setExposure',
  'flame.setVibrancy',
  'flame.setContrast',
] as const
export const CINEMA_STEP_BUDGET = 40

/**
 * The escape hatch, appended to every prompt card.
 *
 * A judge's assistant may report the page as WebMCP-capable and still not
 * surface the tools to itself — the tools are on `document.modelContext`
 * either way. Two things trip up anyone driving that API by hand, and both
 * throw rather than returning an error: `executeTool` wants the registered
 * tool object rather than its name, and the arguments must already be a JSON
 * string. Spelling both out costs a few lines and saves the session.
 */
export const WEBMCP_FALLBACK_NOTE =
  "If you cannot see these as tools, drive them from the page instead - they are registered on document.modelContext. Take the tool object from getTools and pass arguments as a JSON string: const t = (await document.modelContext.getTools()).find(x => x.name === 'arcade_status'); await document.modelContext.executeTool(t, JSON.stringify({})). Passing the name, or a plain object, throws."

export function teachPromptCard(topic: TopicId): string {
  return `Teach me ${LESSON_TOPICS[topic].title.toLowerCase()} in Lumen Apeiron. Call arcade_start_lesson with topic "${topic}", then build the example step by step using only the commands listed in the lesson brief. Before each group of changes call arcade_narrate with one short sentence — under 25 words — explaining what you are about to do and why; the sentence is shown as a caption over the flame while it changes, so split a longer explanation into two narration steps rather than writing a paragraph. Check your work with get_flame. When done, call arcade_end_lesson with a short title and summary.

${WEBMCP_FALLBACK_NOTE}`
}

export function cinemaPromptCard(description: string): string {
  const wish =
    description.trim() || 'a slow, cinematic move that suits this flame'
  return `Animate my current flame in Lumen Apeiron: ${wish}. Call arcade_start_cinema, then arcade_get_animatable_paths to see what you can keyframe, then build the animation up with arcade_set_keyframes: one call per idea (camera move, then colour drift, then transform sway), each with mode "add" and the same durationFrames, so I watch each beat land and can replay it. Use easing, keep it under 10 seconds unless I say otherwise. Playback runs once per call. Narrate your choices with arcade_narrate. Ask me if you want changes, and finish with arcade_end_cinema.

${WEBMCP_FALLBACK_NOTE}`
}

/**
 * What an agent may do in a duel.
 *
 * Flame and camera only. No `timeline.` — a duel is judged on a still, and an
 * animation running on one half while the viewer works on the other is noise
 * and GPU cost. No `view.` or `sidebar.` — those are the viewer's chrome, and
 * the agent's seat has none. The guard's existing locks (point count,
 * dimensions, quality, exports, history) apply on top.
 */
export const DUEL_ALLOWED = ['flame.', 'camera.'] as const

export const DUEL_STEP_BUDGET = 60

/**
 * What the viewer's side starts as, in the words the prompt uses.
 *
 * The duel is started by the agent, on whatever the viewer has open, so this
 * is how a viewer asks for a 3D duel without loading a 3D flame by hand first.
 */
const START_FROM_PHRASE: Record<DuelStartFrom, string> = {
  current: '',
  'random-2d':
    ' Pass startFrom: "random-2d" — I want to start from a fresh random 2D flame rather than the one I have open.',
  'random-3d':
    ' Pass startFrom: "random-3d" — I want a 3D duel, starting from a fresh random 3D flame rather than the one I have open.',
}

export function duelPromptCard(
  seconds: number,
  startFrom: DuelStartFrom = 'current',
  // Start from the open flame and it is whatever that flame is; the panel
  // that builds the card knows, and passes it.
  dimensions: Dims = startFrom === 'random-3d' ? 3 : 2,
): string {
  const minutes = Math.round((seconds / 60) * 10) / 10
  const clock = minutes === 1 ? '1 minute' : `${minutes} minutes`
  // The camera commands read as 2D verbs, and how they land on an orbit is
  // not something an agent can guess; the angles have no 2D counterpart at
  // all, so those are named as the render-setting paths they are.
  const camera3D =
    dimensions === 3
      ? ' In 3D the camera is an orbit around a point, and every camera.* command drives it: zoom is how close the orbit sits, pan moves the point it looks at in x and y, and camera.center resets the whole orbit including the angle you are viewing from. For the angle itself, the depth of that point, and the lens, read renderSettings.camera3D from get_flame and set camera3D.theta, camera3D.phi, camera3D.target, camera3D.fov or camera3D.roll with execute_command flame.setRenderSetting.'
      : ''
  return `Duel me in Lumen Apeiron. Call arcade_start_duel to begin: we each get ${clock} and our own flame, side by side, and I am editing mine while you edit yours.${START_FROM_PHRASE[startFrom]} Read your flame with get_flame and change it with execute_command — only flame.* and camera.* are allowed, and you have ${DUEL_STEP_BUDGET} steps.${camera3D} Say what you are going for with arcade_narrate as you work. Aim for something striking rather than merely complicated. You cannot end the duel — the clock does, and I can call it early — so when you are happy call arcade_duel_ready with a short title and keep polishing until time runs out.

${WEBMCP_FALLBACK_NOTE}`
}

/**
 * Commands an agent may use in Beats mode.
 */
export const BEATS_ALLOWED = [
  ...ALWAYS_ALLOWED,
  'audio.applySnapshot',
  'audio.setPreset',
  'audio.setMapping',
  'audio.addMapping',
  'audio.removeMapping',
  'audio.clearMappings',
  'sonification.setConfig',
  'sonification.setEnabled',
  'camera.center',
  'camera.zoomTo',
] as const

export const BEATS_STEP_BUDGET = 30

export interface BeatsPreset {
  id: string
  label: string
  wish: string
}

export const BEATS_PRESETS: readonly BeatsPreset[] = [
  {
    id: 'pulse-and-breathe',
    label: 'Pulse & Breathe',
    wish: 'Wire sub-bass to scale and exposure so the fractal breathes on each beat, with mids driving subtle color drift.',
  },
  {
    id: 'color-symphony',
    label: 'Color Symphony',
    wish: 'Connect frequency bands across presence and brilliance to colorSpeed and palettePhase for an evolving color show.',
  },
  {
    id: 'structural-drift',
    label: 'Structural Drift',
    wish: 'Map bass and beat onsets to affine rotation and variation weights so the geometry morphs dynamically with the groove.',
  },
  {
    id: 'chaos-morph',
    label: 'Chaos Morph',
    wish: 'Drive non-linear variation weights and contrast with RMS energy and beat transients for an intense, energetic response.',
  },
] as const

export function beatsPromptCard(
  trackName: string = 'Ember Drift',
  styleGoal?: string,
): string {
  const goalText =
    styleGoal?.trim() ||
    'Wire sub-bass and bass to structural scale, vibrancy and exposure, map mids to color speed, and link high frequencies and beat onsets to variation weights so the flame moves expressively with the track.'

  return `Make my flame dance in Lumen Apeiron to "${trackName}". Call arcade_start_beats to lock the editor and begin. Then call arcade_get_audio_catalog to see available audio features and valid flame modulation targets. Build your audio-reactive configuration using arcade_set_audio_mapping: ${goalText}. Narrate your musical choices with arcade_narrate, and finish with arcade_end_beats when your audio-reactive mapping is complete.

${WEBMCP_FALLBACK_NOTE}`
}

export interface DirectorPreset {
  id: string
  label: string
  wish: string
}

export const DIRECTOR_PRESETS: readonly DirectorPreset[] = [
  {
    id: 'mandala-symmetry',
    label: 'Structured Mandalas',
    wish: 'Evolve candidates toward higher rotational symmetry, clean radial boundaries, and harmonious sacred geometry.',
  },
  {
    id: 'deep-bioluminescence',
    label: 'Deep Bioluminescence',
    wish: 'Develop rich jewel-toned palettes, deep contrasts, and organic flora-like structural complexity.',
  },
  {
    id: 'chaotic-curls',
    label: 'Chaotic Curls',
    wish: 'Push high non-linear chaos levels, turbulent spiral curls, and energetic tendrils.',
  },
  {
    id: 'minimalist-geometry',
    label: 'Minimalist Geometry',
    wish: 'Focus on sparse, elegant transforms with balanced weights and understated color palettes.',
  },
] as const

export function directorPromptCard(goal?: string): string {
  const goalText =
    goal?.trim() ||
    'Inspect my current flame and taste profile with director_get_taste_profile. Propose a generation of 4-6 diverse candidate flames using director_propose, explaining your artistic rationale for each. Then call director_get_feedback to review my Like/Dislike reactions and tags, and breed or mutate the next generation toward my preferences.'

  return `Act as the Evolutionary Art Director in Lumen Apeiron. Call director_get_taste_profile first to read my historical aesthetic preferences. Propose a curated generation of candidates with director_propose: ${goalText}. Then call director_get_feedback to review which candidates I liked or disliked and what tags I selected. Evolve the flame across multiple generations toward what I love.

${WEBMCP_FALLBACK_NOTE}`
}

export interface ArenaStanceOption {
  id: TacticalStance
  label: string
  bonus: string
  description: string
}

export const ARENA_STANCES: readonly ArenaStanceOption[] = [
  {
    id: 'balanced',
    label: 'Harmonic Stance',
    bonus: 'Balanced',
    description: 'Balanced power allocation with stable territory defense.',
  },
  {
    id: 'resonance',
    label: 'Resonance Surge',
    bonus: '+25% ATK',
    description:
      'Overcharges energy intensity for aggressive offensive expansion.',
  },
  {
    id: 'bastion',
    label: 'Symmetry Bastion',
    bonus: '+30% DEF',
    description: 'Constructs crystalline barriers to resist enemy attacks.',
  },
  {
    id: 'entropy',
    label: 'Entropy Overload',
    bonus: '+35% Crit',
    description: 'Unleashes chaotic non-linear fluctuations for critical hits.',
  },
] as const

export interface ArenaArchetypeOption {
  id: string
  name: string
  className: string
  school: string
}

export const ARENA_ARCHETYPES_LIST: readonly ArenaArchetypeOption[] = [
  {
    id: 'chaos_lord',
    name: 'Chaos Lord',
    className: 'Entropic Warlord',
    school: 'Void',
  },
  {
    id: 'symmetry_monolith',
    name: 'Symmetry Monolith',
    className: 'Crystalline Bastion',
    school: 'Crystal',
  },
  {
    id: 'spiral_leviathan',
    name: 'Spiral Leviathan',
    className: 'Abyssal Swirl',
    school: 'Vortex',
  },
  {
    id: 'quantum_siren',
    name: 'Quantum Siren',
    className: 'Harmonic Phantom',
    school: 'Tide',
  },
  {
    id: 'solar_seraph',
    name: 'Solar Seraph',
    className: 'Radiant Core',
    school: 'Order',
  },
  {
    id: 'void_stalker',
    name: 'Void Stalker',
    className: 'Dark Singularity',
    school: 'Arcane',
  },
] as const

export function arenaPromptCard(
  opponentName: string = 'Chaos Lord',
  stanceName: string = 'balanced',
  strategyGoal?: string,
): string {
  const goalText =
    strategyGoal?.trim() ||
    `Evaluate our flame with arena_get_stats to identify our school strengths, stability, and crit potential. Formulate a battle plan against ${opponentName} in ${stanceName} stance.`

  return `Coach and battle with me in the Flame Clash Arena in Lumen Apeiron. Check our stats with arena_get_stats to determine our school affinities and attributes against ${opponentName} (stance: ${stanceName}). Execute combat strategy: ${goalText}. Launch and animate the visual combat in the UI using arena_start_clash (or simulate_clash), watch the fighters clash in the arena spectator HUD, and use arena_commentate to narrate turns, track remaining HP, and celebrate victory!

${WEBMCP_FALLBACK_NOTE}`
}
