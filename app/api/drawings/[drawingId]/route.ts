import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { parseRotationForUpdate, parseZoomForUpdate } from '@/lib/drawing-view-settings'

type Params = { params: Promise<{ drawingId: string }> }

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
  const rotation = body.rotation !== undefined ? parseRotationForUpdate(body.rotation) : undefined
  const zoom = body.zoom !== undefined ? parseZoomForUpdate(body.zoom) : undefined

  console.log('update drawing view settings request:', {
    drawingId,
    rotation: body.rotation,
    zoom: body.zoom,
  })

  if (rotation === undefined && zoom === undefined) {
    return NextResponse.json({ error: 'rotation or zoom is required' }, { status: 400 })
  }
  if (body.rotation !== undefined && rotation === undefined) {
    return NextResponse.json({ error: 'invalid rotation' }, { status: 400 })
  }
  if (body.zoom !== undefined && zoom === undefined) {
    return NextResponse.json({ error: 'invalid zoom' }, { status: 400 })
  }

  const updatePayload: { rotation?: number; zoom?: number } = {}
  if (rotation !== undefined) updatePayload.rotation = rotation
  if (zoom !== undefined) updatePayload.zoom = zoom

  const { data, error } = await client
    .from('drawings')
    .update(updatePayload)
    .eq('id', drawingId)
    .eq('tenant_id', tenantId)
    .select('id, project_id, floor_label, rotation, zoom')
    .single()

  if (error) {
    console.error('update drawing view settings error:', {
      drawingId,
      tenantId,
      error,
    })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  console.log('drawing view settings saved:', data)
  return NextResponse.json({ drawing: data })
}
