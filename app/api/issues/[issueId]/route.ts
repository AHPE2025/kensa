import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { attachIssuePhotoSignedUrls, uploadIssuePhotoFile } from '@/lib/issue-photos'

type Params = { params: Promise<{ issueId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { issueId } = await params

  const contentType = request.headers.get('content-type') ?? ''
  let body: Record<string, unknown> = {}
  let beforePhotoFile: File | null = null
  let afterPhotoFile: File | null = null
  let clearBeforePhoto = false
  let clearAfterPhoto = false

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const payloadRaw = formData.get('payload')
    body = payloadRaw ? (JSON.parse(String(payloadRaw)) as Record<string, unknown>) : {}
    const beforePhoto = formData.get('before_photo')
    const afterPhoto = formData.get('after_photo')
    beforePhotoFile = beforePhoto instanceof File && beforePhoto.size > 0 ? beforePhoto : null
    afterPhotoFile = afterPhoto instanceof File && afterPhoto.size > 0 ? afterPhoto : null
    clearBeforePhoto = formData.get('clear_before_photo') === 'true'
    clearAfterPhoto = formData.get('clear_after_photo') === 'true'
  } else {
    body = (await request.json()) as Record<string, unknown>
  }

  console.log('before photo file:', beforePhotoFile)
  console.log('after photo file:', afterPhotoFile)

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

  let beforePhotoPath = existingIssue.before_photo_path as string | null
  let afterPhotoPath = existingIssue.after_photo_path as string | null

  if (clearBeforePhoto) {
    beforePhotoPath = null
  }
  if (clearAfterPhoto) {
    afterPhotoPath = null
  }

  try {
    if (beforePhotoFile) {
      beforePhotoPath = await uploadIssuePhotoFile(
        client,
        tenantId,
        existingIssue.project_id,
        existingIssue.drawing_id,
        issueId,
        'before',
        beforePhotoFile,
      )
      console.log('before photo path:', beforePhotoPath)
    }
    if (afterPhotoFile) {
      afterPhotoPath = await uploadIssuePhotoFile(
        client,
        tenantId,
        existingIssue.project_id,
        existingIssue.drawing_id,
        issueId,
        'after',
        afterPhotoFile,
      )
      console.log('after photo path:', afterPhotoPath)
    }
  } catch (error) {
    console.error('photo upload error:', error)
    return NextResponse.json({ error: '写真のアップロードに失敗しました' }, { status: 400 })
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
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if ('contractor_id' in updates) {
    const contractorId = updates.contractor_id
    updates.contractor_id = typeof contractorId === 'string' && contractorId.trim() ? contractorId : null
  }
  if ('x_ratio' in body) updates.pin_x = body.x_ratio
  if ('y_ratio' in body) updates.pin_y = body.y_ratio
  if ('callout_x_ratio' in body) updates.callout_x = body.callout_x_ratio
  if ('callout_y_ratio' in body) updates.callout_y = body.callout_y_ratio

  if (beforePhotoFile || clearBeforePhoto) {
    updates.before_photo_path = beforePhotoPath
  }
  if (afterPhotoFile || clearAfterPhoto) {
    updates.after_photo_path = afterPhotoPath
  }

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
