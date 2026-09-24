// A reload mid-session ends it cleanly: the agent is told, and does not edit the viewer's flame.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockCommandContext } from '@/webmcp/testUtils'
import type { CommandContext } from '@/commands/types'
import type { WebMcpTool } from '@/webmcp/types'

type McpResult = {
  content: { type: string; text: string }[]
  isError?: boolean
}

/** A fresh page: every module evaluated again, on whatever storage is global. */
async function loadPage(viewer: CommandContext) {
  vi.resetModules()
  const { wrapTool } = await import('./registerWebMcp')
  const { setWebMcpContext } = await import('./contextBridge')
  const tools = await import('./tools')
  const session = await import('@/arcade/interruptedSession')
  // The fresh page installs the viewer's own workspace, as MainWorkspace does.
  setWebMcpContext(viewer)
  const call = async (tool: WebMcpTool, args: unknown = {}) =>
    (await wrapTool(tool).execute(args, {})) as McpResult
  return { call, tools, session }
}

/**
 * A reload, as far as module state goes: the old document is unloaded (its
 * `pagehide`), every module is evaluated again, so the pilot and the duel
 * start idle, and `sessionStorage` is kept.
 */
async function reloadPage(viewer: CommandContext) {
  window.dispatchEvent(new Event('pagehide'))
  return await loadPage(viewer)
}

/** A copy of this tab's `sessionStorage`, as Duplicate Tab takes it. */
function snapshotStorage(): Map<string, string> {
  const copy = new Map<string, string>()
  const original = globalThis.sessionStorage
  for (let i = 0; i < original.length; i++) {
    const key = original.key(i)!
    copy.set(key, original.getItem(key)!)
  }
  return copy
}

/** Duplicate Tab: a second page on a copy of this tab's `sessionStorage`,
 *  while this page, and whatever session it runs, stays alive. */
async function duplicateTab(viewer: CommandContext) {
  return await loadPageOn(snapshotStorage(), viewer)
}

/** A new page whose `sessionStorage` starts from `copy`. */
async function loadPageOn(copy: Map<string, string>, viewer: CommandContext) {
  vi.stubGlobal('sessionStorage', {
    get length() {
      return copy.size
    },
    key: (i: number) => [...copy.keys()][i] ?? null,
    getItem: (k: string) => copy.get(k) ?? null,
    setItem: (k: string, v: string) => void copy.set(k, v),
    removeItem: (k: string) => void copy.delete(k),
    clear: () => {
      copy.clear()
    },
  })
  return await loadPage(viewer)
}

async function startAgentDuel(ctx: CommandContext) {
  const { setWebMcpContext } = await import('./contextBridge')
  const { beginDuel } = await import('@/arcade/duelActions')
  setWebMcpContext(ctx)
  const started = beginDuel(ctx, { seconds: 90, opponent: 'ai' })
  expect(started).toHaveProperty('ok', true)
}

// Every test evaluates the tool modules afresh, which is seconds under a busy
// full-suite run.
describe(
  'a reload in the middle of an Arcade session',
  { timeout: 30_000 },
  () => {
    afterEach(async () => {
      const { closeDuelView } = await import('@/arcade/duel')
      const { resetPilot } = await import('@/arcade/pilot')
      closeDuelView()
      resetPilot()
      vi.unstubAllGlobals()
      globalThis.sessionStorage.clear()
      window.dispatchEvent(new Event('pagehide'))
      vi.resetModules()
    })

    it("holds the agent's tools and says why, instead of acting on the viewer's flame", async () => {
      await startAgentDuel(createMockCommandContext())

      const viewer = createMockCommandContext()
      const { call, tools } = await reloadPage(viewer)

      const read = await call(tools.getFlame)
      expect(read.isError).toBe(true)
      expect(read.content[0]!.text).toMatch(/ended by a page reload/)
      expect(read.content[0]!.text).toMatch(/no Arcade session is active/)

      const before = JSON.stringify(viewer.flameDescriptor())
      const write = await call(tools.executeCommandTool, {
        commandId: 'flame.randomize',
      })
      expect(write.isError).toBe(true)
      expect(JSON.stringify(viewer.flameDescriptor())).toBe(before)

      const endDuel = await call(tools.arcadeEndDuel)
      expect(endDuel.content[0]!.text).toMatch(/no Arcade session is active/)
    })

    it('arcade_status reports the interrupted duel once, then the tools work again', async () => {
      await startAgentDuel(createMockCommandContext())
      const { call, tools } = await reloadPage(createMockCommandContext())

      const status = await call(tools.arcadeStatus)
      expect(status.isError).toBeUndefined()
      const body = JSON.parse(status.content[0]!.text) as {
        phase: string
        interrupted?: { mode: string; reason: string; message: string }
      }
      expect(body.phase).toBe('idle')
      expect(body.interrupted).toMatchObject({ mode: 'duel', reason: 'reload' })

      const again = JSON.parse(
        (await call(tools.arcadeStatus)).content[0]!.text,
      ) as { interrupted?: unknown }
      expect(again.interrupted).toBeUndefined()
      expect((await call(tools.getFlame)).isError).toBeUndefined()
    })

    it('lets the agent start a new duel straight away', async () => {
      await startAgentDuel(createMockCommandContext())
      const { call, tools } = await reloadPage(createMockCommandContext())

      const started = await call(tools.arcadeStartDuel, {
        durationSeconds: 60,
      })
      expect(started.isError).toBeUndefined()
      // The new session supersedes the interrupted one.
      expect((await call(tools.arcadeStatus)).content[0]!.text).not.toMatch(
        /interrupted/,
      )
    })

    it('leaves nothing behind when the session ends through the app', async () => {
      const ctx = createMockCommandContext()
      await startAgentDuel(ctx)
      const { finishDuel } = await import('@/arcade/duelActions')
      await finishDuel(ctx, 'stopped')

      const { call, tools } = await reloadPage(createMockCommandContext())
      expect((await call(tools.getFlame)).isError).toBeUndefined()
    })

    it('still holds the tools after the agent read arcade_status mid-session', async () => {
      const first = await loadPage(createMockCommandContext())
      await first.call(first.tools.arcadeStartDuel, { durationSeconds: 60 })
      // The agent reads the duel clock, which only arcade_status reports.
      const status = JSON.parse(
        (await first.call(first.tools.arcadeStatus)).content[0]!.text,
      ) as { phase: string }
      expect(status.phase).toBe('driving')

      const { call, tools } = await reloadPage(createMockCommandContext())
      const read = await call(tools.getFlame)
      expect(read.isError).toBe(true)
      expect(read.content[0]!.text).toMatch(/ended by a page reload/)
    })

    it('tells the viewer once, and keeps holding the agent until it acknowledges', async () => {
      await startAgentDuel(createMockCommandContext())

      const one = await reloadPage(createMockCommandContext())
      await one.session.interruptionChecked()
      expect(one.session.interruptionAnnouncement()).toMatch(
        /The reload ended the agent's duel/,
      )

      // A second reload, with no agent call in between.
      const two = await reloadPage(createMockCommandContext())
      await two.session.interruptionChecked()
      expect(two.session.interruptionAnnouncement()).toBeUndefined()
      expect((await two.call(two.tools.getFlame)).isError).toBe(true)
    })

    it('treats Duplicate Tab as a new page, not a reload, while the original tab plays on', async () => {
      const original = await loadPage(createMockCommandContext())
      await original.call(original.tools.arcadeStartDuel, {
        durationSeconds: 60,
      })

      const copy = await duplicateTab(createMockCommandContext())
      await copy.session.interruptionChecked()
      expect(copy.session.interruptionAnnouncement()).toBeUndefined()
      expect(copy.session.interruptedSession()).toBeUndefined()
      expect((await copy.call(copy.tools.getFlame)).isError).toBeUndefined()

      // The duplicate dropped its copy of the marker: reloading it later, when
      // the original's session may be long over, reports nothing.
      const again = await reloadPage(createMockCommandContext())
      await again.session.interruptionChecked()
      expect(again.session.interruptedSession()).toBeUndefined()
    })

    it('drops a copied marker without a notice when the original ended its session before the copy booted', async () => {
      const original = await loadPage(createMockCommandContext())
      await original.call(original.tools.arcadeStartDuel, {
        durationSeconds: 60,
      })
      // Duplicate Tab takes the copy of the storage first...
      const copyStorage = snapshotStorage()
      // ...and the original's duel ends through the app before the copy has
      // booted. The original still knows the marker was its own.
      original.session.markSessionClosed()
      const copy = await loadPageOn(copyStorage, createMockCommandContext())
      await copy.session.interruptionChecked()
      expect(copy.session.interruptionAnnouncement()).toBeUndefined()
      expect(copy.session.interruptedSession()).toBeUndefined()
      expect((await copy.call(copy.tools.getFlame)).isError).toBeUndefined()
    })

    it('boots where the BroadcastChannel constructor throws, and still tells a reload', async () => {
      // Firefox throws SecurityError here when storage access is denied.
      vi.stubGlobal(
        'BroadcastChannel',
        vi.fn(function throwsSecurityError() {
          throw new DOMException('The operation is insecure.', 'SecurityError')
        }),
      )
      const first = await loadPage(createMockCommandContext())
      await first.call(first.tools.arcadeStartDuel, { durationSeconds: 60 })

      const page = await reloadPage(createMockCommandContext())
      await page.session.interruptionChecked()
      expect(page.session.interruptedSession()).toMatchObject({ mode: 'duel' })
      expect((await page.call(page.tools.getFlame)).isError).toBe(true)
    })
  },
)
