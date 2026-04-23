import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { DRAWING_SIGNED_URL_TTL_SECONDS } from '@/lib/storage'

type Params = { params: Promise<{ drawingId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { drawingId } = await params

  const { data: drawing, error: drawingError } = await client
    .from('drawings')
    .select('*')
    .eq('id', drawingId)
    .eq('tenant_id', tenantId)
    .single()
  if (drawingError) {
    console.error('drawing fetch error:', {
      tenantId,
      drawingId,
      error: drawingError,
    })
  } else if (drawing) {
    console.info('drawing record resolved for editor:', {
      drawingId: drawing.id,
      fileName: drawing.file_name ?? null,
      filePath: drawing.file_path ?? null,
      storagePath: drawing.file_path ?? null,
      imageCount: Array.isArray(drawing.page_images) ? drawing.page_images.length : 0,
      bucket: 'drawings-pdf',
    })
  }

  const { data: issues, error } = await client
    .from('issues')
    .select('*, contractor:contractors(id,name)')
    .eq('drawing_id', drawingId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('issues fetch error:', {
      tenantId,
      drawingId,
      error,
    })
    return NextResponse.json({ drawing: drawing ?? null, issues: [] })
  }

  let signedUrl: string | null = null
  if (drawing) {
    console.log("drawing:", drawing)
    console.log("resolved bucket:", "drawings-pdf")
    console.log("resolved file_path:", drawing.file_path)
    const { data, error } = await client.storage
      .from('drawings-pdf')
      .createSignedUrl(drawing.file_path, DRAWING_SIGNED_URL_TTL_SECONDS)
    if (error) {
      console.error("pdf signed url error:", error)
    }
    signedUrl = data?.signedUrl ?? null
    console.log("signedUrl:", signedUrl)
  }
  const drawingWithStoragePath = drawing
    ? {
        ...drawing,
        storage_path: drawing.file_path ?? null,
        original_pdf_path: drawing.file_path ?? null,
        page_images: Array.isArray(drawing.page_images) ? (drawing.page_images as string[]) : [],
        signed_page_urls: [],
        signed_url: signedUrl,
        file_name: drawing.file_name ?? null,
      }
    : null
  return NextResponse.json({ drawing: drawingWithStoragePath, issues: issues ?? [] })
}

export async function POST(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId, user } = authed
  const { drawingId } = await params
  const body = (await request.json()) as {
    page_index?: number
    floor_label?: string
    x_ratio?: number
    y_ratio?: number
    callout_x_ratio?: number
    callout_y_ratio?: number
    pin_x?: number
    pin_y?: number
    callout_x?: number
    callout_y?: number
    issue_type?: string
    issue_text?: string
    contractor_id?: string
    status?: string
  }

  const { data: drawing, error: drawingError } = await client
    .from('drawings')
    .select('project_id,floor_label')
    .eq('id', drawingId)
    .eq('tenant_id', tenantId)
    .single()

  if (drawingError || !drawing) {
    return NextResponse.json({ error: 'drawing が見つかりません' }, { status: 404 })
  }

  if (
    body.page_index === undefined ||
    (body.pin_x === undefined && body.x_ratio === undefined) ||
    (body.pin_y === undefined && body.y_ratio === undefined) ||
    (body.callout_x === undefined && body.callout_x_ratio === undefined) ||
    (body.callout_y === undefined && body.callout_y_ratio === undefined) ||
    !body.issue_type ||
    !body.issue_text ||
    !body.contractor_id
  ) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  const { data, error } = await client
    .from('issues')
    .insert({
      tenant_id: tenantId,
      project_id: drawing.project_id,
      drawing_id: drawingId,
      page_index: body.page_index,
      floor_label: body.floor_label ?? drawing.floor_label,
      pin_x: body.pin_x ?? body.x_ratio,
      pin_y: body.pin_y ?? body.y_ratio,
      callout_x: body.callout_x ?? body.callout_x_ratio,
      callout_y: body.callout_y ?? body.callout_y_ratio,
      issue_type: body.issue_type,
      issue_text: body.issue_text,
      contractor_id: body.contractor_id,
      status: body.status ?? 'open',
      created_by: user.id,
    })
    .select('*, contractor:contractors(id,name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ issue: data })
}
