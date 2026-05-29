import { registerCommand } from '../registry'

registerCommand({
  id: 'sidebar.open',
  label: 'Toggle Sidebar',
  description: 'Open or close the sidebar panel',
  shortcut: 'Ctrl+S',
  execute(ctx, open?: unknown) {
    if (typeof open === 'boolean') {
      ctx.sidebar.setOpen(open)
    } else {
      ctx.sidebar.setOpen((prev) => !prev)
    }
  },
})

registerCommand({
  id: 'sidebar.close',
  label: 'Close Sidebar',
  description: 'Close the sidebar panel',
  execute(ctx) {
    ctx.sidebar.setOpen(false)
  },
})

registerCommand({
  id: 'export.png',
  label: 'Export PNG',
  description: 'Open the PNG export options',
  shortcut: 'Ctrl+E',
  execute(ctx) {
    ctx.modal.open('exportPng')
  },
})

registerCommand({
  id: 'export.animation',
  label: 'Export Animation',
  description: 'Open the animation export modal',
  shortcut: 'Ctrl+Shift+A',
  execute(ctx) {
    ctx.modal.open('exportAnimation')
  },
})
