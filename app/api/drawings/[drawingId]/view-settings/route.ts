import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'

type Params = { params: Promise<{ drawingId: string }> }

const VALID_ROTATIONS = new Set([0, 90, 180, 270])
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5

function normalizeRotation(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return undefined
  const normalized = ((numeric % 360) + 360) % 360
  const snapped = normalized === 360 ? 0 : normalized
  if (!VALID_ROTATIONS.has(snapped)) return undefined
  return snapped
}

function normalizeZoom(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, numeric))
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { drawingId } = await params

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 })
  }

  const body = (await request.json()) as Record<string, unknown>
  const rotation = body.rotation !== undefined ? normalizeRotation(body.rotation) : undefined
  const zoom = body.zoom !== undefined ? normalizeZoom(body.zoom) : undefined

  if (rotation === undefined && zoom === undefined) {
    return NextResponse.json({ error: 'rotation or zoom is required' }, { status: 400 })
  }
  if (body.rotation !== undefined && rotation === undefined) {
    return NextResponse.json({ error: 'invalid rotation' }, { status: 400 })
  }
  if (body.zoom !== undefined && zoom === undefined) {
    return NextResponse.json({ error: 'invalid zoom' }, { status: 400 })
  }

  const updatePayload: {
    rotation?: number
    zoom?: number
    view_updated_at: string
  } = {
    view_updated_at: new Date().toISOString(),
  }
  if (rotation !== undefined) updatePayload.rotation = rotation
  if (zoom !== undefined) updatePayload.zoom = zoom

  const { data, error } = await client
    .from('drawings')
    .update(updatePayload)
    .eq('id', drawingId)
    .eq('tenant_id', tenantId)
    .select('id, rotation, zoom, view_updated_at')
    .single()

  if (error) {
    console.error('save drawing view settings error:', {
      drawingId,
      tenantId,
      error,
    })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ drawing: data })
}
