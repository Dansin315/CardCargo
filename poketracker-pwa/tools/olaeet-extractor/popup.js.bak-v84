const button = document.getElementById('copy')
const status = document.getElementById('status')

button.addEventListener('click', async () => {
  status.textContent = 'Lese Seite …'
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('Kein aktiver Tab gefunden.')

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selected = window.getSelection()?.toString().trim() || ''
        return selected || document.body?.innerText || ''
      },
    })

    const text = String(result || '').trim()
    if (!text) throw new Error('Kein sichtbarer Text gefunden.')

    await navigator.clipboard.writeText(text)
    status.textContent = `Kopiert (${text.length.toLocaleString('de-DE')} Zeichen).`
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Daten konnten nicht kopiert werden.'
  }
})
