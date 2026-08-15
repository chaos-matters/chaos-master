import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeContextProvider } from '@/contexts/ThemeContext'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { ColorListEditor } from './ColorListEditor'
import type { ColorEditOrigin } from './FlameColorEditor'
import type { TransformId } from '@/flame/schema/flameSchema'

afterEach(cleanup)

describe('ColorListEditor semantic actions', () => {
  it('identifies component, randomize, and reset origins', () => {
    const transforms = deepClone(examples.example1.transforms)
    const transformId = Object.keys(transforms)[0]! as TransformId
    const setTransformColor =
      vi.fn<
        (tid: string, x: number, y: number, origin?: ColorEditOrigin) => void
      >()

    render(() => (
      <ThemeContextProvider>
        <ColorListEditor
          transforms={transforms}
          setTransforms={vi.fn()}
          setTransformColor={setTransformColor}
        />
      </ThemeContextProvider>
    ))

    const component = document.querySelector<HTMLElement>(
      `[data-parameter-path="transform.${transformId}.color.x"]`,
    )!
    fireEvent.dblClick(component)
    const input = screen.getByRole('textbox')
    fireEvent.input(input, { target: { value: '0.125' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(setTransformColor).toHaveBeenLastCalledWith(
      transformId,
      0.125,
      transforms[transformId]!.color.y,
      'x',
    )

    fireEvent.click(screen.getAllByTitle('Randomize color')[0]!)
    expect(setTransformColor).toHaveBeenLastCalledWith(
      transformId,
      expect.any(Number),
      expect.any(Number),
      'randomize',
    )

    fireEvent.click(screen.getAllByTitle('Reset color to neutral (0, 0)')[0]!)
    expect(setTransformColor).toHaveBeenLastCalledWith(
      transformId,
      0,
      0,
      'reset',
    )
  })
})
