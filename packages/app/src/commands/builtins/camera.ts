import { vec2f } from 'typegpu/data'
import { registerCommand } from '../registry'

registerCommand({
  id: 'camera.center',
  label: 'Center Camera',
  description: 'Reset camera position to (0, 0) and zoom to 1',
  shortcut: 'Ctrl+0',
  execute(ctx) {
    ctx.setPosition(vec2f(0, 0))
    ctx.setZoom(1)
  },
})

registerCommand({
  id: 'camera.zoomTo',
  label: 'Zoom To',
  description: 'Set camera zoom to a specific level',
  execute(ctx, zoom?: unknown) {
    const z = typeof zoom === 'number' ? Math.max(0.01, Math.min(500, zoom)) : 1
    ctx.setZoom(z)
  },
})
