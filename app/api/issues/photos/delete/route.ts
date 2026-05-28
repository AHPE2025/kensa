import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { ISSUE_PHOTOS_BUCKET } from '@/lib/issue-photo-api'
import { verifyIssuePhotoPathAccess } from '@/lib/issue-photo-access'
import { createSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed

  const body = (await request.json()) as { path?: string | null }
  const path = typeof body.path === 'string' ? body.path.trim() : ''

  if (!path) {
    return NextResponse.json({ ok: true, storageDeleted: false, message: '削除対象のパスがありません' })
  }

  const hasAccess = await verifyIssuePhotoPathAccess(client, tenantId, path)
  if (!hasAccess) {
    return NextResponse.json(
      { ok: false, storageDeleted: false, error: '写真へのアクセス権がありません' },
      { status: 403 },
    )
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin.storage.from(ISSUE_PHOTOS_BUCKET).remove([path])

  if (error) {
    console.error('issue photo delete error:', { path, error })
    return NextResponse.json({
      ok: false,
      storageDeleted: false,
      error: 'Storageからの写真削除に失敗しました',
    })
  }

  return NextResponse.json({ ok: true, storageDeleted: true })
}
