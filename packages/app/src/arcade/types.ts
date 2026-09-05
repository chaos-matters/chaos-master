export type DuelOpponent = 'ai' | 'none'

export type DuelStartFrom = 'current' | 'random-2d' | 'random-3d'

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
