/**
 * The render card's three mode selects: draw mode, color init and point init.
 * Each used to apply its pick inside document.startViewTransition's callback,
 * which the browser runs only once it has rendered a frame. Measured in headed
 * Chrome during an export, the document still held the old mode after the
 * change event, and the recorded step landed a frame late, behind whatever
 * input came next. The stub never runs its callback, a renderer with no frame
 * yet; jsdom has none, and would test the other branch.
 */
import { fireEvent, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TimelineProvider } from '@/contexts/TimelineContext'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { RenderSettingsSection } from './RenderSettingsSection'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

function mountRenderSettings() {
  const benchmark = deepClone(examples.benchmark)
  const [flame, setFlame] = createStore<FlameDescriptor>({
    ...benchmark,
    renderSettings: {
      ...benchmark.renderSettings,
      drawMode: 'light',
      colorInitMode: 'colorInitZero',
      pointInitMode: 'pointInitCircle',
    },
  })
  const [renderCardOpen, setRenderCardOpen] = createSignal(true)
  const [metadataCardOpen, setMetadataCardOpen] = createSignal(false)
  const { container, unmount } = render(() => (
    <TimelineProvider>
      <RenderSettingsSection
        flameDescriptor={flame}
        renderCardOpen={renderCardOpen}
        setRenderCardOpen={setRenderCardOpen}
        metadataCardOpen={metadataCardOpen}
        setMetadataCardOpen={setMetadataCardOpen}
        setTargetedParameter={() => {}}
        setRenderSetting={(key, value) => {
          setFlame('renderSettings', (settings) => ({
            ...settings,
            [key]: value,
          }))
        }}
        setRenderSettings={() => {}}
        stochasticFilterEnabled={() => false}
        selectedPaletteId={() => ''}
        cmdContext={{} as CommandContext}
        executeCommand={() => undefined}
      />
    </TimelineProvider>
  ))
  return { flame, container, unmount }
}

describe('RenderSettingsSection mode selects while no frame has been drawn', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: () => ({ ready: Promise.resolve(), finished: Promise.resolve() }),
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  it.each([
    ['drawMode', 'paint'],
    ['colorInitMode', 'colorInitPosition'],
    ['pointInitMode', 'pointInitSquare'],
  ] as const)('%s takes %s at the change event', (key, mode) => {
    const { flame, container, unmount } = mountRenderSettings()
    const select = container.querySelector<HTMLSelectElement>(
      `[data-tour-target="${key}-select"] select`,
    )
    expect(select).not.toBeNull()

    select!.value = mode
    fireEvent.change(select!)
    expect(flame.renderSettings[key]).toBe(mode)
    unmount()
  })
})
