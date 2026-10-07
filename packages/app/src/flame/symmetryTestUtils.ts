/**
 * Shared world for the symmetry tests: one 2D and one 3D flame, the real
 * command registry over a workspace, both symmetry writers, the load path, and
 * the preAffine as the renderer applies it.
 *
 * A flame gets its symmetry transforms from one of two writers, in 2D or 3D:
 * `applySymmetryToFlame` (symmetry.ts, behind Flame Clash's C1-C8 buttons)
 * and the `flame.applySymmetry` command (the Symmetry card, and agents). A
 * flame that is saved and loaded again goes through `validateFlame`, which
 * promotes a 3D flame's 2D-layout affines to the 3D layout, so that is a third
 * source.
 */
import '@/commands/builtins'
import { executeCommand } from '@/commands/registry'
import { validateFlame } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { applySymmetryToFlame } from './symmetry'
import { extractFlameUniforms } from './transformFunction'
import { extractFlameUniforms3D } from './transformFunction3D'
import type { SymmetryType } from './symmetryDetection'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type Dims = 2 | 3
export type Source = 'symmetry.ts' | 'command' | 'command, reloaded'

export const SOURCES: Source[] = ['symmetry.ts', 'command', 'command, reloaded']
export const TYPES: SymmetryType[] = ['rotational', 'dihedral']

const base2D = validateFlame({
  renderSettings: { dimensions: 2, exposure: 0.25, skipIters: 20 },
  transforms: {
    t1: {
      probability: 1,
      color: { x: 0.2, y: 0 },
      colorSpeed: 0.4,
      visible: true,
      preAffine: { a: 0.5, b: 0, c: 0.1, d: 0, e: 0.5, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: { v1: { type: 'sphericalVar', weight: 1, visible: true } },
    },
  },
})

const base3D = validateFlame({
  renderSettings: { dimensions: 3, exposure: 0.25, skipIters: 20 },
  transforms: {
    t1: {
      probability: 1,
      color: { x: 0.2, y: 0 },
      colorSpeed: 0.4,
      visible: true,
      preAffine: {
        a: 0.5,
        b: 0,
        c: 0,
        d: 0.1,
        e: 0,
        f: 0.5,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 0.5,
        l: 0,
      },
      postAffine: {
        a: 1,
        b: 0,
        c: 0,
        d: 0,
        e: 0,
        f: 1,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 1,
        l: 0,
      },
      variations: { v1: { type: 'linear3D', weight: 1, visible: true } },
    },
  },
})

export const bases: Record<Dims, FlameDescriptor> = { 2: base2D, 3: base3D }

/** A workspace with the real command registry over one flame. */
export function workspace(initial: FlameDescriptor) {
  let flame = deepClone(initial)
  const setFlameDescriptor = ((
    updater: FlameDescriptor | ((draft: FlameDescriptor) => unknown),
  ) => {
    if (typeof updater === 'function') {
      const draft = deepClone(flame)
      const replacement = updater(draft)
      flame = (replacement ?? draft) as FlameDescriptor
    } else {
      flame = deepClone(updater)
    }
  }) as CommandContext['setFlameDescriptor']
  const ctx = {
    flameDescriptor: () => flame,
    setFlameDescriptor,
  } as unknown as CommandContext
  return { ctx, flame: () => flame }
}

export type Workspace = ReturnType<typeof workspace>

/** The `_sym__` transforms, as MainWorkspace's `symTransforms` selects them. */
export function symTransforms(flame: FlameDescriptor) {
  return Object.entries(flame.transforms)
    .filter(([tid]) => tid.startsWith('_sym__'))
    .map(([, t]) => t)
}

/** The `_sym__` transform ids, in the order they were written. */
export function symIds(flame: FlameDescriptor): string[] {
  return Object.keys(flame.transforms).filter((tid) => tid.startsWith('_sym__'))
}

/** MainWorkspace's `applySymmetry`, which the card calls. */
export function applySymmetry(
  ctx: CommandContext,
  n: number,
  type: SymmetryType,
  origin: 'add' | 'type' | 'folds',
) {
  executeCommand('flame.applySymmetry', ctx, n, type, undefined, origin)
}

/** A saved flame loaded again: JSON out, then the schema's own load path. */
export function reload(flame: FlameDescriptor): FlameDescriptor {
  return validateFlame(JSON.parse(JSON.stringify(flame)))
}

export function build(
  dims: Dims,
  type: SymmetryType,
  folds: number,
  source: Source,
): FlameDescriptor {
  if (source === 'symmetry.ts') {
    return applySymmetryToFlame(bases[dims], folds, type)
  }
  const ws = workspace(bases[dims])
  applySymmetry(ws.ctx, folds, type, 'add')
  return source === 'command' ? ws.flame() : reload(ws.flame())
}

/**
 * One transform's preAffine as the renderer applies it, as three rows
 * `[x y z translation]`. A 3D flame goes through `extractFlameUniforms3D`,
 * which reads either key layout; a 2D flame through `extractFlameUniforms`,
 * `x' = a x + b y + c`, `y' = d x + e y + f`.
 */
export function renderedPreAffine(
  flame: FlameDescriptor,
  tid: string,
): number[][] {
  if (flame.renderSettings.dimensions === 3) {
    const uniforms = extractFlameUniforms3D(flame) as Record<
      string,
      { preAffine: Record<string, number> }
    >
    const m = uniforms[`flame${tid}`]!.preAffine
    return [
      [m.a!, m.b!, m.c!, m.d!],
      [m.e!, m.f!, m.g!, m.h!],
      [m.i!, m.j!, m.k!, m.l!],
    ]
  }
  const uniforms = extractFlameUniforms(flame) as Record<
    string,
    { preAffine: Record<string, number> }
  >
  const m = uniforms[`flame${tid}`]!.preAffine
  return [
    [m.a!, m.b!, 0, m.c!],
    [m.d!, m.e!, 0, m.f!],
    [0, 0, 1, 0],
  ]
}

/** The determinant of a rendered preAffine's linear part. */
export function renderedDeterminant(rows: number[][]): number {
  const [[a, b, c], [e, f, g], [i, j, k]] = rows as [
    number[],
    number[],
    number[],
  ]
  return (
    a! * (f! * k! - g! * j!) -
    b! * (e! * k! - g! * i!) +
    c! * (e! * j! - f! * i!)
  )
}

/**
 * The `_sym__` transforms whose preAffine flips orientation as the renderer
 * applies it (a negative determinant): the mirrors, counted without the
 * detector.
 */
export function renderedMirrors(flame: FlameDescriptor): number {
  return symIds(flame).filter(
    (tid) => renderedDeterminant(renderedPreAffine(flame, tid)) < 0,
  ).length
}
