/**
 * Mock file for App integration tests.
 * This file provides mocks for all dependencies that cannot be safely tested in isolation.
 */

import { vi } from 'vitest'
import type { JSX } from 'solid-js'

// Mock KeyframeTargetContext
vi.mock('@/contexts/KeyframeTargetContext', () => ({
  KeyframeTargetProvider: ({ children }: { children: JSX.Element }) => children,
  useKeyframeTarget: () => null,
}))

// Mock other contexts if needed
vi.mock('@/contexts/ThemeContext', () => ({
  ThemeContextProvider: ({ children }: { children: JSX.Element }) => children,
  useTheme: () => 'light' as const,
}))

vi.mock('@/contexts/ChangeHistoryContext', () => ({
  ChangeHistoryProvider: ({ children }: { children: JSX.Element }) => children,
  useChangeHistory: () => ({
    history: () => [],
    push: () => {},
    startPreview: () => {},
    commit: () => {},
  }),
}))

vi.mock('@/lib/Root', () => ({
  Root: vi.fn(() => ({ device: null, root: null })),
}))

vi.mock('./lib/CameraContext', () => ({
  CameraContextProvider: ({ children }: { children: JSX.Element }) => children,
  useCamera: () => ({
    update: () => {},
    bindGroup: null,
    BindGroupLayout: null,
    wgsl: {
      worldToClip: () => ({ x: 0.5, y: 0.5 }),
      clipToWorld: () => ({ x: 0.5, y: 0.5 }),
      clipToPixels: () => ({ x: 0.5, y: 0.5 }),
      resolution: () => ({ x: 800, y: 600 }),
      pixelRatio: () => 1,
    },
    js: {
      worldToClip: (pos: { x: number; y: number }) => pos,
      clipToWorld: (pos: { x: number; y: number }) => pos,
    },
    zoom: () => 1,
    position: () => ({ x: 0, y: 0 }),
    setPosition: (_pos: { x: number; y: number }) => {},
  }),
}))

vi.mock('./lib/CanvasContext', () => ({
  CanvasContextProvider: ({ children }: { children: JSX.Element }) => children,
  useCanvas: () => ({
    canvas: document.createElement('canvas'),
    pixelRatio: () => 1,
    canvasSize: () => ({ width: 800, height: 600 }),
    context: null as unknown as GPUCanvasContext,
    canvasFormat: 'bgra8unorm' as const,
  }),
}))

vi.mock('./lib/RootContext', () => ({
  useRootContext: () => ({
    root: null,
    device: null,
  }),
}))

vi.mock('./flame/Flam3', () => ({
  Flam3: () => null, // CPU renderer mock
}))
