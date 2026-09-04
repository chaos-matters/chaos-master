import { describe, expect, it } from 'vitest'
import { duelPromptCard } from './topics'

describe('duelPromptCard in three dimensions', () => {
  it('explains the orbit whenever the duel is 3D, however it got there', () => {
    // Start from the flame the viewer has open and the dimension is that
    // flame's, which only the panel knows — the card has to be told.
    const current3D = duelPromptCard(120, 'current', 3)
    expect(current3D).toContain('camera3D.theta')
    expect(duelPromptCard(120, 'random-3d')).toContain('camera3D.theta')
    expect(duelPromptCard(120, 'current')).not.toContain('camera3D')
    expect(duelPromptCard(120, 'random-2d', 2)).not.toContain('camera3D')
  })

  it('describes a camera that works, and says what centre takes with it', () => {
    const card = duelPromptCard(120, 'random-3d')

    // Every camera.* command drives the orbit now, so the brief no longer
    // sends the agent to the render-setting path for all of it.
    expect(card).toContain('every camera.* command drives it')
    expect(card).not.toContain('do nothing in 3D')
    // Centre resets the angle too, which the next sentence tells it to set.
    expect(card).toContain('including the angle you are viewing from')
    // Pan moves x and y only; the depth is reachable, and named.
    expect(card).toContain('camera3D.target')
  })
})
