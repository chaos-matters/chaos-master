import { registerCommand } from '../registry'

registerCommand({
  id: 'sidebar.open',
  describe: ([open]) =>
    open === true
      ? 'Open the sidebar'
      : open === false
        ? 'Close the sidebar'
        : 'Toggle the sidebar',
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
  describe: () => 'Close the sidebar',
  label: 'Close Sidebar',
  description: 'Close the sidebar panel',
  execute(ctx) {
    ctx.sidebar.setOpen(false)
  },
})
