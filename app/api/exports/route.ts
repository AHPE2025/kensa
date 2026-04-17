import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient, createUserScopedServerClient } from '@/lib/supabase-server'
import { toAsciiFileName } from '@/lib/filename'
import { DRAWINGS_PDF_BUCKET, DRAWING_SIGNED_URL_TTL_SECONDS, STORAGE_BUCKETS } from '@/lib/storage'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: '認証ヘッダーが必要です' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '').trim()
  const userClient = createUserScopedServerClient(token)
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

  const body = (await request.json()) as { projectId?: string; vendorId?: string; floors?: string[] }
  if (!body.projectId || !body.vendorId) {
    return NextResponse.json({ error: 'projectId と vendorId は必須です' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'プロフィールがありません' }, { status: 403 })

  const tenantId = profile.tenant_id as string
  const { data: project } = await service
    .from('projects')
    .select('*')
    .eq('id', body.projectId)
    .eq('tenant_id', tenantId)
    .single()
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const { data: contractor } = await service
    .from('contractors')
    .select('*')
    .eq('id', body.vendorId)
    .eq('tenant_id', tenantId)
    .single()
  if (!contractor) return NextResponse.json({ error: 'contractor not found' }, { status: 404 })

  const drawingQuery = service
    .from('drawings')
    .select('*')
    .eq('project_id', project.id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
  const { data: drawings } = await (body.floors?.length
    ? drawingQuery.in('floor_label', body.floors)
    : drawingQuery)

  const drawingIds = (drawings ?? []).map((d) => d.id)
  if (drawingIds.length === 0) {
    return NextResponse.json({ error: '対象図面がありません' }, { status: 400 })
  }

  const { data: issues } = await service
    .from('issues')
    .select('*')
    .in('drawing_id', drawingIds)
    .eq('tenant_id', tenantId)
    .eq('contractor_id', contractor.id)
    .order('created_at', { ascending: true })

  const numberedIssues = (issues ?? []).map((issue, index) => ({ ...issue, no: index + 1 }))

  const drawingsPayload = await Promise.all(
    (drawings ?? []).map(async (drawing) => {
      const targetIssues = numberedIssues.filter((issue) => issue.drawing_id === drawing.id)
      const pageMap = new Map<number, Array<(typeof targetIssues)[number]>>()
      for (const issue of targetIssues) {
        const list = pageMap.get(issue.page_index) ?? []
        list.push(issue)
        pageMap.set(issue.page_index, list)
      }

      const storagePath = drawing.original_pdf_path ?? drawing.file_path ?? drawing.storage_path ?? ''
      if (!storagePath) {
        throw new Error(`drawing storage path missing: drawingId=${drawing.id}`)
      }
      const { data: fileBlob, error: fileError } = await service.storage
        .from(DRAWINGS_PDF_BUCKET)
        .download(storagePath)
      if (fileError || !fileBlob) {
        throw new Error(fileError?.message ?? 'drawing download failed')
      }
      const pdfBuffer = Buffer.from(await fileBlob.arrayBuffer()).toString('base64')

      return {
        floor_label: drawing.floor_label,
        pdf_file_base64: pdfBuffer,
        pages: Array.from(pageMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([pageIndex, pageIssues]) => ({
            page_index: pageIndex,
            issues: pageIssues.map((issue) => ({
              no: issue.no,
              pin: { x: issue.pin_x, y: issue.pin_y },
              callout: { x: issue.callout_x, y: issue.callout_y },
              issue_type: issue.issue_type,
              issue_text: issue.issue_text,
              status: issue.status,
              floor_label: issue.floor_label,
            })),
          })),
      }
    })
  )

  const pdfServiceUrl = process.env.PDF_SERVICE_URL
  if (!pdfServiceUrl) {
    return NextResponse.json({ error: 'PDF_SERVICE_URL が未設定です' }, { status: 500 })
  }

  const generatedAt = new Date().toISOString().slice(0, 10)
  const pdfResponse = await fetch(`${pdfServiceUrl.replace(/\/$/, '')}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project: {
        name: project.name,
        address: project.address,
        inspection_date: project.inspection_date,
      },
      contractor: { name: contractor.name },
      drawings: drawingsPayload,
      generated_at: generatedAt,
    }),
  })

  if (!pdfResponse.ok) {
    const text = await pdfResponse.text()
    return NextResponse.json({ error: `PDF生成失敗: ${text}` }, { status: 500 })
  }

  const pdfArrayBuffer = await pdfResponse.arrayBuffer()
  const ymd = generatedAt.replace(/-/g, '')
  const safeContractor = toAsciiFileName(contractor.name)
  const fileName = `${toAsciiFileName(project.id)}_vendor_${safeContractor}_${ymd}.pdf`
  const exportPath = `${tenantId}/${project.id}/${fileName}`

  const { error: uploadError } = await service.storage
    .from(STORAGE_BUCKETS.exportsPdf)
    .upload(exportPath, Buffer.from(pdfArrayBuffer), {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: signed } = await service.storage
    .from(STORAGE_BUCKETS.exportsPdf)
    .createSignedUrl(exportPath, DRAWING_SIGNED_URL_TTL_SECONDS)

  return NextResponse.json({
    fileName,
    filePath: exportPath,
    url: signed?.signedUrl ?? null,
  })
}
