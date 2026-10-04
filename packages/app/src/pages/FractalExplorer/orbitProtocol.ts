/**
 * Messages between the explorer and its reference-orbit worker.
 *
 * The worker iterates in BigInt, which takes from microseconds (a shallow
 * view) to seconds (1e1000), so it lives off the main thread and a newer
 * request always supersedes an older one: the older one is answered with
 * `superseded` as soon as the worker notices, between two slices. A cancel
 * does the same to the latest request without sending a new one.
 */
import type { BlaLevel, ComplexString, FractalKind } from '@chaos-master/core'

/** Main thread to worker. */
export type OrbitCommand =
  | ({ readonly type: 'request' } & OrbitRequest)
  | { readonly type: 'cancel' }

export interface OrbitRequest {
  readonly id: number
  readonly kind: FractalKind
  /** Mandelbrot: the reference c. Julia: the reference starting point. */
  readonly reference: ComplexString
  readonly juliaC: ComplexString
  readonly bits: number
  readonly maxIterations: number
  /** log2 of the largest pixel offset the BLA tables must stay valid for. */
  readonly cMaxLog2: number
}

export interface GpuBla {
  readonly data: ArrayBuffer
  readonly levels: readonly BlaLevel[]
  readonly minLevel: number
  readonly start: number
  readonly entryCount: number
}

export interface GpuOrbit {
  /** Packed entries, 16 bytes each (`gpuPacking.ts`). */
  readonly data: ArrayBuffer
  readonly length: number
  readonly escaped: boolean
  readonly bla: GpuBla
}

export interface GpuOrbitSet {
  readonly main: GpuOrbit
  /** Julia only: the critical orbit a pixel rebases onto. */
  readonly critical?: GpuOrbit
}

export type OrbitResponse =
  | {
      readonly type: 'progress'
      readonly id: number
      readonly fraction: number
    }
  | {
      readonly type: 'done'
      readonly id: number
      readonly set: GpuOrbitSet
      readonly ms: number
    }
  | { readonly type: 'superseded'; readonly id: number }
  | { readonly type: 'error'; readonly id: number; readonly message: string }
