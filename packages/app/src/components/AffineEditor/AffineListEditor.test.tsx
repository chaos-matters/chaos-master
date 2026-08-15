import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeContextProvider } from '@/contexts/ThemeContext'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { AffineListEditor } from './AffineListEditor'
import type { AffineParams } from '@/flame/affineTranform'

afterEach(cleanup)

describe('AffineListEditor semantic actions', () => {
  it('dispatches an exact scalar coefficient while keeping dice as a matrix edit', () => {
    const transforms = deepClone(examples.example1.transforms)
    const transformId = Object.keys(transforms)[0]!
    const setAffineCoefficient = vi.fn()
    const setTransformAffine =
      vi.fn<
        (
          tid: string,
          which: 'pre' | 'post',
          affine: AffineParams,
          origin?: 'grid' | 'randomize' | 'reset',
        ) => void
      >()

    render(() => (
      <ThemeContextProvider>
        <AffineListEditor
          transforms={transforms}
          setTransforms={vi.fn()}
          setTransformAffine={setTransformAffine}
          setAffineCoefficient={setAffineCoefficient}
          affineMode="preAffine"
        />
      </ThemeContextProvider>
    ))

    const coefficient = document.querySelector<HTMLElement>(
      `[data-parameter-path="transform.${transformId}.preAffine.a"]`,
    )!
    fireEvent.dblClick(coefficient)
    const input = screen.getByRole('textbox')
    fireEvent.input(input, { target: { value: '1.25' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(setAffineCoefficient).toHaveBeenCalledWith(
      transformId,
      'pre',
      'a',
      1.25,
    )
    expect(setTransformAffine).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByTitle('Randomize affine coefs')[0]!)
    expect(setTransformAffine).toHaveBeenCalledOnce()
    expect(setTransformAffine).toHaveBeenCalledWith(
      transformId,
      'pre',
      expect.objectContaining({ a: expect.any(Number) }),
      'randomize',
    )

    fireEvent.click(
      screen.getAllByTitle(
        'Reset affine to identity (no scale/rotation/offset)',
      )[0]!,
    )
    expect(setTransformAffine).toHaveBeenLastCalledWith(
      transformId,
      'pre',
      expect.objectContaining({ a: 1, b: 0 }),
      'reset',
    )
  })
})
