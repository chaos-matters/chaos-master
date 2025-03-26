import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'

const CanvasContext = createContext<{
  canvas: HTMLCanvasElement
  pixelRatio: () => number
  canvasSize: () => { width: number; height: number }
  context: GPUCanvasContext
  canvasFormat: GPUTextureFormat
}>()

export const CanvasContextProvider = CanvasContext.Provider

export function useCanvas() {
  return useContextSafe(CanvasContext, 'useCanvas', 'CanvasContext')
}
