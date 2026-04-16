import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed

  const { data: projects, error } = await client
    .from('projects')
    .select('id,name,address,inspection_date,created_at')
    .eq('tenant_id', tenantId)
    .order('inspection_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const projectIds = (projects ?? []).map((p) => p.id)
  const { data: issues } =
    projectIds.length === 0
      ? { data: [] as Array<{ project_id: string; status: string; created_at: string }> }
      : await client
          .from('issues')
          .select('project_id,status,created_at')
          .in('project_id', projectIds)
          .eq('tenant_id', tenantId)

  const map = new Map<string, { issue_count: number; open_count: number; latest_update: string }>()
  for (const project of projects ?? []) {
    map.set(project.id, { issue_count: 0, open_count: 0, latest_update: project.created_at })
  }
  for (const issue of issues ?? []) {
    const current = map.get(issue.project_id)
    if (!current) continue
    current.issue_count += 1
    if (issue.status !== 'done') current.open_count += 1
    if (issue.created_at > current.latest_update) current.latest_update = issue.created_at
  }

  const rows = (projects ?? []).map((p) => ({
    ...p,
    ...(map.get(p.id) ?? { issue_count: 0, open_count: 0, latest_update: p.created_at }),
  }))

  return NextResponse.json({ projects: rows })
}

export async function POST(request: NextRequest) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed

  const body = (await request.json()) as {
    name?: string
    address?: string
    inspection_date?: string
  }

  if (!body.name || !body.address || !body.inspection_date) {
    return NextResponse.json({ error: 'name,address,inspection_date は必須です' }, { status: 400 })
  }

  const { data, error } = await client
    .from('projects')
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      address: body.address.trim(),
      inspection_date: body.inspection_date,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ project: data })
}
