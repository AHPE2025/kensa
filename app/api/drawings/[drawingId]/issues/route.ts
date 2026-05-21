import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import {
  attachIssuePhotoSignedUrls,
  createTempIssueFolderId,
  uploadIssuePhotoFile,
} from '@/lib/issue-photos'
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
  let body: Record<string, unknown> = {}
  let beforePhotoFile: File | null = null
  let afterPhotoFile: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const payloadRaw = formData.get('payload')
    body = payloadRaw ? (JSON.parse(String(payloadRaw)) as Record<string, unknown>) : {}
    const beforePhoto = formData.get('before_photo')
    const afterPhoto = formData.get('after_photo')
    beforePhotoFile = beforePhoto instanceof File && beforePhoto.size > 0 ? beforePhoto : null
    afterPhotoFile = afterPhoto instanceof File && afterPhoto.size > 0 ? afterPhoto : null
  } else {
    body = (await request.json()) as Record<string, unknown>
  }

  console.log('issue request body:', body)
  console.log('before photo file:', beforePhotoFile)
  console.log('after photo file:', afterPhotoFile)

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
  const issueType = typeof body.issue_type === 'string' ? body.issue_type.trim() : ''
  const issueText = typeof body.issue_text === 'string' ? body.issue_text.trim() : ''

  const missing: string[] = []
  if (resolvedPinX === undefined) missing.push('pin_x')
  if (resolvedPinY === undefined) missing.push('pin_y')
  if (!issueType) missing.push('issue_type')
  if (!issueText) missing.push('issue_text')

  if (missing.length > 0) {
    console.error('create issue error:', { error: '必須項目が不足しています', missing })
    return NextResponse.json(
      { error: '必須項目が不足しています', missing, details: { drawingId } },
      { status: 400 },
    )
  }

  const resolvedPageIndex = typeof body.page_index === 'number' ? body.page_index : 0
  const resolvedFloorLabel =
    (typeof body.floor_label === 'string' ? body.floor_label.trim() : '') || drawing.floor_label
  const resolvedCalloutX = body.callout_x ?? body.callout_x_ratio ?? (resolvedPinX as number) + 0.05
  const resolvedCalloutY = body.callout_y ?? body.callout_y_ratio ?? (resolvedPinY as number) - 0.05
  const resolvedContractorId =
    typeof body.contractor_id === 'string' && body.contractor_id.trim() ? body.contractor_id : null
  const resolvedIssueCategory =
    typeof body.issue_category === 'string' ? body.issue_category.trim() || null : null

  const tempFolderId = createTempIssueFolderId()
  let beforePhotoPath: string | null = null
  let afterPhotoPath: string | null = null

  try {
    if (beforePhotoFile) {
      beforePhotoPath = await uploadIssuePhotoFile(
        client,
        tenantId,
        drawing.project_id,
        drawingId,
        tempFolderId,
        'before',
        beforePhotoFile,
      )
      console.log('before photo path:', beforePhotoPath)
    }
    if (afterPhotoFile) {
      afterPhotoPath = await uploadIssuePhotoFile(
        client,
        tenantId,
        drawing.project_id,
        drawingId,
        tempFolderId,
        'after',
        afterPhotoFile,
      )
      console.log('after photo path:', afterPhotoPath)
    }
  } catch (error) {
    console.error('photo upload error:', error)
    return NextResponse.json({ error: '写真のアップロードに失敗しました' }, { status: 400 })
  }

  const insertBase = {
    tenant_id: tenantId,
    project_id: drawing.project_id,
    drawing_id: drawingId,
    page_index: resolvedPageIndex,
    floor_label: resolvedFloorLabel,
    pin_x: resolvedPinX,
    pin_y: resolvedPinY,
    callout_x: resolvedCalloutX,
    callout_y: resolvedCalloutY,
    issue_type: issueType,
    issue_text: issueText,
    contractor_id: resolvedContractorId,
    status: typeof body.status === 'string' ? body.status : '未対応',
    before_photo_path: beforePhotoPath,
    after_photo_path: afterPhotoPath,
    created_by: user.id,
  }

  let data: Record<string, unknown> | null = null
  let error: { message: string } | null = null

  const firstTry = await client
    .from('issues')
    .insert({
      ...insertBase,
      issue_category: resolvedIssueCategory,
    })
    .select('*, contractor:contractors(id,name)')
    .single()
  data = firstTry.data as Record<string, unknown> | null
  error = firstTry.error

  if (error && /issue_category|before_photo_path|after_photo_path/i.test(error.message)) {
    const fallbackPayload = { ...insertBase, issue_category: resolvedIssueCategory }
    delete (fallbackPayload as Record<string, unknown>).before_photo_path
    delete (fallbackPayload as Record<string, unknown>).after_photo_path

    const fallbackTry = await client
      .from('issues')
      .insert(fallbackPayload)
      .select('*, contractor:contractors(id,name)')
      .single()
    data = fallbackTry.data as Record<string, unknown> | null
    error = fallbackTry.error
  }

  if (error) {
    console.error('create issue error:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 400 })
  }

  const issueWithUrls = data ? await attachIssuePhotoSignedUrls(client, data) : null
  return NextResponse.json({ issue: issueWithUrls })
}
