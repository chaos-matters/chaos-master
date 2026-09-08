import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiGuideTab } from './ApiGuideTab'
import { CodeBlock } from './CodeBlock'
import { IfsGuideTab } from './IfsGuideTab'
import { ParametersOverview } from './ParametersOverview'
import { SelectedVariationPanel } from './SelectedVariationPanel'

vi.mock('./MathSvg', () => ({
  MathSvg: (props: { tex: string }) => (
    <div data-testid="math-svg">{props.tex}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CodeBlock', () => {
  it('renders code snippet with language tag and copies to clipboard on button click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    })

    const sampleCode = 'let r = length(pos);'
    const { unmount } = render(() => (
      <CodeBlock code={sampleCode} language="wgsl" />
    ))

    expect(screen.getByText('wgsl')).toBeTruthy()
    expect(screen.getByText(sampleCode)).toBeTruthy()

    const copyBtn = screen.getByRole('button', { name: /copy/i })
    expect(copyBtn).toBeTruthy()
    fireEvent.click(copyBtn)

    expect(writeTextMock).toHaveBeenCalledWith(sampleCode)
    expect(await screen.findByText('Copied')).toBeTruthy()
    unmount()
  })
})

describe('SelectedVariationPanel', () => {
  it('renders variation title, metadata badges, formula, and allows copying ID', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    })

    const { unmount } = render(() => (
      <SelectedVariationPanel type="linear" dims={2} />
    ))

    expect(
      screen.getByRole('heading', { level: 2, name: /linear/i }),
    ).toBeTruthy()
    expect(screen.getByText('2D')).toBeTruthy()

    const copyIdBtn = screen.getByTitle(/click to copy variation id/i)
    expect(copyIdBtn).toBeTruthy()
    fireEvent.click(copyIdBtn)
    expect(writeTextMock).toHaveBeenCalledWith('linear')

    // Switches between Formula and Shader Code
    const shaderBtn = screen.getByRole('button', { name: /shader code/i })
    fireEvent.click(shaderBtn)
    expect(screen.getByText('TypeGPU (TS)')).toBeTruthy()
    expect(screen.getByText('WGSL Shader')).toBeTruthy()

    unmount()
  })

  it('renders polite informational notice when no formula is documented', () => {
    const { unmount } = render(() => (
      <SelectedVariationPanel type="__undocumented_test_variation__" dims={2} />
    ))

    expect(screen.getByText('No Mathematical Formula Documented')).toBeTruthy()
    unmount()
  })
})

describe('ParametersOverview', () => {
  it('renders an empty notice card for variations without parameters', () => {
    // linear has no auxiliary parameters
    const { unmount } = render(() => <ParametersOverview type="linear" />)

    expect(screen.getByText('No Configurable Parameters')).toBeTruthy()
    expect(
      screen.getByText(/operates directly on coordinates without requiring/i),
    ).toBeTruthy()
    unmount()
  })

  it('renders a data table for variations with parameters', () => {
    // blobVar has parameters: high, low, waves
    const { unmount } = render(() => <ParametersOverview type="blobVar" />)

    expect(screen.getByText('Parameter')).toBeTruthy()
    expect(screen.getByText('Type')).toBeTruthy()
    expect(screen.getByText('Range')).toBeTruthy()
    expect(screen.getByText('Default')).toBeTruthy()
    expect(screen.getByText('high')).toBeTruthy()
    expect(screen.getByText('low')).toBeTruthy()
    expect(screen.getByText('waves')).toBeTruthy()
    unmount()
  })
})

describe('IfsGuideTab', () => {
  it('renders the 3 sequential pipeline transformation step cards', () => {
    const { unmount } = render(() => <IfsGuideTab />)

    expect(screen.getByText('Iterated Function Systems (IFS)')).toBeTruthy()
    expect(screen.getByText('Pre-Affine Transformation')).toBeTruthy()
    expect(screen.getByText('Variation Evaluation')).toBeTruthy()
    expect(screen.getByText('Post-Affine Transformation')).toBeTruthy()
    expect(screen.getByText('The Chaos Game & Density Estimation')).toBeTruthy()
    unmount()
  })
})

describe('ApiGuideTab', () => {
  it('renders environment bindings and built-in WGSL functions', () => {
    const { unmount } = render(() => <ApiGuideTab />)

    expect(screen.getByText('API & Custom Variations')).toBeTruthy()
    expect(screen.getByText('pos')).toBeTruthy()
    expect(screen.getByText('varInfo')).toBeTruthy()
    expect(screen.getByText('Trigonometric')).toBeTruthy()
    expect(screen.getByText('Hyperbolic')).toBeTruthy()
    expect(screen.getByText('Vector & Math Utilities')).toBeTruthy()
    unmount()
  })
})
