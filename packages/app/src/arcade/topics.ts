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
    goal: 'From a blank canvas, build a flame with three transforms that show three different variation families (for example linear, spherical and swirl). Change one weight and one parameter per transform so the viewer sees what each does. Narrate before each group of changes.',
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
      'camera.',
    ],
    stepBudget: 30,
    defaultStartFrom: 'blank',
  },
  affine: {
    id: 'affine',
    title: 'Affine transforms',
    goal: 'Show what the affine matrix does: on one transform demonstrate scale, rotation, shear and translation one at a time, then add a final transform and rotate it. Narrate what each coefficient means before changing it.',
    allowed: [
      'flame.addTransform',
      'flame.setTransformAffine',
      'flame.setAffine',
      'flame.setFinalAffine',
      'flame.setFinalTransform',
      'flame.applySymmetry',
      'flame.setProbability',
      'camera.',
    ],
    stepBudget: 30,
    defaultStartFrom: 'blank',
  },
  color: {
    id: 'color',
    title: 'Colour and tone',
    goal: 'Keep the current flame. Walk through colour: apply a palette, set one transform colour by hand, change colour speed, then tune exposure, gamma, vibrancy, contrast and background. Narrate the visual effect you expect before each change.',
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
    goal: 'Keep the current flame. Centre it, zoom into one detail, zoom back out, then explain skip iterations and draw mode by changing each once. Narrate what the viewer should look at.',
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

export function teachPromptCard(topic: TopicId): string {
  return `Teach me ${LESSON_TOPICS[topic].title.toLowerCase()} in Lumen Apeiron. Call arcade_start_lesson with topic "${topic}", then build the example step by step using only the commands listed in the lesson brief. Before each group of changes call arcade_narrate with one sentence explaining what you are about to do and why. Check your work with get_flame. When done, call arcade_end_lesson with a short title and summary.`
}

export function cinemaPromptCard(description: string): string {
  const wish =
    description.trim() || 'a slow, cinematic move that suits this flame'
  return `Animate my current flame in Lumen Apeiron: ${wish}. Call arcade_start_cinema, then arcade_get_animatable_paths to see what you can keyframe, then arcade_set_keyframes with tracks that realise the description (use easing, keep it under 10 seconds unless I say otherwise). Playback starts as soon as the keyframes land. Narrate your choices with arcade_narrate. Ask me if you want changes, and finish with arcade_end_cinema.`
}
