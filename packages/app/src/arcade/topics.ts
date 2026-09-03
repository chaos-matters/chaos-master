export type TopicId = 'variations' | 'affine' | 'color' | 'camera'

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
  return `Teach me ${LESSON_TOPICS[topic].title.toLowerCase()} in Lumen Apeiron. Call arcade_start_lesson with topic "${topic}", then build the example step by step using only the commands listed in the lesson brief. Before each group of changes call arcade_narrate with one sentence explaining what you are about to do and why. Check your work with get_flame. When done, call arcade_end_lesson with a short title and summary.

${WEBMCP_FALLBACK_NOTE}`
}

export function cinemaPromptCard(description: string): string {
  const wish =
    description.trim() || 'a slow, cinematic move that suits this flame'
  return `Animate my current flame in Lumen Apeiron: ${wish}. Call arcade_start_cinema, then arcade_get_animatable_paths to see what you can keyframe, then arcade_set_keyframes with tracks that realise the description (use easing, keep it under 10 seconds unless I say otherwise). Playback starts as soon as the keyframes land. Narrate your choices with arcade_narrate. Ask me if you want changes, and finish with arcade_end_cinema.

${WEBMCP_FALLBACK_NOTE}`
}
