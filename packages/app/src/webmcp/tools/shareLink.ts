import { executeCommand } from '@/commands/registry'
import { decodeSharePayload } from '@/utils/jsonQueryParam'
import { encodeShareUrl } from '@/utils/shareLink'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import type { WebMcpTool } from '@/webmcp/types'

export const createShareLink: WebMcpTool = {
  name: 'create_share_link',
  description:
    'Generate a self-contained shareable URL for the current flame. The link encodes the full flame state into the URL query string, generates no server-side state, and never expires. Returns the full longUrl and the encoded base64 payload string.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'Workspace not ready. The flame editor has not finished loading.',
      }
    }

    try {
      const flame = ctx.flameDescriptor()
      const { longUrl, encoded } = await encodeShareUrl({ flame })
      return { longUrl, encoded }
    } catch (err) {
      return {
        error: `Failed to encode share URL: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}

export const loadShareLink: WebMcpTool = {
  name: 'load_share_link',
  description:
    'Load a flame from a share link payload. Provide the encoded string (the value after ?flame= in a share URL). The flame will be decoded, validated, and loaded into the workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      encoded: {
        type: 'string',
        description:
          'The encoded share payload string (from ?flame= parameter)',
      },
    },
    required: ['encoded'],
  },
  execute: async (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) {
      return {
        error:
          'Workspace not ready. The flame editor has not finished loading.',
      }
    }

    const encoded = (input as { encoded?: unknown })?.encoded
    if (typeof encoded !== 'string' || !encoded.trim()) {
      return {
        error: 'Invalid input: expected a non-empty string for "encoded".',
      }
    }

    try {
      const result = await decodeSharePayload(encoded.trim())
      executeCommand('flame.load', ctx, result.flame, 'WebMCP: Load Share Link')
      const transformCount = Object.keys(result.flame.transforms ?? {}).length
      return { success: true, transformCount }
    } catch (err) {
      return {
        error: `Failed to decode share link: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
