/**
 * Entry for `/explore`: the deep-zoom Mandelbrot and Julia explorer, with
 * the standalone provider stack and none of the editor.
 */
import { StandalonePage } from '@/components/StandalonePage/StandalonePage'
import { FractalExplorerPage } from './FractalExplorerPage'

export function FractalExplorerApp() {
  return (
    <StandalonePage>
      <FractalExplorerPage />
    </StandalonePage>
  )
}
