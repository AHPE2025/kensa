import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { attachIssuePhotoSignedUrls } from '@/lib/issue-photos'
import { normalizeIssueStatus } from '@/lib/issue-status'

type Params = { params: Promise<{ issueId: string }> }

function resolveOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId, user } = authed
  const { issueId } = await params

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 })
  }

  const body = (await request.json()) as Record<string, unknown>

  console.log('before photo path:', body.before_photo_path ?? null)
  console.log('after photo path:', body.after_photo_path ?? null)

  const { data: existingIssue, error: existingError } = await client
    .from('issues')
    .select('id, tenant_id, project_id, drawing_id, before_photo_path, after_photo_path')
    .eq('id', issueId)
    .eq('tenant_id', tenantId)
    .single()

  if (existingError || !existingIssue) {
    console.error('create issue error:', existingError ?? 'issue not found')
    return NextResponse.json({ error: '指摘が見つかりません' }, { status: 404 })
  }

  const allowed = [
    'page_index',
    'floor_label',
    'pin_x',
    'pin_y',
    'callout_x',
    'callout_y',
    'issue_category',
    'issue_type',
    'issue_text',
    'contractor_id',
    'status',
    'before_photo_path',
    'after_photo_path',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if ('contractor_id' in updates) {
    const contractorId = updates.contractor_id
    updates.contractor_id = typeof contractorId === 'string' && contractorId.trim() ? contractorId : null
  }
  if ('before_photo_path' in updates) {
    updates.before_photo_path = resolveOptionalString(updates.before_photo_path)
  }
  if ('after_photo_path' in updates) {
    updates.after_photo_path = resolveOptionalString(updates.after_photo_path)
  }
  if ('x_ratio' in body) updates.pin_x = body.x_ratio
  if ('y_ratio' in body) updates.pin_y = body.y_ratio
  if ('callout_x_ratio' in body) updates.callout_x = body.callout_x_ratio
  if ('callout_y_ratio' in body) updates.callout_y = body.callout_y_ratio
  if ('status' in updates) {
    updates.status = normalizeIssueStatus(
      typeof updates.status === 'string' ? updates.status : undefined,
    )
  }

  updates.updated_by = user?.id ?? null
  updates.updated_at = new Date().toISOString()

  const { data, error } = await client
    .from('issues')
    .update(updates)
    .eq('id', issueId)
    .eq('tenant_id', tenantId)
    .select('*, contractor:contractors(id,name)')
    .single()

  if (error) {
    console.error('create issue error:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 400 })
  }

  const issueWithUrls = data ? await attachIssuePhotoSignedUrls(client, data) : null
  return NextResponse.json({ issue: issueWithUrls })
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
