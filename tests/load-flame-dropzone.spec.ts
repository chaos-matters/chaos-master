import { expect, test } from '@playwright/test'
import { dismissWelcomeIfPresent } from './helpers'
import type { Page } from '@playwright/test'

/** Drag a file over the zone. Playwright cannot drive a real OS drag, but the
 *  handlers only read `DataTransfer`, so a constructed one exercises the same
 *  path — including the enter/leave counter the zone relies on. */
async function dragFileOver(page: Page) {
  await page.evaluate(() => {
    const zone = document.querySelector('[class*="uploadZone"]')
    if (!zone) throw new Error('upload zone not found')
    const dt = new DataTransfer()
    dt.items.add(new File(['x'], 'flame.png', { type: 'image/png' }))
    for (const type of ['dragenter', 'dragover']) {
      zone.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      )
    }
  })
  await page.waitForTimeout(300)
}

async function openDropzone(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissWelcomeIfPresent(page)
  await page.getByRole('button', { name: 'Load Flame' }).click()
  const zone = page.locator('[class*="uploadZone"]').first()
  await zone.waitFor({ state: 'visible', timeout: 15000 })
  return zone
}

test('advertises exactly the formats the picker accepts', async ({ page }) => {
  await openDropzone(page)
  const pills = page.locator('[class*="formatPills"] span[class*="formatPill"]')
  // Format names, not dotted extensions — Google's developer style guide.
  await expect(pills).toHaveText(['PNG', 'JSON', 'ZIP', 'FLAME', 'XML'])
  for (const text of await pills.allInnerTexts()) {
    expect(text, 'pills must not carry a leading dot').not.toMatch(/^\./)
  }
  await expect(page.locator('[class*="sizeLimit"]')).toContainText('500 MB')
})

test('states the action without a paragraph of prose', async ({ page }) => {
  const zone = await openDropzone(page)
  await expect(page.locator('[class*="uploadTitle"]')).toHaveText(
    'Drop files or click to browse',
  )
  // It used to carry a 230-character explanation of the formats and the
  // multi-file rule; both now live in the pills and the info tooltip.
  const text = await zone.innerText()
  expect(text).not.toContain('backup ZIP')
  expect(text.length).toBeLessThan(120)
})

test('keeps the multi-file rule behind the info affordance', async ({
  page,
}) => {
  await openDropzone(page)
  const info = page.getByRole('button', { name: 'What can I import?' })
  const tooltip = page.locator('[class*="infoTooltip"]').first()
  const visibility = () =>
    tooltip.evaluate((el) => globalThis.getComputedStyle(el).visibility)

  expect(await visibility()).toBe('hidden')
  await info.hover()
  await page.waitForTimeout(250)
  expect(await visibility()).toBe('visible')
  await expect(tooltip).toContainText('Recent flames')
})

// Regression: the drag rule used to grow the border to 2px and scale to 1.01,
// which pushed the zone past the modal's left edge while a file hovered it.
test('drag state never grows the zone past its container', async ({ page }) => {
  const zone = await openDropzone(page)
  await dragFileOver(page)

  const geom = await zone.evaluate((el) => {
    const parent = el.parentElement as HTMLElement
    const z = el.getBoundingClientRect()
    const p = parent.getBoundingClientRect()
    const cs = globalThis.getComputedStyle(parent)
    return {
      zoneLeft: z.left,
      zoneRight: z.right,
      innerLeft: p.left + parseFloat(cs.paddingLeft),
      innerRight: p.right - parseFloat(cs.paddingRight),
      transform: globalThis.getComputedStyle(el).transform,
      dragging: el.getAttribute('class') ?? '',
    }
  })

  expect(geom.dragging, 'drag class not applied').toMatch(/uploadZoneDragging/)
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(geom.transform)
  expect(geom.zoneLeft).toBeGreaterThanOrEqual(geom.innerLeft - 0.5)
  expect(geom.zoneRight).toBeLessThanOrEqual(geom.innerRight + 0.5)

  const overflowsX = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  )
  expect(overflowsX, 'page gained a horizontal scrollbar').toBe(false)
})

test('pills wrap inside the zone on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 })
  await openDropzone(page)
  await dragFileOver(page)

  const fits = await page.evaluate(() => {
    const zone = document.querySelector('[class*="uploadZone"]')!
    const row = document.querySelector('[class*="formatPills"]')!
    const z = zone.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    return {
      inside: r.left >= z.left - 0.5 && r.right <= z.right + 0.5,
      docOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }
  })
  expect(fits.inside).toBe(true)
  expect(fits.docOverflow).toBeLessThanOrEqual(1)
})

test('dropzone text clears the contrast floor', async ({ page }) => {
  await openDropzone(page)

  const report = await page.evaluate(() => {
    // Theme colors compute as oklch(), so parse nothing — let the browser
    // resolve each one to sRGB by painting it onto a canvas.
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const ctx = cv.getContext('2d', { willReadFrequently: true })!
    const toRgb = (color: string): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!]
    }
    const lum = (color: string) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      const [r, g, b] = toRgb(color)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const bgOf = (el: Element): string => {
      let node: Element | null = el
      while (node) {
        const bg = globalThis.getComputedStyle(node).backgroundColor
        if (bg && bg !== 'transparent' && !/,\s*0\)$/.test(bg)) return bg
        node = node.parentElement
      }
      return globalThis.getComputedStyle(document.body).backgroundColor
    }
    const probe = (sel: string, label: string) => {
      const el = document.querySelector(sel)
      if (!el) return { label, missing: true, ratio: 0 }
      const fg = globalThis.getComputedStyle(el).color
      const bg = bgOf(el)
      const a = lum(fg)
      const b = lum(bg)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      return { label, missing: false, ratio: Number(ratio.toFixed(2)) }
    }
    return [
      probe('[class*="uploadTitle"]', 'title'),
      probe('[class*="formatPill_"]', 'pill'),
      probe('[class*="sizeLimit"]', 'size limit'),
      probe('[class*="modalSubtitle"]', 'modal subtitle'),
    ]
  })

  for (const row of report) {
    expect(row.missing, `${row.label} not found`).toBe(false)
    // WCAG AA for body text. The size limit shipped at 2.25:1 on the dark
    // surface until this was measured instead of eyeballed.
    expect(row.ratio, `${row.label} contrast`).toBeGreaterThanOrEqual(4.5)
  }
})
