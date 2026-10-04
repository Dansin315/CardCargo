(() => {
  if (window.__cardcargoBunjangNetworkHookV67) return
  window.__cardcargoBunjangNetworkHookV67 = true

  const SOURCE = 'cardcargo-bunjang-network-v67'
  const recent = []
  const MAX_RECENT = 24
  const MAX_BODY = 2000000

  function emit(url, body, kind) {
    const record = {
      source: SOURCE,
      type: 'response',
      url: String(url || ''),
      body: String(body || '').slice(0, MAX_BODY),
      kind,
      capturedAt: new Date().toISOString(),
    }

    recent.push(record)
    while (recent.length > MAX_RECENT) recent.shift()

    window.postMessage(record, '*')
  }

  window.addEventListener('message', (event) => {
    const data = event.data
    if (
      event.source !== window ||
      !data ||
      data.source !== SOURCE ||
      data.type !== 'bridge-ready'
    ) {
      return
    }

    for (const record of recent) {
      window.postMessage(record, '*')
    }
  })

  const originalFetch = window.fetch

  window.fetch = async function cardcargoFetch(...args) {
    const response = await originalFetch.apply(this, args)

    try {
      const request = args[0]
      const url =
        typeof request === 'string'
          ? request
          : request instanceof Request
            ? request.url
            : response.url

      response
        .clone()
        .text()
        .then((body) => emit(url || response.url, body, 'fetch'))
        .catch(() => {})
    } catch {
      // Never interfere with Bunjang's own request.
    }

    return response
  }

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function cardcargoOpen(
    method,
    url,
    ...rest
  ) {
    this.__cardcargoRequestUrl = String(url || '')
    return originalOpen.call(this, method, url, ...rest)
  }

  XMLHttpRequest.prototype.send = function cardcargoSend(...args) {
    try {
      this.addEventListener(
        'load',
        () => {
          try {
            if (
              this.responseType &&
              this.responseType !== '' &&
              this.responseType !== 'text' &&
              this.responseType !== 'json'
            ) {
              return
            }

            const body =
              this.responseType === 'json'
                ? JSON.stringify(this.response)
                : this.responseText

            emit(
              this.responseURL || this.__cardcargoRequestUrl || '',
              body,
              'xhr',
            )
          } catch {
            // Ignore unreadable responses.
          }
        },
        { once: true },
      )
    } catch {
      // Ignore.
    }

    return originalSend.apply(this, args)
  }
})()
