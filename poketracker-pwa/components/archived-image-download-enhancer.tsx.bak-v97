'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

function safeFilename(value: string, fallback: string) {
  const cleaned = value
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]+/g, '-')

  return cleaned || fallback
}

async function downloadImage(url: string, filename: string) {
  try {
    const response = await fetch(url, { credentials: 'omit' })
    if (!response.ok) throw new Error(String(response.status))
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function isAllowedRoute(pathname: string) {
  const purchase = /^\/purchases\/[^/]+\/?$/.test(pathname)
  const warehouse = /^\/warehouse-packages\/[^/]+\/?$/.test(pathname)
  return purchase || warehouse
}

function isTargetPanel(panel: HTMLElement, pathname: string) {
  const heading = panel.querySelector<HTMLElement>('.panel-heading h2, h2, h3')
  const headingText = String(heading?.textContent || '').trim()

  if (/^\/purchases\//.test(pathname)) {
    const breadcrumb = String(document.querySelector('.breadcrumb-row')?.textContent || '')
    if (!/Bunjang/i.test(breadcrumb) && !/Bunjang/i.test(document.body.textContent || '')) {
      return false
    }
    return /Archivierte Angebotsbilder|Archivierte Bilder/i.test(headingText)
  }

  return /Paketbilder|OLAEET-Paketbilder|Archivierte.*bilder|Manuelle.*Paketbilder/i.test(headingText)
}

function downloadIcon() {
  return '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3Zm-6 16h14v2H5v-2Z" fill="currentColor"/></svg>'
}

export function ArchivedImageDownloadEnhancer() {
  const pathname = usePathname()

  useEffect(() => {
    if (!isAllowedRoute(pathname)) return

    let frame = 0

    const clearTools = () => {
      document.querySelectorAll('[data-cc96-download-tool="true"]').forEach((node) => node.remove())
    }

    const enhance = () => {
      frame = 0

      const panels = [...document.querySelectorAll<HTMLElement>('section.panel, .panel')]
      for (const panel of panels) {
        if (!isTargetPanel(panel, pathname)) continue

        const images = [...panel.querySelectorAll<HTMLImageElement>('img')].filter((image) => Boolean(image.currentSrc || image.src))
        if (!images.length) continue

        const heading = panel.querySelector<HTMLElement>('.panel-heading')
        if (heading) {
          let allButton = heading.querySelector<HTMLButtonElement>('.cc96-download-all')
          if (!allButton) {
            allButton = document.createElement('button')
            allButton.type = 'button'
            allButton.className = 'button button-secondary button-small cc96-download-all'
            allButton.dataset.cc96DownloadTool = 'true'
            heading.appendChild(allButton)
          }
          allButton.textContent = `Alle ${images.length} Bilder herunterladen`
          const downloadAllButton = allButton
          downloadAllButton.onclick = async () => {
            downloadAllButton.disabled = true
            const original = downloadAllButton.textContent
            for (let index = 0; index < images.length; index += 1) {
              const image = images[index]
              const url = image.currentSrc || image.src
              await downloadImage(url, safeFilename(url, `cardcargo-bild-${index + 1}.jpg`))
              await new Promise((resolve) => window.setTimeout(resolve, 180))
            }
            downloadAllButton.textContent = original
            downloadAllButton.disabled = false
          }
        }

        images.forEach((image, index) => {
          const figure = image.closest<HTMLElement>('figure') || image.parentElement
          if (!figure) return
          if (getComputedStyle(figure).position === 'static') figure.style.position = 'relative'

          if (figure.querySelector('.cc96-image-download-button')) return
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'cc96-image-download-button'
          button.dataset.cc96DownloadTool = 'true'
          button.title = 'Archiviertes Bild herunterladen'
          button.setAttribute('aria-label', `Bild ${index + 1} herunterladen`)
          button.innerHTML = downloadIcon()
          button.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            const url = image.currentSrc || image.src
            void downloadImage(url, safeFilename(url, `cardcargo-bild-${index + 1}.jpg`))
          })
          figure.appendChild(button)
        })
      }
    }

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(enhance)
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      clearTools()
    }
  }, [pathname])

  return null
}
