/**
 * Entry for `/clash`: the Flame Clash preview, with the standalone provider
 * stack and none of the editor.
 */
import { StandalonePage } from '@/components/StandalonePage/StandalonePage'
import { ClashPage } from './ClashPage'

export function ClashApp() {
  return (
    <StandalonePage>
      <ClashPage />
    </StandalonePage>
  )
}
