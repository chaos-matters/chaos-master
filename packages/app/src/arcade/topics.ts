export type TopicId =
  | 'variations'
  | 'affine'
  | 'color'
  | 'camera'
  | 'genetics'
  | 'sonification'
  | 'render'

export interface LessonTopic {
  id: TopicId
  title: string
  /** Sent to the agent verbatim as the lesson goal. */
  goal: string
  /** Exact ids or prefixes ending in "." (see guard.isCommandAllowed). */
  allowed: readonly string[]
  stepBudget: number
  defaultStartFrom: 'blank' | 'current'
}

/** Commands every Arcade mode may use. */
export const ALWAYS_ALLOWED = [
  'lesson.note',
  'sidebar.open',
  'sidebar.close',
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
    stepBudget: 30,
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
    stepBudget: 30,
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
    stepBudget: 25,
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
    stepBudget: 20,
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
    stepBudget: 20,
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
    stepBudget: 18,
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
    stepBudget: 18,
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
