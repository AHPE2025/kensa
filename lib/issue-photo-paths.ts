import { toAsciiFileName } from '@/lib/filename'

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
  return `temp_${crypto.randomUUID()}`
}
