/**
 * MAYA Capture — Cooperative in-iframe screenshot
 *
 * Runs on the PREVIEW'S own origin (same-origin to itself → canvas is allowed).
 * Listens for parent postMessage `{ type: 'MAYA_CAPTURE' }` and posts back
 * a PNG screenshot of the rendered page.
 *
 * The model must include this script in the generated app:
 *   <script src="/maya-capture.js"></script>
 * (added automatically via the build instruction pipeline.)
 */
;(function () {
  if (window.__MAYA_CAPTURE_INSTALLED__) return
  window.__MAYA_CAPTURE_INSTALLED__ = true

  /**
   * Capture the current viewport as a base64 PNG.
   * Uses SVG foreignObject → <img> → canvas. This is same-origin-safe
   * because the SVG and the page share the same origin.
   */
  async function captureViewport() {
    try {
      const w = window.innerWidth
      const h = window.innerHeight

      // Serialize the DOM into an SVG <foreignObject>
      const data =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        w +
        '" height="' +
        h +
        '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0">' +
        new XMLSerializer().serializeToString(document.documentElement) +
        '</div>' +
        '</foreignObject>' +
        '</svg>'

      const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      return new Promise(function (resolve, reject) {
        const img = new Image()
        img.onload = function () {
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) { URL.revokeObjectURL(url); return reject(new Error('No 2d context')) }
          ctx.drawImage(img, 0, 0, w, h)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = function (e) {
          URL.revokeObjectURL(url)
          reject(e)
        }
        img.src = url
      })
    } catch (err) {
      // Fallback: report page has content but can't image-capture
      return { error: String(err), hasContent: document.body && document.body.innerText.length > 50 }
    }
  }

  function sendResult(route, image) {
    window.parent.postMessage(
      {
        type: 'MAYA_CAPTURE_RESULT',
        route: route || window.location.pathname,
        image: image,
        timestamp: Date.now(),
      },
      '*'
    )
  }

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'MAYA_CAPTURE') return

    var route = event.data.route || window.location.pathname

    captureViewport()
      .then(function (image) {
        if (typeof image === 'string') {
          sendResult(route, image)
        } else {
          // Fallback: image is { error, hasContent }
          sendResult(route, null)
          window.parent.postMessage(
            { type: 'MAYA_CAPTURE_ERROR', route: route, error: image.error, hasContent: image.hasContent },
            '*'
          )
        }
      })
      .catch(function (err) {
        console.warn('[maya-capture] Capture failed:', err)
        sendResult(route, null)
        window.parent.postMessage(
          { type: 'MAYA_CAPTURE_ERROR', route: route, error: String(err) },
          '*'
        )
      })
  })

  // Signal to parent that capture is ready
  window.parent.postMessage({ type: 'MAYA_CAPTURE_READY' }, '*')
})()