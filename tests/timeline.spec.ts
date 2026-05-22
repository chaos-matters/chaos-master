import { expect,test } from '@playwright/test'

test.describe('Timeline System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should render timeline panel', async ({ page }) => {
    const timelinePanel = page.locator('[data-testid="timeline-panel"]')
    await expect(timelinePanel).toBeVisible()
  })

  test('should show timeline ruler with keyframe markers', async ({ page }) => {
    const timelineRuler = page.locator('[data-testid="timeline-ruler"]')
    await expect(timelineRuler).toBeVisible()
    // Should have markers for frame positions
    const markers = timelineRuler.locator('[data-key]')
    await expect(markers).toHaveCountGreaterThan(0)
  })

  test('should have keyframe editor', async ({ page }) => {
    const keyframeEditor = page.locator('[data-testid="keyframe-editor"]')
    await expect(keyframeEditor).toBeVisible()
  })

  test('should allow parameter selection', async ({ page }) => {
    const parameterSelect = page.locator('select').first()
    await expect(parameterSelect).toBeVisible()

    // Should have camera options
    await parameterSelect.selectOption('exposure')
    await expect(parameterSelect).toHaveValue('exposure')

    await parameterSelect.selectOption('camera.zoom')
    await expect(parameterSelect).toHaveValue('camera.zoom')
  })

  test('should allow frame navigation', async ({ page }) => {
    const prevButton = page.locator('button[aria-label="Previous frame"]')
    const nextButton = page.locator('button[aria-label="Next frame"]')
    const frameInput = page.locator('input[type="number"]')

    await expect(prevButton).toBeEnabled()
    await expect(nextButton).toBeEnabled()
    await expect(frameInput).toBeEnabled()

    // Navigate to frame 10
    await frameInput.fill('10')
    await frameInput.blur()
    await expect(frameInput).toHaveValue('10')
  })

  test('should allow FPS configuration', async ({ page }) => {
    const fpsInput = page.locator('#fps-input')
    await expect(fpsInput).toBeVisible()

    // Change FPS to 30
    await fpsInput.fill('30')
    await fpsInput.blur()
    await expect(fpsInput).toHaveValue('30')
  })

  test('should allow loop toggle', async ({ page }) => {
    const loopToggle = page.locator('#loop-toggle')
    await expect(loopToggle).toBeVisible()

    // Toggle loop on
    await loopToggle.check()
    await expect(loopToggle).toBeChecked()
  })

  test('should play/pause timeline', async ({ page }) => {
    const playButton = page.locator('button[aria-label="Play"]')
    const pauseButton = page.locator('button[aria-label="Pause"]')

    await expect(playButton).toBeVisible()
    await expect(pauseButton).toBeVisible()

    // Start playback
    await playButton.click()

    // Wait for some time to see if animation progresses
    await page.waitForTimeout(500)
  })

  test('should render correctly with initial timeline state', async ({ page }) => {
    // Check that timeline components are in the DOM
    await page.waitForSelector('[data-testid="timeline-panel"]', { timeout: 5000 })

    // Check for keyframe editor
    await expect(page.locator('[data-testid="keyframe-editor"]')).toBeVisible()
  })

  test('should not throw errors with timeline changes', async ({ page }) => {
    // Trigger some timeline changes without errors
    const parameterSelect = page.locator('select').first()
    await parameterSelect.selectOption('exposure')

    const valueInput = page.locator('input[type="text"]')
    await expect(valueInput).toBeVisible()

    // Change to a different parameter
    await parameterSelect.selectOption('vibrancy')
    await parameterSelect.selectOption('camera.zoom')
  })
})

test.describe('Keyframe Editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should allow adding keyframes', async ({ page }) => {
    // Select a parameter
    const parameterSelect = page.locator('select').first()
    await parameterSelect.selectOption('exposure')

    // Navigate to frame 10
    const frameInput = page.locator('input[type="number"]')
    await frameInput.fill('10')
    await frameInput.blur()

    // Enter a value
    const valueInput = page.locator('input[type="text"]')
    await expect(valueInput).toBeVisible()
    await valueInput.fill('0.5')

    // Click add keyframe button
    const addButton = page.locator('button:has-text("Add Keyframe")')
    await expect(addButton).toBeVisible()
    await addButton.click()

    // Wait a bit for any feedback
    await page.waitForTimeout(500)
  })

  test('should allow updating existing keyframes', async ({ page }) => {
    // First add a keyframe
    const parameterSelect = page.locator('select').first()
    await parameterSelect.selectOption('exposure')

    const frameInput = page.locator('input[type="number"]')
    await frameInput.fill('10')
    await frameInput.blur()

    const valueInput = page.locator('input[type="text"]')
    await valueInput.fill('0.5')
    await valueInput.blur()

    const addButton = page.locator('button:has-text("Add Keyframe")')
    await addButton.click()

    // Navigate to same frame with different value
    await frameInput.fill('10')
    await frameInput.blur()
    await valueInput.fill('0.75')
    await valueInput.blur()

    // Click update button
    const updateButton = page.locator('button:has-text("Update")')
    await expect(updateButton).toBeVisible()
    await updateButton.click()

    await page.waitForTimeout(500)
  })

  test('should allow removing keyframes', async ({ page }) => {
    // Add a keyframe first
    const parameterSelect = page.locator('select').first()
    await parameterSelect.selectOption('exposure')

    const frameInput = page.locator('input[type="number"]')
    await frameInput.fill('10')
    await frameInput.blur()

    const valueInput = page.locator('input[type="text"]')
    await valueInput.fill('0.5')
    await valueInput.blur()

    const addButton = page.locator('button:has-text("Add Keyframe")')
    await addButton.click()

    // Now remove it
    const removeButton = page.locator('button:has-text("Remove")')
    await expect(removeButton).toBeVisible()
    await removeButton.click()

    await page.waitForTimeout(500)
  })

  test('should handle array values like backgroundColor', async ({ page }) => {
    // Select backgroundColor parameter
    const parameterSelect = page.locator('select').first()
    await parameterSelect.selectOption('backgroundColor')

    // Navigate to frame 20
    const frameInput = page.locator('input[type="number"]')
    await frameInput.fill('20')
    await frameInput.blur()

    // Enter RGB value
    const valueInput = page.locator('input[type="text"]')
    await expect(valueInput).toBeVisible()
    await valueInput.fill('1, 0, 0') // Red background

    // Add keyframe
    const addButton = page.locator('button:has-text("Add Keyframe")')
    await addButton.click()

    await page.waitForTimeout(500)
  })
})

test.describe('Timeline Playback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should render keyframe markers', async ({ page }) => {
    const timelineRuler = page.locator('[data-testid="timeline-ruler"]')
    await expect(timelineRuler).toBeVisible()

    // Check for markers
    const markers = timelineRuler.locator('[data-key]')
    await expect(markers).toHaveCountGreaterThan(0)

    // Markers should have left positions
    const markerElements = markers.all()
    for (const marker of markerElements) {
      const style = await marker.getAttribute('style')
      expect(style).toContain('left:')
    }
  })

  test('should show current frame indicator', async ({ page }) => {
    const currentFrameDisplay = page.locator('[data-testid="current-frame"]')
    await expect(currentFrameDisplay).toBeVisible()
  })

  test('should show total frames', async ({ page }) => {
    const endFrameDisplay = page.locator('[data-testid="end-frame"]')
    await expect(endFrameDisplay).toBeVisible()
  })

  test('should allow seeking to specific frames', async ({ page }) => {
    const frameInput = page.locator('input[type="number"]')

    // Seek to various frames
    await frameInput.fill('0')
    await frameInput.blur()
    await expect(frameInput).toHaveValue('0')

    await frameInput.fill('50')
    await frameInput.blur()
    await expect(frameInput).toHaveValue('50')

    await frameInput.fill('90')
    await frameInput.blur()
    await expect(frameInput).toHaveValue('90')
  })
})