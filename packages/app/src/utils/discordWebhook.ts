import type { DiscordShareMeta } from '@/components/DiscordShareModal/DiscordShareModal'

const DISCORD_WEBHOOK_URL =
  'https://discord.com/api/webhooks/1509615038250614906/IyaS5WUbzDGqpc15lCLR8XvpVGIIBOGCtEinQqQaZiFwscrB6emZn0QkLdl4bI0lD4g3'

/**
 * Build the message text shown above the image in Discord.
 * Format: **Title** -- by author   (or just: by author)
 */
function buildContent(meta: DiscordShareMeta): string {
  const parts: string[] = []
  if (meta.title) {
    parts.push(`**${meta.title}**`)
  }
  parts.push(`by ${meta.author}`)
  return parts.join(' -- ')
}

/**
 * Send a PNG blob to the Discord channel via webhook as a plain message
 * with an attached image. No embed is used so the image renders full-width
 * with no accent border.
 * Returns `true` on success, `false` on failure.
 */
export async function sendFlameToDiscord(
  blob: Blob,
  meta: DiscordShareMeta,
): Promise<boolean> {
  const form = new FormData()
  form.append('file', blob, 'flame.png')
  form.append(
    'payload_json',
    JSON.stringify({
      content: buildContent(meta),
    }),
  )

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      body: form,
    })
    return res.ok
  } catch {
    return false
  }
}
