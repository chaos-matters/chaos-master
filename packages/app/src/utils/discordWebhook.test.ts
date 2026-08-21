import { afterEach, describe, expect, it, vi } from 'vitest'
import { example1 } from '@/flame/examples/example1'
import { SHOWCASE_CONSENT_VERSION } from '@/lib/communityShowcase'
import { sendFlameToDiscord } from './discordWebhook'
import type { CommunityShowcaseRequest } from '@/lib/communityShowcase'

const mocks = vi.hoisted(() => ({
  blobToBase64: vi.fn(() => Promise.resolve('encoded-png')),
  shareDiscord: vi.fn(),
}))

vi.mock('@/utils/apiClient', () => ({
  ShareApi: { shareDiscord: mocks.shareDiscord },
}))

vi.mock('@/utils/blob', () => ({
  blobToBase64: mocks.blobToBase64,
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('sendFlameToDiscord', () => {
  it('forwards the consented descriptor and reports a queued showcase', async () => {
    mocks.shareDiscord.mockResolvedValue({ ok: true, showcase: 'queued' })
    const showcase: CommunityShowcaseRequest = {
      consent: true,
      consentVersion: SHOWCASE_CONSENT_VERSION,
      flame: example1,
      shareUrl: 'https://lumenapeiron.com/?flame=abc',
    }

    await expect(
      sendFlameToDiscord(
        new Blob(['png']),
        {
          author: 'Ada Artist',
          title: 'First light',
          submitToShowcase: true,
        },
        'turnstile-token',
        showcase,
      ),
    ).resolves.toEqual({
      shared: true,
      showcaseRequested: true,
      showcaseQueued: true,
    })
    expect(mocks.shareDiscord).toHaveBeenCalledWith({
      image: 'encoded-png',
      author: 'Ada Artist',
      title: 'First light',
      token: 'turnstile-token',
      showcase,
    })
  })

  it('keeps ordinary success separate from transport failure', async () => {
    mocks.shareDiscord.mockResolvedValueOnce({
      ok: true,
      showcase: 'not-requested',
    })
    await expect(
      sendFlameToDiscord(
        new Blob(['png']),
        { author: 'Ada', title: '', submitToShowcase: false },
        '',
      ),
    ).resolves.toEqual({
      shared: true,
      showcaseRequested: false,
      showcaseQueued: false,
    })

    mocks.shareDiscord.mockResolvedValueOnce(null)
    await expect(
      sendFlameToDiscord(
        new Blob(['png']),
        { author: 'Ada', title: '', submitToShowcase: false },
        '',
      ),
    ).resolves.toBeUndefined()
  })
})
