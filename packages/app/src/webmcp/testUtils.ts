/**
 * Shared Vitest fixtures for the WebMCP and Arcade suites.
 *
 * Lives beside the tools rather than inside one test file because every
 * arcade/tool suite needs the same minimal flame and the same fake
 * CommandContext. Keeping one copy means a seam added to `CommandContext`
 * is mocked once.
 */

import { vi } from 'vitest'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'

/** Minimal flame descriptor for testing. */
export function createTestFlame(): FlameDescriptor {
  return {
    transforms: {
      t1: {
        probability: 0.5,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0.5, y: 0.5 },
        colorSpeed: 0.4,
        visible: true,
        variations: {
          v1: { type: 'linear', weight: 1 },
        },
      },
      t2: {
        probability: 0.5,
        preAffine: { a: 0.5, b: 0.3, c: 0.1, d: -0.3, e: 0.5, f: 0.2 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0.8, y: 0.2 },
        colorSpeed: 0.6,
        visible: true,
        variations: {
          v2: { type: 'sinusoidal', weight: 0.7 },
        },
      },
    },
    renderSettings: {
      dimensions: 2,
      exposure: 0.25,
      skipIters: 20,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      vibrancy: 0.5,
      contrast: 1,
      gamma: 2.2,
      camera: { zoom: 1, position: [0, 0], rotation: 0 },
    },
    metadata: {
      name: 'Test Flame',
      author: 'test',
      description: 'A test flame',
    },
  } as unknown as FlameDescriptor
}

/**
 * Minimal CommandContext mock.
 * Only the fields that the Tier 1 tools actually use.
 */
export function createMockCommandContext(): CommandContext {
  let flame = createTestFlame()
  const undoStack: FlameDescriptor[] = []
  const redoStack: FlameDescriptor[] = []

  // Honours the real `HistorySetter` contract: the recipe receives a draft,
  // usually mutates it and returns nothing. The old mock passed the live
  // object straight in and assigned the return value, so every mutating
  // command left `flame` undefined.
  const setFlameDescriptor: HistorySetter<FlameDescriptor> = (fn) => {
    undoStack.push(flame)
    const draft = JSON.parse(JSON.stringify(flame)) as FlameDescriptor
    const result = fn(draft)
    flame = result ?? draft
    redoStack.length = 0
  }

  return {
    beforeCommand: vi.fn(),
    flameDescriptor: () => flame,
    setFlameDescriptor: vi.fn(setFlameDescriptor),
    zoom: () => 1,
    setZoom: vi.fn(),
    position: () =>
      ({
        x: 0,
        y: 0,
      }) as any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
    setPosition: vi.fn(),
    blendFlame: () => undefined,
    setBlendFlame: vi.fn(),
    blendWeight: () => 0,
    setBlendWeight: vi.fn(),
    pixelRatio: () => 1,
    setPixelRatio: vi.fn(),
    paletteRestoreColors: undefined,
    sidebar: {
      open: () => true,
      setOpen: vi.fn(),
    },
    arena: {
      open: () => false,
      setOpen: vi.fn(),
      player1Stats: () => null,
      setPlayer1Stats: vi.fn(),
      player2Stats: () => null,
      setPlayer2Stats: vi.fn(),
      selectFighter: vi.fn(),
    },
    director: {
      open: vi.fn(() => false),
      setOpen: vi.fn(),
      state: vi.fn(() => null),
      setState: vi.fn(),
      selectCandidate: vi.fn(),
    },
    camera: {
      center: vi.fn(),
    },
    modal: {
      open: vi.fn(),
    },
    timeline: {
      tracks: () => [],
      setTracks: vi.fn(),
      animationEnabled: () => false,
      setAnimationEnabled: vi.fn(),
      duration: () => 90,
      setDuration: vi.fn(),
      currentFrame: () => 0,
      setCurrentFrame: vi.fn(),
      timelineStore: {
        state: {} as unknown,
        set: vi.fn(),
      },
    } as unknown as CommandContext['timeline'],
    history: {
      undo: vi.fn(() => {
        const prev = undoStack.pop()
        if (prev) {
          redoStack.push(flame)
          flame = prev
        }
      }),
      redo: vi.fn(() => {
        const next = redoStack.pop()
        if (next) {
          undoStack.push(flame)
          flame = next
        }
      }),
      peekUndoTarget: () =>
        undoStack.length > 0
          ? { system: 'flame' as const, seq: undoStack.length }
          : undefined,
      peekRedoTarget: () =>
        redoStack.length > 0
          ? { system: 'flame' as const, seq: redoStack.length }
          : undefined,
    },
  }
}
