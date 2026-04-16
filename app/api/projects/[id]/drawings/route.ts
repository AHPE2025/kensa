import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, getAuthedUser } from '@/lib/api-auth'
import { toAsciiFileName } from '@/lib/filename'
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
  const authed = await getAuthedUser(request)
  if ('error' in authed) return authed.error
  const { client: userClient, user } = authed
  const { id: projectId } = await params

  const form = await request.formData()
  const floorLabel = String(form.get('floorLabel') ?? '').trim() || '未設定'
  const rawPageCount = Number(form.get('pageCount') ?? 0)
  const pageCount = Number.isFinite(rawPageCount) && rawPageCount > 0 ? rawPageCount : 1
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
  const filePath = `${tenantId}/${projectId}/${Date.now()}_${baseName}.pdf`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await serviceClient.storage
    .from('drawings-pdf')
    .upload(filePath, bytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error('drawings storage upload error:', {
      projectId,
      userId: user.id,
      tenantId,
      filePath,
      error: uploadError,
    })
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  const { data, error } = await serviceClient
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

  if (error) {
    console.error('drawings insert error:', {
      projectId,
      userId: user.id,
      tenantId,
      floorLabel,
      pageCount,
      filePath,
      error,
    })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ drawing: data })
}
