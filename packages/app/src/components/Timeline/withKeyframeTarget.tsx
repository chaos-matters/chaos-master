import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import type { JSX } from 'solid-js'

type KeyframeTargetWrapperProps = {
  parameterPath: string
  children: JSX.Element
  class?: string
}

export function WithKeyframeTarget(props: KeyframeTargetWrapperProps) {
  const { setTargetedParameter } = useKeyframeTarget()

  return (
    <span
      class={props.class}
      onClick={(e) => {
        e.stopPropagation()
        setTargetedParameter(props.parameterPath)
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
      style="cursor: pointer;"
    >
      {props.children}
    </span>
  )
}
