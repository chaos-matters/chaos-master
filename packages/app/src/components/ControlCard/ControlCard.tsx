import { useGlassyLookFlag } from '@/contexts/GlassyLookContext'
import ui, { contentGlassy } from './ControlCard.module.css'
import type { ParentProps } from 'solid-js'

export function Card(props: ParentProps<{ class?: string }>) {
  const { glassyLook } = useGlassyLookFlag()
  return (
    <>
      {glassyLook() ? (
        <div class={ui.containerGlassy}>
          <div
            class={ui.content}
            classList={{ [props.class ?? '']: true, [contentGlassy]: true }}
          >
            {props.children}
          </div>
        </div>
      ) : (
        <div class={ui.content} classList={{ [props.class ?? '']: true }}>
          {props.children}
        </div>
      )}
    </>
  )
}
