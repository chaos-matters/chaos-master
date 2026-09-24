import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { arenaCommentate } from './arenaCommentate'
import { arenaGetStats } from './arenaGetStats'
import { arenaStartClash } from './arenaStartClash'
import { simulateClash } from './simulateClash'
import type { WebMcpTool } from '@/webmcp/types'

const run = async (tool: WebMcpTool, input: unknown = {}) =>
  (await tool.execute(input, {})) as Record<string, unknown>

describe('arena WebMCP tools', () => {
  afterEach(() => {
    clearWebMcpContext()
  })

  describe('arena_get_stats', () => {
    it('refuses without workspace context when no flame provided', async () => {
      const res = await run(arenaGetStats)
      expect(res).toHaveProperty('error')
    })

    it('returns grounded stats for provided flame even without workspace context', async () => {
      const flame = createTestFlame()
      const res = await run(arenaGetStats, { flame })
      expect(res).not.toHaveProperty('error')
      expect(res).toHaveProperty('stats')
      expect(res).toHaveProperty('summary')
      const stats = res.stats as Record<string, unknown>
      expect(stats.school).toBeDefined()
      expect(stats.hp).toBeGreaterThan(0)
      expect(stats.atk).toBeGreaterThan(0)
    })

    it('evaluates current workspace flame when flame argument omitted', async () => {
      const ctx = createMockCommandContext()
      setWebMcpContext(ctx)

      const res = await run(arenaGetStats)
      expect(res).not.toHaveProperty('error')
      expect(res).toHaveProperty('stats')
      expect(res.summary).toContain('School')
    })
  })

  describe('arena_commentate', () => {
    it('refuses without workspace context', async () => {
      const res = await run(arenaCommentate, { text: 'Test commentary' })
      expect(res).toHaveProperty('error')
    })

    it('posts commentary and event to arena HUD context', async () => {
      const ctx = createMockCommandContext()
      setWebMcpContext(ctx)

      const res = await run(arenaCommentate, {
        text: 'Vortex Warrior unleashes a spiral cascade!',
        event: 'SPIRAL SURGE',
      })

      expect(res.ok).toBe(true)
      expect(ctx.arena?.setCommentary).toHaveBeenCalledWith(
        'Vortex Warrior unleashes a spiral cascade!',
      )
      expect(ctx.arena?.setEventBanner).toHaveBeenCalledWith('SPIRAL SURGE')
    })
  })

  describe('simulate_clash', () => {
    it('includes grounded combat resolution and battle log', async () => {
      const flameA = createTestFlame()
      const flameB = createTestFlame()

      const res = await run(simulateClash, {
        flameA,
        flameB,
        rounds: 3,
        stanceA: 'entropy',
        stanceB: 'bastion',
      })

      expect(res.winner).toBeDefined()
      expect(res.rounds).toBeDefined()
      expect(res.combat).toBeDefined()
      expect(res.battleLog).toBeDefined()
      expect(Array.isArray(res.battleLog)).toBe(true)
      expect((res.battleLog as string[]).length).toBeGreaterThan(3)
    })
  })

  describe('arena_start_clash', () => {
    it('refuses without workspace context', async () => {
      const res = await run(arenaStartClash)
      expect(res).toHaveProperty('error')
    })

    it('says a clash that ended without a verdict was cancelled, and why', async () => {
      const ctx = createMockCommandContext()
      ctx.arena!.startClash = () =>
        Promise.resolve({ cancelled: true, reason: 'The arena was closed.' })
      setWebMcpContext(ctx)

      const res = await run(arenaStartClash)

      expect(res).toMatchObject({ success: false, cancelled: true })
      expect(res.message).toMatch(/The arena was closed/)
    })

    it('opens arena and initiates animated clash in UI with mapped archetype stats', async () => {
      const ctx = createMockCommandContext()
      setWebMcpContext(ctx)

      const res = await run(arenaStartClash, {
        stance: 'resonance',
        opponentArchetype: 'symmetry_monolith',
        rounds: 3,
      })

      expect(res).not.toHaveProperty('error')
      expect(res.success).toBe(true)
      expect(ctx.arena?.setStance).toHaveBeenCalledWith('resonance')
      expect(ctx.arena?.setOpen).toHaveBeenCalledWith(true)
      expect(ctx.arena?.startClash).toHaveBeenCalled()
      expect(ctx.arena?.setPlayer2Stats).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Aethelgard Monolith',
          type: 'Symmetry Monolith',
        }),
      )
    })

    it('successfully handles all registered ARCHETYPE_IDS', async () => {
      const archetypes = [
        'chaos_lord',
        'symmetry_monolith',
        'spiral_leviathan',
        'quantum_siren',
        'solar_seraph',
        'void_stalker',
      ]

      for (const arch of archetypes) {
        const ctx = createMockCommandContext()
        setWebMcpContext(ctx)

        const res = await run(arenaStartClash, {
          opponentArchetype: arch,
        })
        expect(res).not.toHaveProperty('error')
        expect(res.success).toBe(true)
        expect(ctx.arena?.setPlayer2Stats).toHaveBeenCalled()
      }
    })
  })
})
