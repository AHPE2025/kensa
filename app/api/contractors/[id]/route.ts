import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id } = await params
  const body = (await request.json()) as { name?: string; category?: string | null; phone?: string | null }

  const updates: Record<string, string | null> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.category !== undefined) updates.category = body.category?.trim() || null
  if (body.phone !== undefined) updates.phone = body.phone?.trim() || null

  const { data, error } = await client
    .from('contractors')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ contractor: data })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id } = await params

  const { error } = await client.from('contractors').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
