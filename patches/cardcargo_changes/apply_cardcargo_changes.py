from __future__ import annotations

import shutil
import sys
from pathlib import Path

BUNDLE = Path(__file__).resolve().parent


def project_root(arg: str | None) -> Path:
    base = Path(arg or '.').resolve()
    if (base / 'poketracker-pwa' / 'components' / 'inventory-workspace.tsx').exists():
        return base / 'poketracker-pwa'
    if (base / 'components' / 'inventory-workspace.tsx').exists():
        return base
    raise SystemExit('CardCargo project root not found. Pass the repository root or poketracker-pwa directory.')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')
    print(f'updated {path}')


def copy_new(root: Path, relative: str) -> None:
    source = BUNDLE / 'poketracker-pwa' / relative
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    print(f'added/updated {target}')


def patch_purchase_import(root: Path) -> None:
    path = root / 'components' / 'purchase-import-form.tsx'
    text = path.read_text(encoding='utf-8')
    text = replace_once(text, 'const MAX_IMAGES = 8', 'const MAX_IMAGES = 12', 'purchase image limit')
    write(path, text)

    path = root / 'lib' / 'importer' / 'schema.ts'
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        "remoteImageUrls: z.array(z.string().url().max(2_000)).max(8).default([]),",
        "remoteImageUrls: z.array(z.string().url().max(2_000)).max(12).default([]),",
        'remote image schema limit',
    )
    text = replace_once(
        text,
        'stagedImages: z.array(stagedImageSchema).max(8).default([]),',
        'stagedImages: z.array(stagedImageSchema).max(12).default([]),',
        'staged image schema limit',
    )
    text = replace_once(
        text,
        'if (value.remoteImageUrls.length + value.stagedImages.length > 8) {',
        'if (value.remoteImageUrls.length + value.stagedImages.length > 12) {',
        'combined image schema limit',
    )
    text = replace_once(
        text,
        'Pro Angebot k\u00f6nnen h\u00f6chstens acht Bilder archiviert werden.',
        'Pro Angebot k\u00f6nnen h\u00f6chstens zw\u00f6lf Bilder archiviert werden.',
        'combined image validation message',
    )
    write(path, text)


def patch_catalog_languages(root: Path) -> None:
    path = root / 'lib' / 'card-catalog-types.ts'
    text = path.read_text(encoding='utf-8')
    old = """  ['Chinese Traditional', 'Chinesisch (traditionell)'],
  ['Indonesian', 'Indonesisch'],
  ['Thai', 'Thail\u00e4ndisch'],
  ['Other', 'Andere'],"""
    new = """  ['Chinese Traditional', 'Chinesisch (traditionell)'],
  ['Chinese Simplified', 'Chinesisch (vereinfacht)'],
  ['Indonesian', 'Indonesisch'],
  ['Thai', 'Thail\u00e4ndisch'],
  ['Dutch', 'Niederl\u00e4ndisch'],
  ['Polish', 'Polnisch'],
  ['Russian', 'Russisch'],
  ['Other', 'Andere'],"""
    text = replace_once(text, old, new, 'catalog language options')
    old = """  Portuguese: 'pt-br',
  'Chinese Traditional': 'zh-tw',
  Indonesian: 'id',
  Thai: 'th',"""
    new = """  Portuguese: 'pt-br',
  Korean: 'ko',
  'Chinese Traditional': 'zh-tw',
  'Chinese Simplified': 'zh-cn',
  Indonesian: 'id',
  Thai: 'th',
  Dutch: 'nl',
  Polish: 'pl',
  Russian: 'ru',"""
    text = replace_once(text, old, new, 'TCGdex language mapping')
    write(path, text)


def patch_inventory_page(root: Path) -> None:
    path = root / 'app' / '(app)' / 'inventory' / 'page.tsx'
    text = path.read_text(encoding='utf-8')

    old = """      pokemonSpecies: string[]
      purchasedAt: string | null"""
    new = """      pokemonSpecies: string[]
      pokemonNameEn: string | null
      purchasedAt: string | null"""
    text = replace_once(text, old, new, 'item meta english name type')

    old = """      const sourceImages = [
        ...(item.purchase_id ? purchaseImagesByPurchase.get(item.purchase_id) ?? [] : []),"""
    new = """      const pokemonNameEn =
        item.pokemon_name_en || (pokemonSpecies.length ? pokemonSpecies.join(', ') : null)
      const sourceImages = [
        ...(item.purchase_id ? purchaseImagesByPurchase.get(item.purchase_id) ?? [] : []),"""
    text = replace_once(text, old, new, 'purchase item english name fallback')

    old = """        pokemonSpecies,
        purchasedAt: purchase?.purchased_at || null,"""
    new = """        pokemonSpecies,
        pokemonNameEn,
        purchasedAt: purchase?.purchased_at || null,"""
    text = replace_once(text, old, new, 'item meta english name value')

    text = replace_once(
        text,
        'pokemonNameEn: item.pokemon_name_en || null,',
        'pokemonNameEn,',
        'pending english name fallback',
    )

    text = replace_once(
        text,
        'pokemonNameEn: unit.pokemon_name_en || null,',
        "pokemonNameEn: unit.pokemon_name_en || meta?.pokemonNameEn || (pokemonSpecies.length ? pokemonSpecies.join(', ') : null),",
        'inventory unit english name fallback',
    )
    write(path, text)


BULK_MODAL = '''
function BulkEditModal({
  ids,
  onClose,
  onSaved,
}: {
  ids: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [enabled, setEnabled] = useState({
    notes: false,
    purchasedAt: false,
    arrivedAt: false,
    language: false,
    status: false,
  })
  const [notes, setNotes] = useState('')
  const [purchasedAt, setPurchasedAt] = useState('')
  const [arrivedAt, setArrivedAt] = useState('')
  const [language, setLanguage] = useState('Korean')
  const [status, setStatus] = useState('in_collection')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const changes: Record<string, string | null> = {}
    if (enabled.notes) changes.notes = notes
    if (enabled.purchasedAt) changes.purchasedAt = purchasedAt || null
    if (enabled.arrivedAt) changes.arrivedAt = arrivedAt || null
    if (enabled.language) changes.language = language
    if (enabled.status) changes.status = status

    if (!Object.keys(changes).length) {
      setError('W\u00e4hle mindestens ein Feld f\u00fcr die Massenbearbeitung aus.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/inventory/units/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ids, changes }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Massenbearbeitung konnte nicht gespeichert werden.')
      onSaved()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Massenbearbeitung konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="inv-modal inv-editor-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-bulk-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="inv-modal-head">
          <div>
            <span className="inv-kicker">{ids.length} Inventareintr\u00e4ge ausgew\u00e4hlt</span>
            <h2 id="inventory-bulk-title">Massenbearbeitung</h2>
          </div>
          <button type="button" className="inv-modal-close" onClick={onClose} aria-label="Schlie\u00dfen">\u00d7</button>
        </header>
        <form className="inv-editor-form" onSubmit={submit}>
          <p className="inv-muted-copy">Nur aktivierte Felder werden auf alle ausgew\u00e4hlten Karten angewendet. Alle anderen Werte bleiben unver\u00e4ndert.</p>

          <div className="inv-editor-grid">
            <label>
              <span><input type="checkbox" checked={enabled.purchasedAt} onChange={(event) => setEnabled((current) => ({ ...current, purchasedAt: event.target.checked }))} /> Gekauft am \u00e4ndern</span>
              <input type="date" value={purchasedAt} disabled={!enabled.purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} />
            </label>
            <label>
              <span><input type="checkbox" checked={enabled.arrivedAt} onChange={(event) => setEnabled((current) => ({ ...current, arrivedAt: event.target.checked }))} /> Angekommen am \u00e4ndern</span>
              <input type="date" value={arrivedAt} disabled={!enabled.arrivedAt} onChange={(event) => setArrivedAt(event.target.value)} />
            </label>
            <label>
              <span><input type="checkbox" checked={enabled.language} onChange={(event) => setEnabled((current) => ({ ...current, language: event.target.checked }))} /> Sprache \u00e4ndern</span>
              <select value={language} disabled={!enabled.language} onChange={(event) => setLanguage(event.target.value)}>
                {inventoryLanguageOptions.filter((option) => option.value !== 'Other').map((option) => (
                  <option key={option.value} value={option.value}>{option.flag} {option.label}</option>
                ))}
                <option value="Other">{inventoryLanguageFlag('Other')} Andere</option>
              </select>
            </label>
            <label>
              <span><input type="checkbox" checked={enabled.status} onChange={(event) => setEnabled((current) => ({ ...current, status: event.target.checked }))} /> Status \u00e4ndern</span>
              <select value={status} disabled={!enabled.status} onChange={(event) => setStatus(event.target.value)}>
                {EDITABLE_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
              </select>
            </label>
          </div>

          <label className="inv-editor-notes">
            <span><input type="checkbox" checked={enabled.notes} onChange={(event) => setEnabled((current) => ({ ...current, notes: event.target.checked }))} /> Kommentar / Notiz \u00e4ndern</span>
            <textarea rows={4} value={notes} disabled={!enabled.notes} onChange={(event) => setNotes(event.target.value)} placeholder="Gemeinsamer Kommentar f\u00fcr alle ausgew\u00e4hlten Karten" />
          </label>

          {error ? <div className="inv-alert inv-editor-error">{error}</div> : null}
          <footer className="inv-modal-actions">
            <button className="inv-button inv-button-muted" type="button" onClick={onClose}>Abbrechen</button>
            <button className="inv-button inv-button-primary" type="submit" disabled={saving}>{saving ? 'Speichern \u2026' : 'Auf Auswahl anwenden'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
'''


def patch_inventory_workspace(root: Path) -> None:
    path = root / 'components' / 'inventory-workspace.tsx'
    text = path.read_text(encoding='utf-8')

    old = "import { createClient } from '@/lib/supabase/client'"
    new = """import { createClient } from '@/lib/supabase/client'
import {
  inventoryLanguageFlag,
  inventoryLanguageLabel,
  inventoryLanguageOptions,
} from '@/lib/inventory-languages'"""
    text = replace_once(text, old, new, 'inventory language import')

    old = """function speciesLabel(species: string[]) {
  return species.length ? species.join(', ') : 'Pok\u00e9mon-Art nicht gesetzt'
}"""
    new = """function speciesLabel(species: string[], pokemonNameEn?: string | null, itemName?: string) {
  if (species.length) return species.join(', ')
  const derived = deriveSpeciesFromEditableFields(itemName ?? '', pokemonNameEn ?? '')
  if (derived.length) return derived.join(', ')
  return pokemonNameEn?.trim() || 'Pok\u00e9mon-Art nicht gesetzt'
}"""
    text = replace_once(text, old, new, 'species display fallback')

    old = """  onChange,
  accent = 'green',
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  accent?: 'green' | 'brown'
}) {"""
    new = """  onChange,
  accent = 'green',
  formatOption,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  accent?: 'green' | 'brown'
  formatOption?: (value: string) => string
}) {"""
    text = replace_once(text, old, new, 'accordion formatter signature')
    text = replace_once(text, '<strong>{value}</strong>', '<strong>{formatOption ? formatOption(value) : value}</strong>', 'accordion formatter trigger')
    text = replace_once(text, '              {option}\n', '              {formatOption ? formatOption(option) : option}\n', 'accordion formatter option')

    old = """            <label>
              <span>Sprache</span>
              <input value={draft.language} onChange={(event) => field('language', event.target.value)} placeholder="Korean" />
            </label>"""
    new = """            <label>
              <span>Sprache</span>
              <select value={draft.language} onChange={(event) => field('language', event.target.value)}>
                {inventoryLanguageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.flag} {option.label}</option>
                ))}
              </select>
            </label>"""
    text = replace_once(text, old, new, 'inventory editor language select')

    marker = 'function InventoryImagesModal({'
    if BULK_MODAL.strip() not in text:
        text = replace_once(text, marker, BULK_MODAL + '\n' + marker, 'bulk editor modal')

    old = """  const [imageUnit, setImageUnit] = useState<InventoryWorkspaceUnit | null>(null)"""
    new = """  const [imageUnit, setImageUnit] = useState<InventoryWorkspaceUnit | null>(null)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)"""
    text = replace_once(text, old, new, 'bulk modal state')

    old = """  const languageOptions = useMemo(
    () => ['Alle', ...uniqueValues(rows.map((row) => row.language))],
    [rows],
  )"""
    new = """  const languageOptions = useMemo(() => {
    const configured = inventoryLanguageOptions.map((option) => String(option.value))
    const extras = uniqueValues(rows.map((row) => row.language)).filter((value) => !configured.includes(value))
    return ['Alle', ...configured, ...extras]
  }, [rows])"""
    text = replace_once(text, old, new, 'complete language filter options')

    old = '<AccordionFilter label="Sprache" value={language} options={languageOptions} onChange={setLanguage} />'
    new = '<AccordionFilter label="Sprache" value={language} options={languageOptions} onChange={setLanguage} formatOption={(value) => value === \'Alle\' ? \'Alle\' : inventoryLanguageLabel(value)} />'
    text = replace_once(text, old, new, 'language filter flag labels')

    old = """            <div className="inv-table-actions">
              {selected.size ? (
                <>
                  <span>{selected.size} ausgew\u00e4hlt</span>
                  <button className="inv-button inv-button-muted" type="button" onClick={() => exportRows(filtered.filter((row) => row.unitId && selected.has(row.unitId)))}>Auswahl exportieren</button>
                  <button className="inv-button inv-button-danger" type="button" disabled={deleting} onClick={deleteSelected}>{deleting ? 'L\u00f6schen \u2026' : 'L\u00f6schen'}</button>
                </>
              ) : (
                <button className="inv-button inv-button-muted" type="button" onClick={() => exportRows(filtered)} disabled={!filtered.length}>CSV exportieren</button>
              )}
            </div>"""
    new = """            <div className="inv-table-actions">
              <button className="inv-button inv-button-muted" type="button" onClick={() => exportRows(filtered)} disabled={!filtered.length}>CSV exportieren</button>
              <button className="inv-button inv-button-muted" type="button" disabled={!selected.size} onClick={() => setBulkEditOpen(true)}>Massenbearbeitung</button>
              {selected.size ? (
                <>
                  <span>{selected.size} ausgew\u00e4hlt</span>
                  <button className="inv-button inv-button-muted" type="button" onClick={() => exportRows(filtered.filter((row) => row.unitId && selected.has(row.unitId)))}>Auswahl exportieren</button>
                  <button className="inv-button inv-button-danger" type="button" disabled={deleting} onClick={deleteSelected}>{deleting ? 'L\u00f6schen \u2026' : 'L\u00f6schen'}</button>
                </>
              ) : null}
            </div>"""
    text = replace_once(text, old, new, 'bulk edit table action')

    old = """                  <th>Karte</th>
                  <th>Set</th>
                  <th>Nr.</th>
                  <th>Sprache</th>"""
    new = """                  <th>Karte</th>
                  <th>Sprache</th>
                  <th>Set</th>
                  <th>Nr.</th>"""
    text = replace_once(text, old, new, 'table language/set column order')

    text = replace_once(
        text,
        '<small className="inv-species-line">{speciesLabel(row.pokemonSpecies)}</small>',
        '<small className="inv-species-line">{speciesLabel(row.pokemonSpecies, row.pokemonNameEn, row.itemName)}</small>',
        'species display English fallback',
    )

    old = """                        <td>
                          <strong className="inv-table-main">{row.setName || '\u2013'}</strong>
                          <small>{row.setCode || 'Kein Setcode'}</small>
                        </td>
                        <td className="inv-mono">{row.cardNumber || '\u2013'}</td>
                        <td>{row.language || '\u2013'}</td>"""
    new = """                        <td title={row.language ? inventoryLanguageLabel(row.language) : undefined} aria-label={row.language ? inventoryLanguageLabel(row.language) : 'Sprache nicht gesetzt'}>
                          {row.language ? <span aria-hidden="true">{inventoryLanguageFlag(row.language)}</span> : '\u2013'}
                        </td>
                        <td>
                          <strong className="inv-table-main">{row.setName || '\u2013'}</strong>
                          <small>{row.setCode || 'Kein Setcode'}</small>
                        </td>
                        <td className="inv-mono">{row.cardNumber || '\u2013'}</td>"""
    text = replace_once(text, old, new, 'table language flags and order')

    old = """      {imageUnit ? (
        <InventoryImagesModal"""
    new = """      {bulkEditOpen ? (
        <BulkEditModal
          ids={[...selected]}
          onClose={() => setBulkEditOpen(false)}
          onSaved={() => {
            setSelected(new Set())
            router.refresh()
          }}
        />
      ) : null}
      {imageUnit ? (
        <InventoryImagesModal"""
    text = replace_once(text, old, new, 'bulk modal render')

    write(path, text)


def main() -> None:
    root = project_root(sys.argv[1] if len(sys.argv) > 1 else None)
    patch_purchase_import(root)
    patch_catalog_languages(root)
    patch_inventory_page(root)
    patch_inventory_workspace(root)
    copy_new(root, 'lib/inventory-languages.ts')
    copy_new(root, 'app/api/inventory/units/bulk/route.ts')
    copy_new(root, 'supabase/migrations/0018_inventory_species_language_bulk.sql')
    print('\nCardCargo patch applied. Next: run Supabase migrations, then npm run typecheck && npm run lint && npm run build.')


if __name__ == '__main__':
    main()
