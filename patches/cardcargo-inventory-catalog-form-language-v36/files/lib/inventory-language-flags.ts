export type InventoryLanguageInfo = {
  countryCode: string
  canonicalLanguage: string
  label: string
}

export const INVENTORY_LANGUAGE_OPTIONS = [
  { value: 'Korean', label: 'Koreanisch' },
  { value: 'Japanese', label: 'Japanisch' },
  { value: 'English', label: 'Englisch' },
  { value: 'German', label: 'Deutsch' },
  { value: 'French', label: 'Französisch' },
  { value: 'Spanish', label: 'Spanisch' },
  { value: 'Italian', label: 'Italienisch' },
  { value: 'Portuguese', label: 'Portugiesisch' },
  { value: 'Chinese Traditional', label: 'Chinesisch (traditionell)' },
  { value: 'Chinese Simplified', label: 'Chinesisch (vereinfacht)' },
  { value: 'Indonesian', label: 'Indonesisch' },
  { value: 'Thai', label: 'Thailändisch' },
  { value: 'Dutch', label: 'Niederländisch' },
  { value: 'Polish', label: 'Polnisch' },
  { value: 'Russian', label: 'Russisch' },
] as const

const LANGUAGE_ALIASES: Record<string, InventoryLanguageInfo> = {}

function add(aliases: string[], info: InventoryLanguageInfo) {
  for (const alias of aliases) LANGUAGE_ALIASES[alias.trim().toLowerCase()] = info
}

add(['KR', 'KO', 'Korean', 'Koreanisch'], { countryCode: 'kr', canonicalLanguage: 'Korean', label: 'Koreanisch' })
add(['JP', 'JA', 'Japanese', 'Japanisch'], { countryCode: 'jp', canonicalLanguage: 'Japanese', label: 'Japanisch' })
add(['EN', 'English', 'Englisch'], { countryCode: 'gb', canonicalLanguage: 'English', label: 'Englisch' })
add(['DE', 'German', 'Deutsch'], { countryCode: 'de', canonicalLanguage: 'German', label: 'Deutsch' })
add(['FR', 'French', 'Französisch', 'Franzoesisch'], { countryCode: 'fr', canonicalLanguage: 'French', label: 'Französisch' })
add(['ES', 'Spanish', 'Spanisch'], { countryCode: 'es', canonicalLanguage: 'Spanish', label: 'Spanisch' })
add(['IT', 'Italian', 'Italienisch'], { countryCode: 'it', canonicalLanguage: 'Italian', label: 'Italienisch' })
add(['PT', 'PT-BR', 'Portuguese', 'Portuguese (Brazil)', 'Portugiesisch'], { countryCode: 'br', canonicalLanguage: 'Portuguese', label: 'Portugiesisch' })
add(['TW', 'ZH-TW', 'Chinese Traditional', 'Traditional Chinese', 'Chinesisch (traditionell)'], { countryCode: 'tw', canonicalLanguage: 'Chinese Traditional', label: 'Chinesisch (traditionell)' })
add(['CN', 'ZH-CN', 'Chinese Simplified', 'Simplified Chinese', 'Chinesisch (vereinfacht)'], { countryCode: 'cn', canonicalLanguage: 'Chinese Simplified', label: 'Chinesisch (vereinfacht)' })
add(['ID', 'Indonesian', 'Indonesisch'], { countryCode: 'id', canonicalLanguage: 'Indonesian', label: 'Indonesisch' })
add(['TH', 'Thai', 'Thailändisch', 'Thailaendisch'], { countryCode: 'th', canonicalLanguage: 'Thai', label: 'Thailändisch' })
add(['NL', 'Dutch', 'Niederländisch', 'Niederlaendisch'], { countryCode: 'nl', canonicalLanguage: 'Dutch', label: 'Niederländisch' })
add(['PL', 'Polish', 'Polnisch'], { countryCode: 'pl', canonicalLanguage: 'Polish', label: 'Polnisch' })
add(['RU', 'Russian', 'Russisch'], { countryCode: 'ru', canonicalLanguage: 'Russian', label: 'Russisch' })

export function inventoryLanguageInfo(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized ? LANGUAGE_ALIASES[normalized] ?? null : null
}

export function catalogItemLanguage(value: string | null | undefined) {
  return inventoryLanguageInfo(value)?.canonicalLanguage ?? (String(value ?? '').trim() || 'Korean')
}
