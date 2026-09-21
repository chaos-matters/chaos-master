import { describe, expect, it } from 'vitest'
import { autoFitDecision } from './autoFit'

/**
 * The rule the dope sheet follows when an animation arrives: fit it, then stay
 * out of the way. The cost of getting this wrong is small but constant — a
 * loaded sequence half off the panel, or a zoom the viewer set being snatched
 * back every time a keyframe moves the end frame.
 */

const inputs = (over: Partial<Parameters<typeof autoFitDecision>[0]> = {}) => ({
  loadRevision: 1,
  totalFrames: 360,
  userAdjusted: false,
  agentDriving: false,
  ...over,
})

describe('the dope sheet auto-fit rule', () => {
  it('does nothing on the first observation', () => {
    // The dope sheet already fits itself when the ruler gets its first real
    // width; firing here too would do it again with a stale container size.
    expect(autoFitDecision(inputs(), undefined)).toEqual({
      fit: false,
      resetUserAdjusted: false,
    })
  })

  it('fits when an animation is loaded', () => {
    expect(
      autoFitDecision(inputs({ loadRevision: 2 }), {
        loadRevision: 1,
        totalFrames: 90,
      }),
    ).toEqual({ fit: true, resetUserAdjusted: true })
  })

  it('fits a load even over a zoom the viewer set', () => {
    // A load is a new document. Whatever they had set was for the old one.
    expect(
      autoFitDecision(inputs({ loadRevision: 2, userAdjusted: true }), {
        loadRevision: 1,
        totalFrames: 90,
      }),
    ).toEqual({ fit: true, resetUserAdjusted: true })
  })

  it('re-fits a span change while the view is still the one it chose', () => {
    // `edit.load` writes the tracks and then the config, so the span usually
    // lands one tick after the load; without this the fit would size the
    // animation that was there before.
    expect(
      autoFitDecision(inputs({ totalFrames: 360 }), {
        loadRevision: 1,
        totalFrames: 90,
      }),
    ).toEqual({ fit: true, resetUserAdjusted: false })
  })

  it('leaves a span change alone once the viewer has zoomed', () => {
    expect(
      autoFitDecision(inputs({ totalFrames: 400, userAdjusted: true }), {
        loadRevision: 1,
        totalFrames: 360,
      }),
    ).toEqual({ fit: false, resetUserAdjusted: false })
  })

  it('still re-fits for a driving agent, which has no pointer', () => {
    expect(
      autoFitDecision(
        inputs({ totalFrames: 400, userAdjusted: true, agentDriving: true }),
        { loadRevision: 1, totalFrames: 360 },
      ),
    ).toEqual({ fit: true, resetUserAdjusted: false })
  })

  it('does nothing when neither the load nor the span moved', () => {
    expect(
      autoFitDecision(inputs(), { loadRevision: 1, totalFrames: 360 }),
    ).toEqual({ fit: false, resetUserAdjusted: false })
  })

  it('clears the viewer flag but fits nothing for an empty timeline', () => {
    expect(
      autoFitDecision(inputs({ loadRevision: 2, totalFrames: 0 }), {
        loadRevision: 1,
        totalFrames: 360,
      }),
    ).toEqual({ fit: false, resetUserAdjusted: true })
  })
})
