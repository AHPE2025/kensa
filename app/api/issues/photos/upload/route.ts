import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import {
  buildIssuePhotoStoragePath,
  ISSUE_PHOTO_MAX_BYTES,
  isAllowedIssuePhotoMime,
  ISSUE_PHOTOS_BUCKET,
  type IssuePhotoType,
} from '@/lib/issue-photo-api'
import { verifyIssueBelongsToTenant } from '@/lib/issue-photo-access'
import { createSupabaseAdmin } from '@/lib/supabaseAdmin'

function isPhotoType(value: string): value is IssuePhotoType {
  return value === 'before' || value === 'after'
}

export async function POST(request: NextRequest) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed

  const formData = await request.formData()
  const file = formData.get('file')
  const projectId = String(formData.get('projectId') ?? '').trim()
  const issueId = String(formData.get('issueId') ?? '').trim()
  const photoTypeRaw = String(formData.get('photoType') ?? '').trim()

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '写真ファイルが指定されていません' }, { status: 400 })
  }
  if (!projectId) {
    return NextResponse.json({ error: 'projectId が必要です' }, { status: 400 })
  }
  if (!issueId) {
    return NextResponse.json({ error: 'issueId が必要です' }, { status: 400 })
  }
  if (!isPhotoType(photoTypeRaw)) {
    return NextResponse.json({ error: 'photoType は before または after を指定してください' }, { status: 400 })
  }

  const contentType = file.type || 'application/octet-stream'
  if (!isAllowedIssuePhotoMime(contentType)) {
    return NextResponse.json(
      { error: '対応していない画像形式です。JPEG / PNG / WebP / HEIC をご利用ください' },
      { status: 400 },
    )
  }
  if (file.size > ISSUE_PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: '写真のサイズは10MB以下にしてください' }, { status: 400 })
  }

  const hasAccess = await verifyIssueBelongsToTenant(client, tenantId, projectId, issueId)
  if (!hasAccess) {
    return NextResponse.json({ error: '指摘が見つからないか、アクセス権がありません' }, { status: 403 })
  }

  const path = buildIssuePhotoStoragePath(projectId, issueId, photoTypeRaw, contentType, file.name)
  const bytes = Buffer.from(await file.arrayBuffer())
  const admin = createSupabaseAdmin()

  const { error } = await admin.storage.from(ISSUE_PHOTOS_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  })

  if (error) {
    console.error('issue photo upload error:', {
      projectId,
      issueId,
      photoType: photoTypeRaw,
      path,
      error,
    })
    const label = photoTypeRaw === 'before' ? 'ビフォー' : 'アフター'
    return NextResponse.json(
      {
        error: `${label}写真のアップロードに失敗しました。写真形式または容量を確認してください。`,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ path })
}
