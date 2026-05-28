import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { ISSUE_PHOTOS_BUCKET } from '@/lib/issue-photo-api'
import { verifyIssuePhotoPathAccess } from '@/lib/issue-photo-access'
import { createSupabaseAdmin } from '@/lib/supabaseAdmin'

const SIGNED_URL_TTL_SECONDS = 60 * 60

export async function POST(request: NextRequest) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed

  const body = (await request.json()) as { path?: string }
  const path = typeof body.path === 'string' ? body.path.trim() : ''

  if (!path) {
    return NextResponse.json({ error: 'path が必要です' }, { status: 400 })
  }

  const hasAccess = await verifyIssuePhotoPathAccess(client, tenantId, path)
  if (!hasAccess) {
    return NextResponse.json({ error: '写真へのアクセス権がありません' }, { status: 403 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.storage
    .from(ISSUE_PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error) {
    console.error('issue photo signed url error:', { path, error })
    return NextResponse.json({ error: '写真URLの取得に失敗しました' }, { status: 500 })
  }

  const url = data?.signedUrl
  if (!url) {
    return NextResponse.json({ error: '写真URLの取得に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ url })
}
