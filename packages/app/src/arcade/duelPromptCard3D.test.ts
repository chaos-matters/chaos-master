import { describe, expect, it } from 'vitest'
import { duelPromptCard } from './topics'

describe('duelPromptCard in three dimensions', () => {
  it('explains the orbit whenever the duel is 3D, however it got there', () => {
    const current3D = duelPromptCard(120, 'current', 3)
    expect(current3D).toContain('camera3D.theta')
    // The one camera command that now works in 3D, named as such.
    expect(current3D).toContain('camera.center recentres the orbit')
    expect(current3D).not.toContain('does nothing useful')

    expect(duelPromptCard(120, 'random-3d')).toContain('camera3D.theta')
    expect(duelPromptCard(120, 'current')).not.toContain('camera3D')
    expect(duelPromptCard(120, 'random-2d', 2)).not.toContain('camera3D')
  })
})
