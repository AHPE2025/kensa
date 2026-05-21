import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toAsciiFileName } from '@/lib/filename'
import { DRAWING_SIGNED_URL_TTL_SECONDS, ISSUE_PHOTOS_BUCKET } from '@/lib/storage'

export const ISSUE_PHOTO_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp'

export function sanitizeIssuePhotoFileName(originalName: string) {
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
  const base = toAsciiFileName(originalName.replace(/\.[^.]+$/, ''))
  return `${base}.${safeExt}`
}

export function buildIssuePhotoStoragePath(
  tenantId: string,
  projectId: string,
  drawingId: string,
  issueIdOrTemp: string,
  kind: 'before' | 'after',
  fileName: string,
) {
  const timestamp = Date.now()
  const safeName = sanitizeIssuePhotoFileName(fileName)
  return `${tenantId}/${projectId}/${drawingId}/${issueIdOrTemp}/${kind}_${timestamp}_${safeName}`
}

export function createTempIssueFolderId() {
  return `temp_${randomUUID()}`
}

export async function uploadIssuePhotoFile(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  drawingId: string,
  issueIdOrTemp: string,
  kind: 'before' | 'after',
  file: File,
) {
  const path = buildIssuePhotoStoragePath(
    tenantId,
    projectId,
    drawingId,
    issueIdOrTemp,
    kind,
    file.name,
  )
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error } = await client.storage.from(ISSUE_PHOTOS_BUCKET).upload(path, bytes, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) {
    throw error
  }
  return path
}

export async function createIssuePhotoSignedUrl(client: SupabaseClient, path: string | null | undefined) {
  if (!path) return null
  const { data, error } = await client.storage
    .from(ISSUE_PHOTOS_BUCKET)
    .createSignedUrl(path, DRAWING_SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function attachIssuePhotoSignedUrls<T extends { before_photo_path?: string | null; after_photo_path?: string | null }>(
  client: SupabaseClient,
  issue: T,
) {
  const [before_photo_url, after_photo_url] = await Promise.all([
    createIssuePhotoSignedUrl(client, issue.before_photo_path),
    createIssuePhotoSignedUrl(client, issue.after_photo_path),
  ])
  return {
    ...issue,
    before_photo_url,
    after_photo_url,
  }
}
