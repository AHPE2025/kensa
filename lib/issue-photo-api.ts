import { ISSUE_PHOTOS_BUCKET } from '@/lib/storage'

export const ISSUE_PHOTO_MAX_BYTES = 10 * 1024 * 1024

export const ISSUE_PHOTO_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export type IssuePhotoType = 'before' | 'after'

export const ISSUE_PHOTO_ACCEPT =
  'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif'

export function isAllowedIssuePhotoMime(mime: string): boolean {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  return (ISSUE_PHOTO_ALLOWED_MIME_TYPES as readonly string[]).includes(normalized)
}

export function getIssuePhotoExtension(mime: string, fileName?: string): string {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (normalized === 'image/png') return 'png'
  if (normalized === 'image/webp') return 'webp'
  if (normalized === 'image/heic' || normalized === 'image/heif') {
    const lowerName = (fileName ?? '').toLowerCase()
    if (lowerName.endsWith('.heif')) return 'heif'
    return 'heic'
  }
  return 'jpg'
}

export function buildIssuePhotoStoragePath(
  projectId: string,
  issueId: string,
  photoType: IssuePhotoType,
  mime: string,
  fileName?: string,
): string {
  const ext = getIssuePhotoExtension(mime, fileName)
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  return `projects/${projectId}/issues/${issueId}/${photoType}-${timestamp}-${random}.${ext}`
}

export { ISSUE_PHOTOS_BUCKET }
