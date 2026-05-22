import { createContext } from 'solid-js'
import { createTimelineState } from '@/utils/timeline'
import { useContextSafe } from '@/utils/useContextSafe'
import type { JSX } from 'solid-js'

export type TimelineState = ReturnType<typeof createTimelineState>

export const TimelineContext = createContext<TimelineState | null>(null)

export const TimelineContextProvider = TimelineContext.Provider

export function useTimeline() {
  return useContextSafe(
    TimelineContext,
    'useTimeline',
    'TimelineContextProvider',
  )
}

export function TimelineProvider(props: { children: JSX.Element }) {
  const timeline = createTimelineState()
  return (
    <TimelineContext.Provider value={timeline}>
      {props.children}
    </TimelineContext.Provider>
  )
}
