/**
 * The badge over the canvas while a partner gallery tile is hovered.
 *
 * The gallery serves five pickers, and the badge said "Blending with" for all
 * of them, over an Evolve or a Diff pick that previews nothing at all. Each
 * now says what it is doing, and the two that preview nothing say what a
 * click on the tile does.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { CanvasViewport } from './CanvasViewport'
import type { CanvasViewportProps } from './CanvasViewport'
import type { BlendIntent } from '@/hooks/useWorkspaceBlendPick'

// The canvas and the export tracker need WebGPU; the badges do not.
vi.mock('@/lib/AutoCanvas', () => ({ AutoCanvas: () => null }))
vi.mock('@/components/ExportJobs/ExportJobHost', () => ({
  ExportJobHost: () => null,
}))
vi.mock('@/components/ExportJobs/ExportJobTracker', () => ({
  ExportJobTracker: () => null,
}))
vi.mock('@/components/ProgressBar/ProgressBar', () => ({
  ProgressBar: () => null,
}))

function hover(intent: BlendIntent) {
  const props = {
    isMobile: () => false,
    showSidebar: () => true,
    onCanvasClick: () => {},
    onToggleMobileSidebar: () => {},
    flameDescriptor: examples.example1,
    effectiveFlame: () => examples.example1,
    hoveredVariationType: () => null,
    hoveredCustomVarDef: () => null,
    hoveredBlendName: () => 'Aurora',
    blendIntent: () => intent,
    // Read by the view framing (useViewFraming.ts) and the edge fade as the
    // viewport mounts.
    exportDimensions: () => undefined,
    onExportImage: () => undefined,
    theme: () => 'dark',
  }
  render(() => (
    <CanvasViewport {...(props as unknown as CanvasViewportProps)} />
  ))
}

afterEach(cleanup)

describe('the hovered partner badge', () => {
  it.each([
    { intent: 'blend', text: 'Blending with Aurora' },
    { intent: 'morph', text: 'Morphing into Aurora' },
    { intent: 'breed', text: 'Breeding with Aurora' },
    { intent: 'evolve', text: 'Evolve with Aurora' },
    { intent: 'diff', text: 'Compare with Aurora' },
  ] as const)('reads "$text" for $intent', ({ intent, text }) => {
    hover(intent)

    expect(screen.getByText(text)).toBeTruthy()
  })
})
