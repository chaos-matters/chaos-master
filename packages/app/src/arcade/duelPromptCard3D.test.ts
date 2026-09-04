import { describe, expect, it } from 'vitest'
import { duelPromptCard } from './topics'

describe('duelPromptCard in three dimensions', () => {
  it('explains the orbit whenever the duel is 3D, however it got there', () => {
    const current3D = duelPromptCard(120, 'current', 3)
    expect(current3D).toContain('camera3D.theta')
    // The one camera command that now works in 3D, named as such.
    // Every camera command drives the orbit now, so the brief says so
    // rather than sending the agent to the render-setting path for all of it.
    expect(current3D).toContain('every camera.* command drives it')
    expect(current3D).toContain('camera3D.theta')
    expect(current3D).not.toContain('do nothing in 3D')

    expect(duelPromptCard(120, 'random-3d')).toContain('camera3D.theta')
    expect(duelPromptCard(120, 'current')).not.toContain('camera3D')
    expect(duelPromptCard(120, 'random-2d', 2)).not.toContain('camera3D')
  })
})
