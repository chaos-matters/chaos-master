import { TabletInspectorDeck } from './TabletInspectorDeck'
import ui from './TouchSurface.module.css'
import type { TabletSplitLayoutProps } from './types'

export function TabletSplitLayout(props: TabletSplitLayoutProps) {
  return (
    <div class={ui.tabletLayout} role="main" aria-label="Tablet Split Studio">
      <div class={ui.tabletCanvasPane}>{props.children}</div>

      <TabletInspectorDeck
        ctx={props.ctx}
        flame={props.flame}
        onOpenDrawer={props.onOpenDrawer}
        onRandomize={props.onRandomize}
        onMutate={props.onMutate}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onSnapshot={props.onSnapshot}
        onPickGallery={props.onPickGallery}
      />
    </div>
  )
}
