import { Checkbox } from '@/components/Checkbox/Checkbox'
import { keyframeOnRandomize, setKeyframeOnRandomize, } from '@/utils/randomizeKeyframes'
import ui from './KeyframeOnRandomizeToggle.module.css'

/**
 * Compact opt-in shown in the affine/color list editors: when on, the 🎲
 * randomize buttons add keyframes at the current frame for every value they
 * change. Backed by the shared keyframeOnRandomize signal.
 */
export function KeyframeOnRandomizeToggle() {
  return (
    <label
      class={ui.row}
      title="When on, a 🎲 randomize adds keyframes at the current frame for every value it changes — so a whole randomize lands on the timeline at once."
    >
      <Checkbox
        checked={keyframeOnRandomize()}
        onChange={(checked) => setKeyframeOnRandomize(checked)}
      />
      <span>Keyframe on randomize</span>
    </label>
  )
}
