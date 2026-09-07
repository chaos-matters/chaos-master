import '@/commands/builtins'
import { describe, expect, it } from 'vitest'
import { getAllCommands } from '@/commands/registry'
import { ALWAYS_ALLOWED, ARENA_ARCHETYPES_LIST, ARENA_STANCES, arenaPromptCard, BEATS_ALLOWED, BEATS_PRESETS, BEATS_STEP_BUDGET, beatsPromptCard, CINEMA_ALLOWED, CINEMA_PRESETS, cinemaPromptCard, DIRECTOR_PRESETS, directorPromptCard, DUEL_ALLOWED, DUEL_STEP_BUDGET, duelPromptCard, isTopicId, LESSON_TOPICS, teachPromptCard, TOPIC_IDS, WEBMCP_FALLBACK_NOTE, } from './topics'

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

  // Every step the pilot takes is shown twice — in the live rail while the agent
  // drives, and in the replay step list afterwards — and both read the same
  // `describe`. A command without one falls back to its label plus raw JSON
  // (`Toggle Sidebar [true]`), which is what the viewer is left staring at.
  it('only allows commands that can describe themselves', () => {
    const commands = getAllCommands()
    const allowLists = [
      ...TOPIC_IDS.map((id) => LESSON_TOPICS[id].allowed),
      CINEMA_ALLOWED,
      // Every session gets these on top of its topic list, so a command that
      // is always allowed is exactly the one a viewer sees most often.
      ALWAYS_ALLOWED,
    ]
    const rawJson = new Set<string>()
    for (const allowed of allowLists) {
      for (const entry of allowed) {
        const matched = entry.endsWith('.')
          ? commands.filter((command) => command.id.startsWith(entry))
          : commands.filter((command) => command.id === entry)
        for (const command of matched) {
          if (command.describe === undefined) rawJson.add(command.id)
        }
      }
    }
    expect([...rawJson].sort()).toEqual([])
  })

  // A command that toggles when its argument is missing must not claim a
  // direction it did not take, and one that no-ops must claim nothing.
  it('does not invent a direction for a missing boolean', () => {
    const describeOf = (id: string, args: unknown[]) =>
      getAllCommands()
        .find((command) => command.id === id)
        ?.describe?.(args)
    expect(describeOf('timeline.setAnimationEnabled', [true])).toBe(
      'Enable animation',
    )
    expect(describeOf('timeline.setAnimationEnabled', [])).toBe(
      'Toggle animation',
    )
    expect(describeOf('sidebar.open', [])).toBe('Toggle the sidebar')
    expect(describeOf('timeline.setLoop', [])).toBeUndefined()
    expect(describeOf('view.setShowTimeline', [])).toBeUndefined()
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

describe('duel', () => {
  it('lets a duel edit the flame and the camera, and nothing else', () => {
    expect(DUEL_ALLOWED).toContain('flame.')
    expect(DUEL_ALLOWED).toContain('camera.')
    expect(DUEL_ALLOWED).not.toContain('timeline.')
    expect(DUEL_ALLOWED).not.toContain('view.')
    expect(DUEL_STEP_BUDGET).toBeGreaterThan(20)
  })

  it('gives the duel prompt card the clock and the tools', () => {
    const card = duelPromptCard(180)
    expect(card).toContain('arcade_start_duel')
    expect(card).toContain('arcade_duel_ready')
    expect(card).not.toContain('arcade_end_duel')
    expect(card).toContain('3 minutes')
    expect(card).toContain(WEBMCP_FALLBACK_NOTE)
  })
})

describe('beats', () => {
  it('allows audio wiring and sonification commands in beats mode', () => {
    expect(BEATS_ALLOWED).toContain('audio.applySnapshot')
    expect(BEATS_ALLOWED).toContain('audio.setMapping')
    expect(BEATS_ALLOWED).toContain('sonification.setConfig')
    expect(BEATS_STEP_BUDGET).toBeGreaterThanOrEqual(20)
  })

  it('offers beats presets that provide distinct musical goals', () => {
    expect(BEATS_PRESETS.length).toBeGreaterThanOrEqual(3)
    for (const preset of BEATS_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(3)
      expect(preset.wish.length).toBeGreaterThan(20)
    }
  })

  it('beats prompt card includes track name and beats tools', () => {
    const card = beatsPromptCard('Cyber Pulse', 'Map bass to scale')
    expect(card).toContain('Cyber Pulse')
    expect(card).toContain('Map bass to scale')
    expect(card).toContain('arcade_start_beats')
    expect(card).toContain('arcade_get_audio_catalog')
    expect(card).toContain('arcade_set_audio_mapping')
    expect(card).toContain('arcade_end_beats')
    expect(card).toContain(WEBMCP_FALLBACK_NOTE)
  })
})

describe('director', () => {
  it('offers director presets with distinct aesthetic goals', () => {
    expect(DIRECTOR_PRESETS.length).toBeGreaterThanOrEqual(3)
    for (const preset of DIRECTOR_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(3)
      expect(preset.wish.length).toBeGreaterThan(20)
    }
  })

  it('director prompt card mentions taste profile and propose/feedback loop', () => {
    const card = directorPromptCard('Explore organic bioluminescence')
    expect(card).toContain('Explore organic bioluminescence')
    expect(card).toContain('director_get_taste_profile')
    expect(card).toContain('director_propose')
    expect(card).toContain('director_get_feedback')
    expect(card).toContain(WEBMCP_FALLBACK_NOTE)
  })
})

describe('arena', () => {
  it('offers arena stances with distinct bonuses and descriptions', () => {
    expect(ARENA_STANCES.length).toBe(4)
    for (const stance of ARENA_STANCES) {
      expect(stance.label.length).toBeGreaterThan(3)
      expect(stance.bonus.length).toBeGreaterThan(2)
      expect(stance.description.length).toBeGreaterThan(15)
    }
  })

  it('offers 6 procedural challenger archetypes with schools', () => {
    expect(ARENA_ARCHETYPES_LIST.length).toBe(6)
    for (const arch of ARENA_ARCHETYPES_LIST) {
      expect(arch.name.length).toBeGreaterThan(3)
      expect(arch.className.length).toBeGreaterThan(3)
      expect(arch.school.length).toBeGreaterThan(2)
    }
  })

  it('arena prompt card incorporates opponent, stance, and arena tools', () => {
    const card = arenaPromptCard(
      'Spiral Leviathan',
      'resonance',
      'Focus on high energy',
    )
    expect(card).toContain('Spiral Leviathan')
    expect(card).toContain('resonance')
    expect(card).toContain('Focus on high energy')
    expect(card).toContain('arena_get_stats')
    expect(card).toContain('arena_commentate')
    expect(card).toContain('simulate_clash')
    expect(card).toContain('arena_start_clash')
    expect(card).toContain(WEBMCP_FALLBACK_NOTE)
  })
})
