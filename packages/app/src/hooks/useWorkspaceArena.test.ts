/**
 * Who fights as player 1 when the Arena opens. Opened from the editor, the
 * editor's flame does, whatever an earlier clash left in the slot. Opened by
 * open_arena, the agent's fighter does: the tool sets both fighters and then
 * opens the Arena, and the open used to replace player 1 with the editor's
 * flame, so `autoStart` fought the wrong flame.
 *
 * The real hook, wired into a command context the way MainWorkspace wires it.
 */
import { createRoot, createSignal } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { openArena } from '@/webmcp/tools/openArena'
import { useWorkspaceArena } from './useWorkspaceArena'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

function namedFlame(name: string, exposure: number): FlameDescriptor {
  const flame = createTestFlame()
  flame.metadata = { ...flame.metadata, name }
  flame.renderSettings.exposure = exposure
  return flame
}

let dispose: (() => void) | undefined

/** The hook over an editor holding "Editor Flame", and a context on it. */
function mountArena() {
  return createRoot((d) => {
    dispose = d
    const [showSidebar, setShowSidebar] = createSignal(true)
    const [showTimeline, setShowTimeline] = createSignal(false)
    const arena = useWorkspaceArena({
      flameDescriptor: namedFlame('Editor Flame', 0.25),
      showSidebar,
      setShowSidebar,
      showTimeline,
      setShowTimeline,
    })
    const ctx = createMockCommandContext()
    ctx.arena = {
      ...ctx.arena!,
      open: arena.showArena,
      setOpen: arena.setShowArena,
      player1Stats: arena.arenaP1Stats,
      setPlayer1Stats: arena.setArenaP1Stats,
      player2Stats: arena.arenaP2Stats,
      setPlayer2Stats: arena.setArenaP2Stats,
    }
    setWebMcpContext(ctx)
    return { arena, ctx }
  })
}

const openWithAgentFighters = () =>
  openArena.execute(
    {
      player1Name: 'Agent Fighter',
      player1Stats: {},
      player1Flame: namedFlame('Agent Flame', 0.9),
      player2Name: 'Rival',
      player2Stats: {},
      player2Flame: namedFlame('Rival Flame', 0.4),
    },
    {},
  )

afterEach(() => {
  dispose?.()
  dispose = undefined
  clearWebMcpContext()
})

describe('useWorkspaceArena player 1', () => {
  it("keeps the agent's player 1 when open_arena opens the Arena", () => {
    const { arena } = mountArena()

    expect(openWithAgentFighters()).toEqual({
      success: true,
      message: 'Arena HUD opened.',
    })

    expect(arena.showArena()).toBe(true)
    expect(arena.arenaP1Stats()?.name).toBe('Agent Fighter')
    expect(arena.arenaP1Stats()?.flame?.renderSettings.exposure).toBe(0.9)
    expect(arena.arenaP2Stats()?.name).toBe('Rival')
  })

  it("seats the editor's flame when the editor opens the Arena", () => {
    const { arena } = mountArena()
    arena.setShowArena(true)
    expect(arena.arenaP1Stats()?.name).toBe('Editor Flame')

    // A fighter picked inside the Arena, then the Arena closed and opened
    // again from the editor: player 1 is the editor's flame once more.
    arena.setArenaP1Stats({ name: 'Picked Fighter', flame: createTestFlame() })
    arena.setShowArena(false)
    arena.setShowArena(true)

    expect(arena.arenaP1Stats()?.name).toBe('Editor Flame')
    expect(arena.arenaP1Stats()?.flame?.renderSettings.exposure).toBe(0.25)
  })

  it("goes back to the editor's flame on the next open after an agent's", () => {
    const { arena } = mountArena()
    openWithAgentFighters()
    arena.setShowArena(false)
    arena.setShowArena(true)

    expect(arena.arenaP1Stats()?.name).toBe('Editor Flame')
  })
})
