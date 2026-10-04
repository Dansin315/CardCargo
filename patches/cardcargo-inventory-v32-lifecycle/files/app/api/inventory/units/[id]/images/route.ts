import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import {
  archiveInventoryUnitImages,
  removeInventoryUnitImages,
  type InventorySourceImageSelection,
  type StagedInventoryImageInput,
} from '@/lib/inventory-images'

function stagedImages(value: unknown): StagedInventoryImageInput[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      path: String(entry.path ?? ''),
      originalName: String(entry.originalName ?? 'Bild'),
      mimeType: String(entry.mimeType ?? ''),
      byteSize: Number(entry.byteSize ?? 0),
    }))
    .filter((entry) => entry.path && entry.mimeType && Number.isFinite(entry.byteSize))
}

function sourceSelections(value: unknown): InventorySourceImageSelection[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      sourceType: String(entry.sourceType ?? '') as InventorySourceImageSelection['sourceType'],
      sourceImageId: String(entry.sourceImageId ?? ''),
    }))
    .filter(
      (entry) =>
        (entry.sourceType === 'purchase' || entry.sourceType === 'warehouse_package') &&
        entry.sourceImageId,
    )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { user } = await requireUser()

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  try {
    const result = await archiveInventoryUnitImages({
      userId: user.id,
      inventoryUnitId: id,
      stagedImages: stagedImages(body.stagedImages),
      sourceSelections: sourceSelections(body.sourceSelections),
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bilder konnten nicht gespeichert werden.' },
      { status: 400 },
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { user } = await requireUser()

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const imageIds = Array.isArray(body.imageIds)
    ? [...new Set(body.imageIds.filter((value): value is string => typeof value === 'string'))].slice(0, 24)
    : []

  if (!imageIds.length) {
    return NextResponse.json({ error: 'Keine Bilder ausgewählt.' }, { status: 400 })
  }

  try {
    const deleted = await removeInventoryUnitImages({
      userId: user.id,
      inventoryUnitId: id,
      imageIds,
    })
    return NextResponse.json({ deleted })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bilder konnten nicht gelöscht werden.' },
      { status: 400 },
    )
  }
}
