// A GPU failure in a duel seat ends the duel and leaves the viewer's editor and the agent's tools standing.
import { cleanup, render, screen } from '@solidjs/testing-library'
import { createEffect, createSignal, ErrorBoundary } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { duel, duelActive, duelRivalSeat, stopDuel } from '@/arcade/duel'
import { beginDuel } from '@/arcade/duelActions'
import { acknowledgeInterruption, interruptionAnnouncement, } from '@/arcade/interruptedSession'
import { pilot, resetPilot } from '@/arcade/pilot'
import { anySessionRecording, recorderStream } from '@/recorder/recorder'
import { clearWebMcpContext, getWebMcpTarget, setWebMcpContext, } from '@/webmcp/contextBridge'
import { wrapTool } from '@/webmcp/registerWebMcp'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { arcadeStatus } from '@/webmcp/tools/arcadeTeach'
import { getFlame } from '@/webmcp/tools/getFlame'
import { DuelStage } from './DuelStage'
import type { ParentProps } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { WebMcpTool } from '@/webmcp/types'

/*
 * The seat's real component tree down to `Flam3`, with the GPU taken out: the
 * canvas and cameras pass their children through, and `Flam3` fails the way
 * a GPU out of memory made it fail — a `RangeError` from a buffer write in a
 * render effect — but only for the flame `failing` names.
 */
let failing: () => FlameDescriptor | undefined = () => undefined

vi.mock('@/lib/AutoCanvas', () => ({
  AutoCanvas: (props: ParentProps) => <div>{props.children}</div>,
}))
vi.mock('@/lib/WheelZoomCamera2D', () => ({
  WheelZoomCamera2D: (props: ParentProps) => <>{props.children}</>,
}))
vi.mock('@/lib/WheelZoomCamera3D', () => ({
  WheelZoomCamera3D: (props: ParentProps) => <>{props.children}</>,
}))
vi.mock('@/flame/Flam3', () => ({
  Flam3: (props: { flameDescriptor: FlameDescriptor }) => {
    createEffect(() => {
      if (props.flameDescriptor === failing()) {
        throw new RangeError(
          "Failed to execute 'createBuffer' on 'GPUDevice': createBuffer failed, size (4) is too large for the implementation when mappedAtCreation == true",
        )
      }
    })
    return <span data-testid="flam3" />
  },
}))

type Envelope = { content: { text: string }[]; isError?: boolean }

const text = (result: Envelope) =>
  result.content.map((part) => part.text).join('\n')

/** A tool call as the agent makes it, through the wrapper every tool shares. */
const call = async (tool: WebMcpTool) =>
  (await wrapTool(tool).execute({}, {})) as Envelope

describe('a duel seat that cannot render', () => {
  afterEach(() => {
    cleanup()
    if (duelActive()) stopDuel()
    acknowledgeInterruption()
    resetPilot()
    clearWebMcpContext('player')
    clearWebMcpContext('rival')
    recorderStream('player').cancel()
    recorderStream('rival').cancel()
    vi.restoreAllMocks()
  })

  it.each(['rival', 'player'] as const)(
    'in the %s seat ends the duel and tells both sides, and the editor and its tools stay up',
    async (side) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const ctx = createMockCommandContext()
      failing = () =>
        side === 'rival' ? duelRivalSeat()?.flame() : ctx.flameDescriptor()
      // What `useWorkspaceCommands` registers for the workspace's own seat.
      setWebMcpContext(ctx, 'player')
      const started = beginDuel(ctx, { seconds: 60, opponent: 'ai' })
      expect(started).toHaveProperty('ok', true)
      expect(getWebMcpTarget()).toBe('rival')

      // The app's own boundary around the workspace: reaching it is the crash.
      render(() => (
        <ErrorBoundary fallback={<p>Something went wrong</p>}>
          <main data-testid="editor" />
          <DuelStage
            ctx={ctx}
            playerFlame={ctx.flameDescriptor}
            playerZoom={createSignal(1)}
            playerPosition={createSignal({ x: 0, y: 0 } as unknown as v2f)}
            playerCamera3D={{} as never}
            quality={1}
            adaptiveFilter={false}
            stochasticFilter={false}
            sidebarWidthRem={() => 0}
          />
        </ErrorBoundary>
      ))
      await vi.waitFor(() => {
        expect(duel().phase).toBe('idle')
      })

      // The editor is intact.
      expect(screen.queryByText('Something went wrong')).toBeNull()
      expect(screen.getByTestId('editor')).toBeTruthy()

      // The duel ended as an error, with the recorder stopped and the stage down.
      const ended = pilot()
      expect(ended.phase).toBe('ended')
      expect(ended.phase === 'ended' && ended.reason).toBe('error')
      expect(anySessionRecording()).toBe(false)
      expect(screen.queryByLabelText('Duel')).toBeNull()

      // The viewer is told.
      expect(interruptionAnnouncement()).toMatch(/GPU/)

      // The agent is told before anything acts on the viewer's flame...
      const held = await call(getFlame)
      expect(held.isError).toBe(true)
      expect(text(held)).toMatch(/GPU/)
      const status = await call(arcadeStatus)
      const report = JSON.parse(text(status)) as {
        phase: string
        lastEnd?: { reason: string }
        interrupted?: { reason: string; message: string }
      }
      expect(report.phase).toBe('ended')
      expect(report.lastEnd?.reason).toBe('error')
      expect(report.interrupted?.reason).toBe('render')
      expect(report.interrupted?.message).toMatch(/GPU/)

      // ...and once it has read that, get_flame answers from the player's seat.
      expect(getWebMcpTarget()).toBe('player')
      const flame = await call(getFlame)
      expect(flame.isError).toBeUndefined()
      expect(JSON.parse(text(flame))).toHaveProperty('transformCount')
    },
  )
})
