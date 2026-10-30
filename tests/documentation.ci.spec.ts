import { dismissWelcomeIfPresent, expect, openWorkspaceMenuItem, test, } from './helpers'

test.describe('Documentation modal', () => {
  test('opens from the workspace menu and shows the three tabs with content', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await dismissWelcomeIfPresent(page)

    // v0.9.11 had a Docs pill; the entry now lives in the workspace menu. This
    // spec used to skip when the old selector missed, and so reported green
    // while testing nothing.
    await openWorkspaceMenuItem(page, /Documentation/)

    const modal = page.locator('dialog', { hasText: 'Documentation' }).first()
    await expect(modal).toBeVisible()

    for (const label of ['Variations', 'IFS', 'API']) {
      await expect(
        modal.locator('button', { hasText: label }).first(),
      ).toBeVisible()
    }

    // IFS tab shows the ported guide prose.
    await modal
      .locator('button', { hasText: 'IFS' })
      .first()
      .dispatchEvent('click')
    await expect(modal.locator('text=Iterated Function Systems')).toBeVisible()

    // API tab shows the custom-variation reference.
    await modal
      .locator('button', { hasText: 'API' })
      .first()
      .dispatchEvent('click')
    await expect(modal.locator('text=Environment bindings')).toBeVisible()
  })
})

test.describe('Documentation modal on a phone', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  })

  test('holds its panes to the dialog and scrolls the chips sideways', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await dismissWelcomeIfPresent(page)

    const more = page.getByRole('button', { name: 'More', exact: true }).first()
    await more.waitFor({ state: 'visible', timeout: 20_000 })
    await more.dispatchEvent('click')
    await page
      .getByRole('menuitem', { name: /Documentation/ })
      .first()
      .dispatchEvent('click')
    await expect(page.getByText('Catalog & Reference').first()).toBeVisible()

    // In 0.9.13 a bare 1fr column took the one-line chip row's full width
    // (652px in a 341px dialog): both panes were clipped and the chips could
    // not scroll.
    const box = await page.evaluate(() => {
      const el = (name: string) => {
        const found = document.querySelector(`[class*="_${name}_"]`)
        if (!found) throw new Error(`no .${name}`)
        return found
      }
      const right = (e: Element) => Math.round(e.getBoundingClientRect().right)
      const layout = el('docs-layout')
      const chips = el('category-row')
      return {
        layoutRight: right(layout),
        galleryRight: right(el('gallery-pane')),
        detailRight: right(el('detail-pane')),
        chipsRight: right(chips),
        chipsOverflow: chips.scrollWidth - chips.clientWidth,
        pageOverflow:
          document.scrollingElement!.scrollWidth - window.innerWidth,
      }
    })
    expect(box.galleryRight).toBeLessThanOrEqual(box.layoutRight)
    expect(box.detailRight).toBeLessThanOrEqual(box.layoutRight)
    expect(box.chipsRight).toBeLessThanOrEqual(box.layoutRight)
    expect(box.chipsOverflow).toBeGreaterThan(0)
    expect(box.pageOverflow).toBe(0)
  })
})
