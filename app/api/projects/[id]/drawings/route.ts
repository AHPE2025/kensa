import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { toAsciiFileName } from '@/lib/filename'

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

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const drawingIds = (drawings ?? []).map((d) => d.id)
  const { data: issues } =
    drawingIds.length === 0
      ? { data: [] as Array<{ drawing_id: string }> }
      : await client.from('issues').select('drawing_id').in('drawing_id', drawingIds).eq('tenant_id', tenantId)

  const countMap = new Map<string, number>()
  for (const idValue of drawingIds) countMap.set(idValue, 0)
  for (const issue of issues ?? []) countMap.set(issue.drawing_id, (countMap.get(issue.drawing_id) ?? 0) + 1)

  const rows = await Promise.all(
    (drawings ?? []).map(async (d) => {
      const { data: signed } = await client.storage.from('drawings-pdf').createSignedUrl(d.file_path, 60 * 60)
      return {
        ...d,
        issue_count: countMap.get(d.id) ?? 0,
        signed_url: signed?.signedUrl ?? null,
        file_name: d.file_path.split('/').pop() ?? 'drawing.pdf',
      }
    })
  )
  return NextResponse.json({ drawings: rows })
}

export async function POST(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id: projectId } = await params

  const form = await request.formData()
  const floorLabel = String(form.get('floorLabel') ?? '').trim()
  const pageCount = Number(form.get('pageCount') ?? 0)
  const file = form.get('file')

  if (!floorLabel || !pageCount || !(file instanceof File)) {
    return NextResponse.json({ error: 'floorLabel/pageCount/file が必須です' }, { status: 400 })
  }

  const baseName = toAsciiFileName(file.name.replace(/\.pdf$/i, ''))
  const filePath = `${tenantId}/${projectId}/${Date.now()}_${baseName}.pdf`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await client.storage
    .from('drawings-pdf')
    .upload(filePath, bytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  const { data, error } = await client
    .from('drawings')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      floor_label: floorLabel,
      file_path: filePath,
      page_count: pageCount,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ drawing: data })
}
