const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'app/api/shipments/olaeet-import/route.ts'
const file = path.join(appRoot, rel)

if (!fs.existsSync(file)) {
  throw new Error(`Datei nicht gefunden: ${rel}`)
}

let source = fs.readFileSync(file, 'utf8')
const original = source

const typeAnchor = "type SupabaseClient = Awaited<ReturnType<typeof getApiUser>>['supabase']"
const responseType = `type GenericMutationResult = {\n  data: unknown\n  error: { message: string } | null\n}`

if (!source.includes(responseType)) {
  if (!source.includes(typeAnchor)) {
    throw new Error('v91: SupabaseClient-Typanker wurde nicht gefunden.')
  }

  source = source.replace(
    typeAnchor,
    `${typeAnchor}\n\n${responseType}`,
  )
}

const oldBlock = `    const response = existingId
      ? await supabase
          .from(table as never)
          .update(payload as never)
          .eq('id' as never, existingId as never)
          .select('*')
          .single()
      : await supabase
          .from(table as never)
          .insert(payload as never)
          .select('*')
          .single()

    if (!response.error) {`

const newBlock = `    const rawResponse = existingId
      ? await supabase
          .from(table as never)
          .update(payload as never)
          .eq('id' as never, existingId as never)
          .select('*')
          .single()
      : await supabase
          .from(table as never)
          .insert(payload as never)
          .select('*')
          .single()

    // With a runtime table name Supabase cannot infer the row type here and
    // may collapse the conditional result to never. The query itself is
    // valid; widen only its response shape before reading data/error.
    const response = rawResponse as unknown as GenericMutationResult

    if (!response.error) {`

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock)
} else if (!source.includes('const response = rawResponse as unknown as GenericMutationResult')) {
  throw new Error(
    'v91: writeShipmentWithRepair-Block wurde nicht in der erwarteten v90-Form gefunden.',
  )
}

if (source === original) {
  console.log(`Bereits korrekt: ${rel}`)
  process.exit(0)
}

const backup = `${file}.bak-v91`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
fs.writeFileSync(file, source)
console.log(`Repariert: ${rel}`)
