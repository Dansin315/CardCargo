'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app remains fully usable without offline support.
    })
  }, [])

  return null
}
