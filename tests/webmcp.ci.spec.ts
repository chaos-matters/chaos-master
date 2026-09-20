import { dismissWelcomeIfPresent, expect, test } from './helpers'

/** Registered tools are wrapped by `wrapTool`, so every call comes back in the
 *  MCP envelope rather than as the tool's own return value. */
type Envelope = { content: { type: string; text: string }[]; isError?: boolean }

function payloadOf(result: unknown): Record<string, unknown> {
  const envelope = result as Envelope
  expect(Array.isArray(envelope.content)).toBe(true)
  return JSON.parse(envelope.content[0]!.text) as Record<string, unknown>
}

test.describe('WebMCP & Evolutionary Art Director UI', () => {
  test('registers webmcp on window and opens Art Director overlay on executeTool', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)

    // Verify window.webmcp exists
    const hasWebMcp = await page.evaluate(() => {
      const win = window as unknown as {
        webmcp?: {
          executeTool: (name: string, input: unknown) => Promise<unknown>
          execute: (name: string, input: unknown) => Promise<unknown>
        }
      }
      return typeof win.webmcp !== 'undefined'
    })
    expect(hasWebMcp).toBe(true)

    // Execute open_art_director via window.webmcp
    const result = await page.evaluate(async () => {
      const win = window as unknown as {
        webmcp?: {
          executeTool: (name: string, input: unknown) => Promise<unknown>
        }
      }
      return await win.webmcp?.executeTool('open_art_director', {
        generation: 1,
        candidates: [
          { fitness: 0.85, flame: { transforms: {}, renderSettings: {} } },
          { fitness: 0.92, flame: { transforms: {}, renderSettings: {} } },
        ],
      })
    })

    // Pin the contract, not the prose: the message is written for the model
    // and was reworded without this spec noticing.
    expect(payloadOf(result)).toMatchObject({
      success: true,
      generation: 1,
      candidateCount: 2,
    })

    // Verify the Art Director overlay is visible
    const directorHeader = page.getByRole('heading', { name: 'Art Director' })
    await expect(directorHeader).toBeVisible({ timeout: 5000 })

    // Verify generation number and candidates are displayed
    await expect(page.getByText('Gen 1')).toBeVisible()
    await expect(page.getByText('85%')).toBeVisible()
    await expect(page.getByText('92%')).toBeVisible()

    // Star ratings became Like / Dislike reactions.
    await page.getByTitle('Like this candidate').first().click()

    // Loading a candidate closes the director on its own; the close button is
    // exercised by the toolbar test below.
    await page.getByRole('button', { name: 'Load Candidate' }).first().click()
    await expect(directorHeader).toBeHidden()
  })

  test('opens Art Director from toolbar Genetics menu and populates candidates', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)

    // Open Genetics menu
    const geneticsBtn = page.getByRole('button', { name: 'Genetics' })
    await geneticsBtn.click()

    // Click Art Director menu item
    const artDirectorItem = page.getByRole('menuitem', {
      name: /Art Director/i,
    })
    await artDirectorItem.click()

    // Verify Art Director overlay opens
    const directorHeader = page.getByRole('heading', { name: 'Art Director' })
    await expect(directorHeader).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Candidates (4)')).toBeVisible()

    // Verify close
    const closeBtn = page.getByRole('button', { name: 'Close Art Director' })
    await closeBtn.click()
    await expect(directorHeader).toBeHidden()
  })
})
