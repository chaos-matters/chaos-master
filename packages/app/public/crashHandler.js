/* global document, window, navigator */
/* eslint-disable no-restricted-globals */
// Pre-bundle error handler — catches module-level errors (e.g., WGSL reserved
// words in struct definitions) that happen before the app mounts. Renders a
// crash screen directly into the DOM so the user sees an error instead of a
// white screen.
;(function () {
  const root = document.getElementById('root')
  if (!root) return

  const style = document.createElement('style')
  style.textContent =
    '*' +
    '{box-sizing:border-box;margin:0;padding:0}' +
    '.crash-overlay' +
    '{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0f;color:#e0e0e0;font-family:system-ui,sans-serif;padding:24px}' +
    '.crash-card' +
    '{max-width:720px;width:100%;background:#14141f;border:1px solid #2a2a3f;border-radius:12px;padding:32px}' +
    '.crash-title' +
    '{font-size:24px;font-weight:700;color:#7928ca;margin-bottom:8px}' +
    '.crash-subtitle' +
    '{font-size:14px;color:#888;margin-bottom:24px}' +
    '.crash-error' +
    '{background:#0d0d16;border:1px solid #3a2040;border-radius:8px;padding:16px;margin-bottom:16px;font-family:monospace;font-size:13px;color:#f44;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow:auto}' +
    '.crash-stack' +
    '{background:#0d0d16;border:1px solid #2a2a3f;border-radius:8px;padding:16px;margin-bottom:16px;font-family:monospace;font-size:11px;color:#888;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow:auto;display:none}' +
    '.crash-stack.open' +
    '{display:block}' +
    '.crash-toggle' +
    '{background:none;border:none;color:#7928ca;cursor:pointer;font-size:13px;margin-bottom:16px;padding:4px 0}' +
    '.crash-toggle:hover' +
    '{color:#9440e0}' +
    '.crash-actions' +
    '{display:flex;gap:12px;flex-wrap:wrap}' +
    '.crash-btn' +
    '{padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;border:none;font-weight:600}' +
    '.crash-btn-primary' +
    '{background:#7928ca;color:#fff}' +
    '.crash-btn-primary:hover' +
    '{background:#9440e0}' +
    '.crash-btn-secondary' +
    '{background:#2a2a3f;color:#ccc}' +
    '.crash-btn-secondary:hover' +
    '{background:#3a3a5f}' +
    '.crash-meta' +
    '{margin-top:24px;font-size:12px;color:#555}' +
    '@media(max-width:480px)' +
    '{.crash-card{padding:20px}.crash-title{font-size:20px}.crash-actions{flex-direction:column}}'

  document.head.appendChild(style)

  function escapeHtml(str) {
    const div = document.createElement('div')
    div.appendChild(document.createTextNode(str))
    return div.innerHTML
  }

  function renderCrash(title, message, stack) {
    let html = '<div class="crash-overlay"><div class="crash-card">'
    html += '<h1 class="crash-title">CHAOS MASTER</h1>'
    html += `<p class="crash-subtitle">${escapeHtml(title)}</p>`

    if (message) {
      html += `<div class="crash-error">${escapeHtml(message)}</div>`
    }

    if (stack) {
      html +=
        "<button class=\"crash-toggle\" onclick=\"this.nextElementSibling.classList.toggle('open');this.textContent=this.nextElementSibling.classList.contains('open')?'Hide Stack Trace':'Show Stack Trace'\">Show Stack Trace</button>"
      html += `<div class="crash-stack">${escapeHtml(stack)}</div>`
    }

    html += '<div class="crash-actions">'
    html +=
      '<button class="crash-btn crash-btn-primary" onclick="location.reload()">Reload Page</button>'
    html +=
      '<button class="crash-btn crash-btn-secondary" onclick="if(confirm(\'Clear all local data and reload?\')){try{localStorage.clear();sessionStorage.clear()}catch(e){}location.reload()}">Reload + Clear Data</button>'
    html += '</div>'

    html += `<div class="crash-meta">${navigator.userAgent}</div>`

    html += '</div></div>'
    root.innerHTML = html
  }

  window.addEventListener('error', function (event) {
    // Only handle errors that prevent the app from mounting
    if (root.children.length > 0 && !root.querySelector('.crash-overlay'))
      return

    const error = event.error
    const message = error ? error.message : event.message
    const stack = error && error.stack ? error.stack : ''

    renderCrash(
      'Something went wrong while loading the application.',
      message,
      stack,
    )

    event.preventDefault()
  })

  // Also catch unhandled promise rejections
  window.addEventListener('unhandledrejection', function (event) {
    if (root.children.length > 0 && !root.querySelector('.crash-overlay'))
      return

    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : ''

    renderCrash(
      'Something went wrong while loading the application.',
      message,
      stack,
    )

    event.preventDefault()
  })
})()
