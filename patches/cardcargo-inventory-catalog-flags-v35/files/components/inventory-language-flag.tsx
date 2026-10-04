import { inventoryLanguageInfo } from '@/lib/inventory-language-flags'

export function InventoryLanguageFlag({ language }: { language: string | null | undefined }) {
  if (!language) return <>–</>
  const info = inventoryLanguageInfo(language)
  if (!info) return <>{language}</>

  return (
    <span
      title={`${info.label} (${language})`}
      aria-label={info.label}
      style={{
        display: 'inline-block',
        width: 28,
        height: 19,
        verticalAlign: 'middle',
        borderRadius: 3,
        backgroundImage: `url(/flags/${info.countryCode}.svg)`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        boxShadow: '0 0 0 1px rgba(70, 49, 31, 0.18)',
      }}
    />
  )
}
