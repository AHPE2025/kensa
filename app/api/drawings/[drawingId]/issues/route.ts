import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { attachIssuePhotoSignedUrls } from '@/lib/issue-photos'
import { DRAWING_SIGNED_URL_TTL_SECONDS } from '@/lib/storage'

type Params = { params: Promise<{ drawingId: string }> }

function toRatio(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(1, Math.max(0, numeric))
}

function resolveOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

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

  const issuesWithPhotoUrls = await Promise.all(
    (issues ?? []).map((issue) => attachIssuePhotoSignedUrls(client, issue)),
  )

  return NextResponse.json({ drawing: drawingWithStoragePath, issues: issuesWithPhotoUrls })
}

export async function POST(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId, user } = authed
  const { drawingId } = await params

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 })
  }

  const body = (await request.json()) as Record<string, unknown>

  console.log('issue request body:', body)
  console.log('before photo path:', body.before_photo_path ?? null)
  console.log('after photo path:', body.after_photo_path ?? null)

  const { data: drawing, error: drawingError } = await client
    .from('drawings')
    .select('project_id,floor_label')
    .eq('id', drawingId)
    .eq('tenant_id', tenantId)
    .single()

  if (drawingError || !drawing) {
    console.error('create issue error:', drawingError ?? 'drawing not found')
    return NextResponse.json({ error: 'drawing が見つかりません', details: drawingError }, { status: 404 })
  }

  const resolvedPinX = body.pin_x ?? body.x_ratio
  const resolvedPinY = body.pin_y ?? body.y_ratio
  const resolvedProjectId = drawing.project_id

  const missing: string[] = []
  if (!tenantId) missing.push('tenant_id')
  if (!resolvedProjectId) missing.push('project_id')
  if (!drawingId) missing.push('drawing_id')
  if (resolvedPinX === undefined || resolvedPinX === null) missing.push('pin_x')
  if (resolvedPinY === undefined || resolvedPinY === null) missing.push('pin_y')

  if (missing.length > 0) {
    console.error('create issue error:', { error: '必須項目が不足しています', missing, received: body })
    return NextResponse.json(
      {
        error: '必須項目が不足しています',
        missing,
        received: body,
      },
      { status: 400 },
    )
  }

  const pinX = toRatio(resolvedPinX, 0)
  const pinY = toRatio(resolvedPinY, 0)

  const resolvedPageIndex =
    body.page_index === undefined || body.page_index === null
      ? 0
      : typeof body.page_index === 'number'
        ? body.page_index
        : Number.isFinite(Number(body.page_index))
          ? Number(body.page_index)
          : 0
  const resolvedFloorLabel =
    (typeof body.floor_label === 'string' ? body.floor_label.trim() : '') ||
    drawing.floor_label ||
    '1F'
  const defaultCalloutX = toRatio(pinX + 0.05, pinX)
  const defaultCalloutY = toRatio(pinY - 0.05, pinY)
  const resolvedCalloutX = toRatio(
    body.callout_x ?? body.callout_x_ratio ?? defaultCalloutX,
    defaultCalloutX,
  )
  const resolvedCalloutY = toRatio(
    body.callout_y ?? body.callout_y_ratio ?? defaultCalloutY,
    defaultCalloutY,
  )
  const resolvedIssueType =
    resolveOptionalString(body.issue_type) ?? resolveOptionalString(body.issue_category) ?? 'その他'
  const resolvedIssueText =
    typeof body.issue_text === 'string' ? body.issue_text.trim() : ''
  const resolvedContractorId = resolveOptionalString(body.contractor_id)
  const resolvedIssueCategory =
    resolveOptionalString(body.issue_category) ??
    resolveOptionalString(body.issue_type) ??
    null

  const beforePhotoPath = resolveOptionalString(body.before_photo_path)
  const afterPhotoPath = resolveOptionalString(body.after_photo_path)

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    project_id: drawing.project_id,
    drawing_id: drawingId,
    page_index: resolvedPageIndex,
    floor_label: resolvedFloorLabel,
    pin_x: pinX,
    pin_y: pinY,
    callout_x: resolvedCalloutX,
    callout_y: resolvedCalloutY,
    issue_type: resolvedIssueType,
    issue_text: resolvedIssueText,
    contractor_id: resolvedContractorId,
    status: typeof body.status === 'string' ? body.status : '未対応',
    before_photo_path: beforePhotoPath,
    after_photo_path: afterPhotoPath,
    issue_category: resolvedIssueCategory,
    created_by: user?.id ?? null,
  }

  console.log('issue insert payload:', JSON.stringify(payload, null, 2))

  const { data, error } = await client
    .from('issues')
    .insert(payload)
    .select('*, contractor:contractors(id,name)')
    .single()

  if (error) {
    console.error('create issue error:', error)
    return NextResponse.json(
      {
        error: '指摘保存に失敗しました',
        details: error.message,
        received: payload,
      },
      { status: 400 },
    )
  }

  const issueWithUrls = data ? await attachIssuePhotoSignedUrls(client, data) : null
  return NextResponse.json({ issue: issueWithUrls })
}
