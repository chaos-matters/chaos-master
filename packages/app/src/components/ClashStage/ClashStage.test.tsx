/**
 * The stage hands the renderer its fight flame as built: never validated, so
 * the fields only a fight flame carries (each transform's team, the fight
 * uniforms) reach the renderer. Validation strips them from every other flame
 * (packages/core/src/schema/flameSchema.clash.test.ts); a stage that
 * validated its own flame would render the two fighters as one.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clashFighter } from '@/flame/clash/fightFlame'
import { examples } from '@/flame/examples'
import { validateFlame } from '@/flame/schema/flameSchema'
import { declarationsFor, readCss } from '@/test/cssModule'
import { ClashStage } from './ClashStage'
import type { JSX, ParentProps } from 'solid-js'
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

describe('ClashStage layout', () => {
  const renderStage = (leading?: JSX.Element) =>
    render(() => (
      <ClashStage
        a={clashFighter(examples.example37)}
        b={clashFighter(examples.goldenApollonianGasket)}
        winner="A"
        reducedMotion={false}
        renderScale={1}
        pointCountPerBatch={1000}
        onReducedMotionChange={() => {}}
        onChangeFighters={() => {}}
        leading={leading}
      />
    ))

  // At 375 px the three controls wrap into two rows. A caption placed one
  // fixed row above the bottom then sat on the second row of buttons; in one
  // column with them it stays above however many rows there are.
  it('stacks the caption and the controls in one bottom column', () => {
    renderStage()
    const replay = screen.getByRole('button', { name: 'Replay' })
    const caption = document.querySelector('[data-beat]')
    const column = replay.parentElement?.parentElement
    expect(caption?.parentElement).toBe(column)
    expect(column?.querySelector('header')).toBeNull()
    expect(
      Array.from(column!.children).indexOf(caption as Element),
    ).toBeLessThan(Array.from(column!.children).indexOf(replay.parentElement!))

    const css = readCss('components/ClashStage/ClashStage.module.css')
    const rule = (selector: string) =>
      declarationsFor(css, selector, { topLevel: true })
    expect(rule('.bottom')).toMatch(/display:\s*flex;/)
    expect(rule('.bottom')).toMatch(/flex-direction:\s*column;/)
    expect(rule('.caption')).not.toMatch(/position:/)
    expect(rule('.controls')).not.toMatch(/position:/)
  })

  it('puts what the page leads with ahead of the title', () => {
    renderStage(<a href="#editor">Back</a>)
    const back = screen.getByRole('link', { name: 'Back' })
    const title = screen.getByText('Flame Clash', { exact: false })
    expect(back.nextElementSibling).toBe(title)
  })
})
