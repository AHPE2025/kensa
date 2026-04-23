import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'

type Params = { params: Promise<{ issueId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { issueId } = await params
  const body = (await request.json()) as Record<string, unknown>

  const allowed = [
    'page_index',
    'floor_label',
    'pin_x',
    'pin_y',
    'callout_x',
    'callout_y',
    'issue_type',
    'issue_text',
    'contractor_id',
    'status',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if ('x_ratio' in body) updates.pin_x = body.x_ratio
  if ('y_ratio' in body) updates.pin_y = body.y_ratio
  if ('callout_x_ratio' in body) updates.callout_x = body.callout_x_ratio
  if ('callout_y_ratio' in body) updates.callout_y = body.callout_y_ratio

  const { data, error } = await client
    .from('issues')
    .update(updates)
    .eq('id', issueId)
    .eq('tenant_id', tenantId)
    .select('*, contractor:contractors(id,name)')
    .single()

  if (error) {
    console.error('issue update error:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 400 })
  }
  return NextResponse.json({ issue: data })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { issueId } = await params

  const { error } = await client.from('issues').delete().eq('id', issueId).eq('tenant_id', tenantId)
  if (error) {
    console.error('issue delete error:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
