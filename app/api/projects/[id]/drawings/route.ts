import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, getAuthedUser } from '@/lib/api-auth'
import { toAsciiFileName } from '@/lib/filename'
import {
  DRAWING_IMAGES_BUCKET,
  DRAWING_SIGNED_URL_TTL_SECONDS,
  DRAWINGS_PDF_BUCKET,
} from '@/lib/storage'
import { createServiceRoleClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id } = await params

  const { data: drawings, error } = await client
    .from('drawings')
    .select('*')
    .eq('project_id', id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('drawings fetch error:', {
      tenantId,
      projectId: id,
      error,
    })
    return NextResponse.json({ drawings: [] })
  }

  const drawingIds = (drawings ?? []).map((d) => d.id)
  const { data: issues, error: issueError } =
    drawingIds.length === 0
      ? { data: [] as Array<{ drawing_id: string }>, error: null }
      : await client.from('issues').select('drawing_id').in('drawing_id', drawingIds).eq('tenant_id', tenantId)

  if (issueError) {
    console.error('drawing issues count fetch error:', {
      tenantId,
      projectId: id,
      error: issueError,
    })
  }

  const countMap = new Map<string, number>()
  for (const idValue of drawingIds) countMap.set(idValue, 0)
  for (const issue of issues ?? []) countMap.set(issue.drawing_id, (countMap.get(issue.drawing_id) ?? 0) + 1)

  const rows = await Promise.all(
    (drawings ?? []).map(async (d) => {
      const pageImages = Array.isArray(d.page_images) ? (d.page_images as string[]) : []
      const previewImagePath = pageImages[0] ?? null
      const { data: signed } = previewImagePath
        ? await client.storage
            .from(DRAWING_IMAGES_BUCKET)
            .createSignedUrl(previewImagePath, DRAWING_SIGNED_URL_TTL_SECONDS)
        : { data: null as { signedUrl?: string | null } | null }
      return {
        ...d,
        issue_count: countMap.get(d.id) ?? 0,
        signed_url: signed?.signedUrl ?? null,
        storage_path: d.storage_path ?? d.original_pdf_path ?? d.file_path ?? null,
        file_name:
          d.file_name ??
          ((d.original_pdf_path ?? d.file_path ?? '')
            ? (d.original_pdf_path ?? d.file_path ?? '').split('/').pop() ?? null
            : null),
        page_images: pageImages,
      }
    })
  )
  return NextResponse.json({ drawings: rows })
}

export async function POST(request: NextRequest, { params }: Params) {
  const authed = await getAuthedUser(request)
  if ('error' in authed) return authed.error
  const { client: userClient, user } = authed
  const { id: projectId } = await params

  const form = await request.formData()
  const floorLabel = String(form.get('floorLabel') ?? '').trim() || '未設定'
  const file = form.get('file')

  if (!(file instanceof File)) {
    console.error('drawings upload error:', { projectId, userId: user.id, reason: 'file is missing' })
    return NextResponse.json({ error: 'file が必須です' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    console.error('drawings profile fetch error:', { projectId, userId: user.id, error: profileError })
  }

  const serviceClient = createServiceRoleClient()
  const { data: project, error: projectError } = await serviceClient
    .from('projects')
    .select('tenant_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) {
    console.error('drawings project fetch error:', { projectId, userId: user.id, error: projectError })
  }

  const tenantId = profile?.tenant_id ?? project?.tenant_id
  if (!tenantId) {
    console.error('drawings tenant resolve error:', {
      projectId,
      userId: user.id,
      profileTenantId: profile?.tenant_id ?? null,
      projectTenantId: project?.tenant_id ?? null,
    })
    return NextResponse.json({ error: 'tenant_id を特定できませんでした' }, { status: 400 })
  }

  const baseName = toAsciiFileName(file.name.replace(/\.pdf$/i, ''))
  const bytes = Buffer.from(await file.arrayBuffer())
  const savedFileName = `${Date.now()}_${baseName}.pdf`
  const drawingId = crypto.randomUUID()
  const originalPdfPath = `${tenantId}/${projectId}/original/${savedFileName}`

  const pdfServiceUrl = process.env.PDF_SERVICE_URL
  if (!pdfServiceUrl) {
    return NextResponse.json({ error: 'PDF_SERVICE_URL is missing' }, { status: 500 })
  }
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
  let pdfServiceHost = ''
  try {
    pdfServiceHost = new URL(pdfServiceUrl).hostname.toLowerCase()
  } catch {
    return NextResponse.json({ error: `Invalid PDF_SERVICE_URL: ${pdfServiceUrl}` }, { status: 500 })
  }
  if (isProduction && ['localhost', '127.0.0.1', '::1'].includes(pdfServiceHost)) {
    return NextResponse.json(
      { error: `PDF_SERVICE_URL cannot use localhost in production: ${pdfServiceUrl}` },
      { status: 500 }
    )
  }

  const renderUrl = `${pdfServiceUrl.replace(/\/$/, '')}/render-pages`
  let renderResponse: Response
  let renderText = ''
  try {
    renderResponse = await fetch(renderUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdf_file_base64: bytes.toString('base64'),
      }),
    })
    renderText = await renderResponse.text()
  } catch {
    return NextResponse.json({ error: 'PDF画像化サービスに接続できませんでした' }, { status: 502 })
  }
  let renderPayload: {
    page_count?: number
    images_base64?: string[]
    detail?: string
  }
  try {
    renderPayload = (renderText ? JSON.parse(renderText) : {}) as {
      page_count?: number
      images_base64?: string[]
      detail?: string
    }
  } catch {
    renderPayload = {}
  }
  const convertedPageCount = Number(renderPayload.page_count ?? renderPayload.images_base64?.length ?? 0)
  console.log('drawings render-pages result:', {
    requestUrl: renderUrl,
    status: renderResponse.status,
    responseBody: renderText,
    convertedPageCount,
  })
  if (!renderResponse.ok || !Array.isArray(renderPayload.images_base64) || renderPayload.images_base64.length === 0) {
    return NextResponse.json(
      { error: renderPayload.detail ?? 'PDFを画像化できませんでした' },
      { status: 400 }
    )
  }

  const pageCount = Number(renderPayload.page_count ?? renderPayload.images_base64.length ?? 0)
  const pageImagesBase64 = renderPayload.images_base64

  const { error: uploadError } = await serviceClient.storage
    .from(DRAWINGS_PDF_BUCKET)
    .upload(originalPdfPath, bytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error('drawings storage upload error:', {
      projectId,
      userId: user.id,
      tenantId,
      storagePath: originalPdfPath,
      bucket: DRAWINGS_PDF_BUCKET,
      error: uploadError,
    })
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  const pageImagePaths: string[] = []
  for (let index = 0; index < pageImagesBase64.length; index += 1) {
    const pageLabel = index + 1
    const imagePath = `${tenantId}/${projectId}/${drawingId}/page-${pageLabel}.png`
    const imageBytes = Buffer.from(pageImagesBase64[index], 'base64')
    const { error: imageUploadError } = await serviceClient.storage
      .from(DRAWING_IMAGES_BUCKET)
      .upload(imagePath, imageBytes, { contentType: 'image/png', upsert: false })
    if (imageUploadError) {
      return NextResponse.json({ error: imageUploadError.message }, { status: 400 })
    }
    pageImagePaths.push(imagePath)
  }
  if (pageImagePaths.length === 0 || pageCount <= 0) {
    return NextResponse.json({ error: '画像変換結果が不正です' }, { status: 400 })
  }

  console.log('drawings insert payload:', {
    originalPdfPath,
    fileName: savedFileName,
    pageCount,
    pageImages: pageImagePaths,
    tenantId,
    projectId,
  })

  const { data, error } = await serviceClient
    .from('drawings')
    .insert({
      id: drawingId,
      tenant_id: tenantId,
      project_id: projectId,
      floor_label: floorLabel,
      file_path: originalPdfPath,
      original_pdf_path: originalPdfPath,
      page_images: pageImagePaths,
      file_name: savedFileName,
      page_count: pageCount,
    })
    .select('*')
    .single()

  if (error) {
    console.error('drawings insert error:', {
      projectId,
      userId: user.id,
      tenantId,
      floorLabel,
      pageCount,
      storagePath: originalPdfPath,
      bucket: DRAWINGS_PDF_BUCKET,
      error,
    })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ drawing: data })
}
