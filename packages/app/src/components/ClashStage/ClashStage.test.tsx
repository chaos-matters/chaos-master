/**
 * The stage hands the renderer its fight flame as built: never validated, so
 * the fields only a fight flame carries (each transform's team, the fight
 * uniforms) reach the renderer. Validation strips them from every other flame
 * (packages/core/src/schema/flameSchema.clash.test.ts); a stage that
 * validated its own flame would render the two fighters as one.
 */
import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clashFighter } from '@/flame/clash/fightFlame'
import { examples } from '@/flame/examples'
import { validateFlame } from '@/flame/schema/flameSchema'
import { ClashStage } from './ClashStage'
import type { ParentProps } from 'solid-js'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const rendered = vi.hoisted(() => ({ flames: [] as unknown[] }))

vi.mock('@/flame/Flam3', () => ({
  Flam3: (props: { flameDescriptor: unknown }) => {
    rendered.flames.push(props.flameDescriptor)
    return null
  },
}))
vi.mock('@/lib/AutoCanvas', () => ({
  AutoCanvas: (props: ParentProps) => <div>{props.children}</div>,
}))
vi.mock('@/lib/Camera3D', () => ({
  Default3DPreviewCamera: (props: ParentProps) => <>{props.children}</>,
}))
vi.mock('@/lib/CanvasContext', () => ({
  useCanvas: () => ({ canvasSize: () => ({ width: 1280, height: 720 }) }),
}))

afterEach(() => {
  cleanup()
  rendered.flames.length = 0
})

describe('ClashStage', () => {
  it('renders its fight flame unvalidated, teams and fight uniforms intact', () => {
    render(() => (
      <ClashStage
        a={clashFighter(examples.example37)}
        b={clashFighter(examples.goldenApollonianGasket)}
        winner="A"
        reducedMotion={false}
        renderScale={1}
        pointCountPerBatch={1000}
        onReducedMotionChange={() => {}}
      />
    ))
    expect(rendered.flames).toHaveLength(1)
    const flame = rendered.flames[0] as FlameDescriptor
    const teams = Object.values(flame.transforms).map((t) => t.team)
    expect(new Set(teams)).toEqual(new Set(['A', 'B']))
    expect(flame.renderSettings.clash).toBeDefined()
    // What validation would have left the renderer: one flame, no fight.
    const validated = validateFlame(structuredClone(flame))
    expect(Object.values(validated.transforms).map((t) => t.team)).toEqual(
      teams.map(() => undefined),
    )
    expect(validated.renderSettings.clash).toBeUndefined()
  })
})
