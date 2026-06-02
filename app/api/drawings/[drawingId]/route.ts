import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { parseRotationForUpdate, parseZoomForUpdate } from '@/lib/drawing-view-settings'
import {
  createDrawingPdfSignedUrl,
  createDrawingPreviewSignedUrl,
} from '@/lib/drawing-signed-url'

type Params = { params: Promise<{ drawingId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { drawingId } = await params

  const { data: drawing, error } = await client
    .from('drawings')
    .select('*')
    .eq('id', drawingId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !drawing) {
    console.error('drawing fetch error:', { drawingId, tenantId, error })
    return NextResponse.json({ error: '図面が見つかりません' }, { status: 404 })
  }

  const pageImages = Array.isArray(drawing.page_images) ? (drawing.page_images as string[]) : []
  const storagePath = drawing.file_path ?? drawing.original_pdf_path ?? null
  const [pdfSignedUrl, imageSignedUrl] = await Promise.all([
    createDrawingPdfSignedUrl(client, { ...drawing, storage_path: storagePath }),
    createDrawingPreviewSignedUrl(client, { ...drawing, page_images: pageImages }),
  ])

  console.log('drawing pdf signedUrl:', pdfSignedUrl ? 'ok' : 'null', {
    drawingId: drawing.id,
    storage_path: storagePath,
    file_path: drawing.file_path,
    original_pdf_path: drawing.original_pdf_path,
  })

  return NextResponse.json({
    ...drawing,
    storage_path: storagePath,
    original_pdf_path: drawing.original_pdf_path ?? drawing.file_path ?? null,
    page_images: pageImages,
    signed_url: pdfSignedUrl,
    signedUrl: pdfSignedUrl,
    pdf_signed_url: pdfSignedUrl,
    image_signed_url: imageSignedUrl,
  })
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
