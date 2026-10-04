export function normalizeDomesticTrackingNumber(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function domesticTrackingNumbersMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const a = normalizeDomesticTrackingNumber(left)
  const b = normalizeDomesticTrackingNumber(right)
  return Boolean(a && b && a === b)
}
