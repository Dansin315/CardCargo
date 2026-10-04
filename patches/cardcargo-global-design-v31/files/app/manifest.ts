import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CardCargo – Sammlung & Logistik',
    short_name: 'CardCargo',
    description: 'Bunjang-Einkäufe, Sendungen und Pokémon-Karten-Inventar verwalten.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5ede0',
    theme_color: '#f5ede0',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
