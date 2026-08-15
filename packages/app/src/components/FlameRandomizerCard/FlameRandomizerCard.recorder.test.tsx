import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { FlameRandomizerCard } from './FlameRandomizerCard'
import type { FlameRandomizerCardProps } from './FlameRandomizerCard'
import type { RandomizerHistoryEntry } from '@/utils/randomizerHistoryDB'

function renderCard(
  overrides: Partial<FlameRandomizerCardProps> = {},
): FlameRandomizerCardProps {
  const props: FlameRandomizerCardProps = {
    flame: deepClone(examples.example1),
    historyEntries: [],
    selectedTimestamp: 0,
    onGenerateFlame: vi.fn(),
    onMutateFlame: vi.fn(),
    onLoadHistory: vi.fn(),
    onClearHistory: vi.fn(),
    onRandomizeAnimation: vi.fn(),
    onSmartAnimation: vi.fn(),
    onUpdateRenderSettings: vi.fn(),
    onApplyCandidate: vi.fn(),
    open: true,
    ...overrides,
  }
  render(() => <FlameRandomizerCard {...props} />)
  return props
}

function clickTarget(target: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-tour-target="${target}"]`,
  )
  expect(button).not.toBeNull()
  fireEvent.click(button!)
}

describe('randomizer UI recorder boundary', () => {
  afterEach(cleanup)

  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('keeps all four generator controls wired to workspace-owned actions', () => {
    const props = renderCard()

    clickTarget('randomizer-generate')
    clickTarget('randomizer-mutate')
    clickTarget('random-animation')
    clickTarget('smart-animation')

    expect(props.onGenerateFlame).toHaveBeenCalledOnce()
    expect(props.onMutateFlame).toHaveBeenCalledOnce()
    expect(props.onRandomizeAnimation).toHaveBeenCalledWith(
      ['pan', 'zoom', 'color'],
      true,
    )
    expect(props.onSmartAnimation).toHaveBeenCalledWith(true)
  })

  it('routes a visible history result through the dedicated load callback', () => {
    const entry: RandomizerHistoryEntry = {
      flame: deepClone(examples.example2),
      thumbnail: 'data:image/png;base64,AA==',
      timestamp: 42,
    }
    const props = renderCard({ historyEntries: [entry] })

    const button = document.querySelector<HTMLButtonElement>(
      'button[title="Load flame state"]',
    )
    expect(button).not.toBeNull()
    fireEvent.click(button!)

    expect(props.onLoadHistory).toHaveBeenCalledOnce()
    expect(props.onLoadHistory).toHaveBeenCalledWith(entry)
  })

  it('routes an expanded render-setting slider through the workspace callback', () => {
    const props = renderCard()
    const header = [
      ...document.querySelectorAll<HTMLButtonElement>('button'),
    ].find((button) => button.textContent?.includes('Render Settings'))
    expect(header).toBeDefined()

    fireEvent.click(header!)
    const slider = header!.parentElement?.querySelector<HTMLInputElement>(
      'input[type="range"]',
    )
    expect(slider).not.toBeNull()
    slider!.value = '12'
    fireEvent.input(slider!)

    expect(props.onUpdateRenderSettings).toHaveBeenCalledWith({ skipIters: 12 })
  })
})
