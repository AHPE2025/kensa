import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id: projectId } = await params

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (projectError) {
    console.error('contractors project check error:', {
      tenantId,
      projectId,
      error: projectError,
    })
    return NextResponse.json({ contractors: [] })
  }
  if (!project) {
    console.error('contractors project not found:', { tenantId, projectId })
    return NextResponse.json({ contractors: [] })
  }

  const { data, error } = await client
    .from('contractors')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })

  if (error) {
    console.error('contractors fetch error:', {
      tenantId,
      projectId,
      error,
    })
    return NextResponse.json({ contractors: [] })
  }
  return NextResponse.json({ contractors: data ?? [] })
}

export async function POST(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id: projectId } = await params
  const body = (await request.json()) as { name?: string; category?: string | null; phone?: string | null }

  const { data: project } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  if (!body.name) return NextResponse.json({ error: 'name は必須です' }, { status: 400 })
  const { data, error } = await client
    .from('contractors')
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      category: body.category?.trim() || null,
      phone: body.phone?.trim() || null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ contractor: data })
}
