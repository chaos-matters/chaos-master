import { describe, expect, it } from 'vitest'
import { CINEMA_ALLOWED, cinemaPromptCard, isTopicId, LESSON_TOPICS, teachPromptCard, TOPIC_IDS, } from './topics'

describe('lesson topics', () => {
  it('has four P0 topics with goals, budgets and allow-lists', () => {
    expect(TOPIC_IDS).toEqual(['variations', 'affine', 'color', 'camera'])
    for (const id of TOPIC_IDS) {
      const t = LESSON_TOPICS[id]
      expect(t.goal.length).toBeGreaterThan(40)
      expect(t.stepBudget).toBeGreaterThanOrEqual(20)
      expect(t.allowed.length).toBeGreaterThan(0)
    }
    expect(isTopicId('color')).toBe(true)
    expect(isTopicId('audio')).toBe(false)
  })

  it('prompt cards name the tools the agent must call', () => {
    const card = teachPromptCard('affine')
    expect(card).toContain('arcade_start_lesson')
    expect(card).toContain('arcade_narrate')
    expect(card).toContain('arcade_end_lesson')
    expect(card).toContain('affine')
    const cinema = cinemaPromptCard('slow zoom into the core')
    expect(cinema).toContain('slow zoom into the core')
    expect(cinema).toContain('arcade_set_keyframes')
    expect(CINEMA_ALLOWED).toContain('timeline.')
  })
})
