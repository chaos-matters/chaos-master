import type { Accessor, Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'
import type { TimelineTrack } from '@/utils/timeline'

export interface CommandContext {
  flameDescriptor: Accessor<FlameDescriptor>
  setFlameDescriptor: HistorySetter<FlameDescriptor>
  blendFlame: Accessor<FlameDescriptor | undefined>
  setBlendFlame: Setter<FlameDescriptor | undefined>
  blendWeight: Accessor<number>
  setBlendWeight: Setter<number>
  pixelRatio: Accessor<number>
  setPixelRatio: Setter<number>
  zoom: Accessor<number>
  setZoom: Setter<number>
  position: Accessor<v2f>
  setPosition: Setter<v2f>
  sidebar: {
    open: Accessor<boolean>
    setOpen: Setter<boolean>
  }
  timeline: {
    tracks: Accessor<TimelineTrack[]>
    setTracks: Setter<TimelineTrack[]>
    animationEnabled: Accessor<boolean>
    setAnimationEnabled: Setter<boolean>
    duration: Accessor<number>
    setDuration: Setter<number>
    currentFrame: Accessor<number>
    setCurrentFrame: Setter<number>
    play: () => void
    setLoop: (loop: boolean) => void
    setFps: (fps: number) => void
    addKeyframe: (
      path: string,
      frame: number,
      value:
        | number
        | string
        | [number, number, number]
        | [number, number, number, number],
      easing?: string,
    ) => void
  }
  camera: {
    center: () => void
  }
  modal: {
    open: (name: string) => void
  }
}

export interface FlameCommand {
  id: string
  label: string
  description: string
  shortcut?: string
  execute: (ctx: CommandContext, ...args: unknown[]) => void
}
