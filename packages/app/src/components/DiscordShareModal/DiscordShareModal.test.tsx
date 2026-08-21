import { cleanup, fireEvent, render, screen, waitFor, } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiscordShareModal } from './DiscordShareModal'
import type { DiscordShareMeta } from './DiscordShareModal'
import type { DiscordShareResult } from '@/lib/communityShowcase'

vi.mock('@/utils/turnstile', () => ({
  TURNSTILE_SITE_KEY: undefined,
  loadTurnstile: vi.fn(() => Promise.resolve()),
}))

const shared: DiscordShareResult = {
  shared: true,
  showcaseRequested: false,
  showcaseQueued: false,
}

function renderModal(options: {
  eligible?: boolean
  onShare?: (meta: DiscordShareMeta) => Promise<DiscordShareResult | undefined>
}) {
  const respond = vi.fn()
  const onShare = vi.fn(options.onShare ?? (() => Promise.resolve(shared)))
  const result = render(() => (
    <DiscordShareModal
      previewUrl="data:image/png;base64,iVBORw0KGgo="
      respond={respond}
      initialMetadata={{ author: 'Ada Artist', name: 'First light' }}
      onShare={(meta) => onShare(meta)}
      showcaseEligible={options.eligible ?? true}
      showcaseUnavailableReason="Custom variations are not portable yet."
      onDownload={vi.fn()}
      onCopyLink={() => Promise.resolve(true)}
      discordUrl="https://discord.test/invite"
    />
  ))
  return { ...result, onShare, respond }
}

afterEach(() => {
  cleanup()
})

describe('Discord Home showcase consent', () => {
  it('is unchecked by default and leaves a normal Discord share private to Discord', async () => {
    const { onShare, unmount } = renderModal({})
    const consent = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /submit to the home showcase/i,
    })

    expect(consent.checked).toBe(false)
    expect(
      screen.getByText(/visitors can open and remix its editable source/i),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => {
      expect(onShare).toHaveBeenCalledWith(
        expect.objectContaining({ submitToShowcase: false }),
      )
    })
    unmount()
  })

  it('forwards explicit opt-in consent with the public author credit', async () => {
    const { onShare, unmount } = renderModal({})
    fireEvent.click(
      screen.getByRole('checkbox', { name: /submit to the home showcase/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => {
      expect(onShare).toHaveBeenCalledWith({
        author: 'Ada Artist',
        title: 'First light',
        submitToShowcase: true,
      })
    })
    unmount()
  })

  it('cannot opt an ineligible custom-variation flame into staging', async () => {
    const { onShare, unmount } = renderModal({ eligible: false })

    expect(
      screen.queryByRole('checkbox', { name: /submit to the home showcase/i }),
    ).toBeNull()
    expect(
      screen.getByText('Custom variations are not portable yet.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => {
      expect(onShare).toHaveBeenCalledWith(
        expect.objectContaining({ submitToShowcase: false }),
      )
    })
    unmount()
  })

  it('recovers to the manual fallback when asynchronous sharing rejects', async () => {
    const { unmount } = renderModal({
      onShare: () => Promise.reject(new Error('share link failed')),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(await screen.findByText("Couldn't post to Discord")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download image' })).toBeTruthy()
    unmount()
  })
})
