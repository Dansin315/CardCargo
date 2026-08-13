export const inventoryLanguageOptions = [
  { value: 'Korean', label: 'Koreanisch', flag: '\u{1F1F0}\u{1F1F7}' },
  { value: 'Japanese', label: 'Japanisch', flag: '\u{1F1EF}\u{1F1F5}' },
  { value: 'English', label: 'Englisch', flag: '\u{1F1EC}\u{1F1E7}' },
  { value: 'German', label: 'Deutsch', flag: '\u{1F1E9}\u{1F1EA}' },
  { value: 'French', label: 'Franz\u00f6sisch', flag: '\u{1F1EB}\u{1F1F7}' },
  { value: 'Spanish', label: 'Spanisch', flag: '\u{1F1EA}\u{1F1F8}' },
  { value: 'Italian', label: 'Italienisch', flag: '\u{1F1EE}\u{1F1F9}' },
  { value: 'Portuguese', label: 'Portugiesisch (Brasilien)', flag: '\u{1F1E7}\u{1F1F7}' },
  { value: 'Chinese Traditional', label: 'Chinesisch (traditionell)', flag: '\u{1F1F9}\u{1F1FC}' },
  { value: 'Chinese Simplified', label: 'Chinesisch (vereinfacht)', flag: '\u{1F1E8}\u{1F1F3}' },
  { value: 'Indonesian', label: 'Indonesisch', flag: '\u{1F1EE}\u{1F1E9}' },
  { value: 'Thai', label: 'Thail\u00e4ndisch', flag: '\u{1F1F9}\u{1F1ED}' },
  { value: 'Dutch', label: 'Niederl\u00e4ndisch', flag: '\u{1F1F3}\u{1F1F1}' },
  { value: 'Polish', label: 'Polnisch', flag: '\u{1F1F5}\u{1F1F1}' },
  { value: 'Russian', label: 'Russisch', flag: '\u{1F1F7}\u{1F1FA}' },
  { value: 'Other', label: 'Andere', flag: '\u{1F310}' },
] as const

export type InventoryLanguageValue = (typeof inventoryLanguageOptions)[number]['value']

const metadata = new Map<string, { label: string; flag: string }>(
  inventoryLanguageOptions.map((option) => [option.value, option]),
)

export const inventoryLanguageValues = new Set<string>(
  inventoryLanguageOptions.map((option) => option.value),
)

export function inventoryLanguageFlag(value: string | null | undefined) {
  if (!value) return '\u{1F310}'
  return metadata.get(value)?.flag ?? '\u{1F310}'
}

export function inventoryLanguageLabel(value: string | null | undefined) {
  if (!value) return 'Nicht gesetzt'
  const option = metadata.get(value)
  return option ? `${option.flag} ${option.label}` : `\u{1F310} ${value}`
}
