import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildIssuePhotoPath,
  createTempIssueFolderId,
  ISSUE_PHOTO_ACCEPT,
} from '@/lib/issue-photo-paths'
import { DRAWING_SIGNED_URL_TTL_SECONDS, ISSUE_PHOTOS_BUCKET } from '@/lib/storage'

export { ISSUE_PHOTO_ACCEPT, buildIssuePhotoPath, createTempIssueFolderId }

export async function uploadIssuePhotoFile(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  drawingId: string,
  issueIdOrTemp: string,
  kind: 'before' | 'after',
  file: File,
) {
  const path = buildIssuePhotoPath({
    tenantId,
    projectId,
    drawingId,
    tempId: issueIdOrTemp,
    kind,
    file,
  })
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error } = await client.storage.from(ISSUE_PHOTOS_BUCKET).upload(path, bytes, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) {
    throw error
  }
  return path
}

export async function createIssuePhotoSignedUrl(
  client: SupabaseClient,
  path: string | null | undefined,
  kind?: 'before' | 'after',
) {
  if (!path) return null
  if (kind === 'before') {
    console.log('create before photo signed url:', path)
  } else if (kind === 'after') {
    console.log('create after photo signed url:', path)
  }
  const { data, error } = await client.storage
    .from(ISSUE_PHOTOS_BUCKET)
    .createSignedUrl(path, DRAWING_SIGNED_URL_TTL_SECONDS)
  if (error) {
    console.error('create photo signed url error:', error)
    return null
  }
  return data?.signedUrl ?? null
}

export async function attachIssuePhotoSignedUrls<T extends { before_photo_path?: string | null; after_photo_path?: string | null }>(
  client: SupabaseClient,
  issue: T,
) {
  const [before_photo_url, after_photo_url] = await Promise.all([
    createIssuePhotoSignedUrl(client, issue.before_photo_path, 'before'),
    createIssuePhotoSignedUrl(client, issue.after_photo_path, 'after'),
  ])
  return {
    ...issue,
    before_photo_url,
    after_photo_url,
  }
}
