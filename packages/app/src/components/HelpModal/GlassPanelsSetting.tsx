/**
 * The Glass panels row in Settings (lib/glass.ts): on by default, and the
 * one place a user turns the glass off, on every layout. Settings opens from
 * More ("Settings and more") and the tablet's rail on the touch layouts, and
 * from the version menu's "Settings and More" on the desktop.
 *
 * The box shows the stored choice. While the system asks for reduced
 * transparency or more contrast the panels stay solid whatever it says
 * (glassAllowed), and the hint says so, so a box that is on over solid
 * panels does not read as broken.
 */
import { Show } from 'solid-js'
import { glassAllowed, glassPanels, setGlassPanels } from '@/lib/glass'
import { Checkbox } from '../Checkbox/Checkbox'
import own from './GlassPanelsSetting.module.css'
import ui from './HelpModal.module.css'

const LABEL = 'Glass panels'

export function GlassPanelsSetting() {
  return (
    <label class={ui.pickerModeRow}>
      <span class={own.text}>
        <span class={ui.pickerModeLabel}>{LABEL}</span>
        <span class={own.hint}>
          <Show
            when={glassPanels() && !glassAllowed()}
            fallback="Frosted glass over the artwork. Turn it off if the frame rate drops."
          >
            Solid while your system asks for reduced transparency or more
            contrast.
          </Show>
        </span>
      </span>
      <Checkbox
        aria-label={LABEL}
        checked={glassPanels()}
        onChange={(checked) => {
          setGlassPanels(checked)
        }}
      />
    </label>
  )
}
