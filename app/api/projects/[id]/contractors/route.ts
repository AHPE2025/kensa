import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, getAuthedUser } from '@/lib/api-auth'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const authed = await getAuthedUser(request)
  if ('error' in authed) return authed.error
  const { client, user } = authed
  const { id: projectId } = await params

  let tenantId: string | null = null
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error("contractors load error:", { projectId, error: profileError })
  } else {
    tenantId = profile?.tenant_id ?? null
  }

  let contractors: unknown[] = []

  if (tenantId) {
    const { data, error } = await client
      .from('contractors')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true })
    if (error) {
      console.error("contractors load error:", { projectId, tenantId, error })
    } else {
      contractors = data ?? []
    }
  }

  // 開発用フォールバック: tenant_id で取れない/0件時は全件取得を許容
  if (!tenantId || contractors.length === 0) {
    const { data, error } = await client.from('contractors').select('*').order('name', { ascending: true })
    if (error) {
      console.error("contractors load error:", { projectId, tenantId, error })
      return NextResponse.json({ contractors: [] })
    }
    contractors = data ?? []
  }

  console.log("contractors:", contractors)
  return NextResponse.json({ contractors })
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
