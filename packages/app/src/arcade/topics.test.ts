import '@/commands/builtins'
import { describe, expect, it } from 'vitest'
import { getAllCommands } from '@/commands/registry'
import { CINEMA_ALLOWED, CINEMA_PRESETS, cinemaPromptCard, isTopicId, LESSON_TOPICS, teachPromptCard, TOPIC_IDS, } from './topics'

describe('lesson topics', () => {
  it('has every topic with a goal, a budget and an allow-list', () => {
    expect(TOPIC_IDS).toEqual([
      'variations',
      'affine',
      'color',
      'camera',
      'genetics',
      'sonification',
      'render',
    ])
    for (const id of TOPIC_IDS) {
      const t = LESSON_TOPICS[id]
      expect(t.goal.length).toBeGreaterThan(40)
      expect(t.stepBudget).toBeGreaterThanOrEqual(18)
      expect(t.allowed.length).toBeGreaterThan(0)
    }
    expect(isTopicId('color')).toBe(true)
    expect(isTopicId('audio')).toBe(false)
  })

  // Every allow-list entry has to name something the registry actually has,
  // or the lesson silently teaches nothing: the guard refuses the command and
  // the agent burns its budget on rejections.
  it('only allows commands that exist', () => {
    const known = new Set(getAllCommands().map((command) => command.id))
    const missing = TOPIC_IDS.flatMap((id) =>
      LESSON_TOPICS[id].allowed
        .filter((entry) => !entry.endsWith('.') && !known.has(entry))
        .map((entry) => `${id}: ${entry}`),
    )
    expect(missing).toEqual([])
  })

  it('offers cinema presets that fill the wish with a full sentence', () => {
    expect(CINEMA_PRESETS.map((preset) => preset.id)).toEqual([
      'small',
      'big',
      'surprise',
    ])
    for (const preset of CINEMA_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(3)
      expect(preset.wish.length).toBeGreaterThan(30)
      // The wish is pasted into the prompt card verbatim, so it has to read as
      // part of the sentence "Animate my current flame: <wish>."
      expect(cinemaPromptCard(preset.wish)).toContain(preset.wish)
    }
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
