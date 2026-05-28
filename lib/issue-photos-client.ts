'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { buildIssuePhotoStoragePath } from '@/lib/issue-photo-paths'
import { ISSUE_PHOTOS_BUCKET } from '@/lib/storage'
import type { ExportIssue, PhotoSignedUrlEntry } from '@/lib/pdf-export-client'

const PHOTO_SIGNED_URL_TTL_SECONDS = 3600

export async function uploadIssuePhotoFromClient(
  tenantId: string,
  projectId: string,
  drawingId: string,
  issueIdOrTemp: string,
  kind: 'before' | 'after',
  file: File,
): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  const path = buildIssuePhotoStoragePath(
    tenantId,
    projectId,
    drawingId,
    issueIdOrTemp,
    kind,
    file.name,
  )
  const { error } = await supabase.storage.from(ISSUE_PHOTOS_BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) {
    throw error
  }
  return path
}

async function createIssuePhotoSignedUrlClient(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase.storage
    .from(ISSUE_PHOTOS_BUCKET)
    .createSignedUrl(path, PHOTO_SIGNED_URL_TTL_SECONDS)
  if (error) {
    console.error('create photo signed url error:', error)
    return null
  }
  return data?.signedUrl ?? null
}

export async function createPhotoSignedUrlsForExport(
  issues: ExportIssue[],
): Promise<PhotoSignedUrlEntry[]> {
  const results = await Promise.all(
    issues.map(async (issue) => {
      console.log('create photo signed url:', {
        issueId: issue.id,
        before_photo_path: issue.before_photo_path ?? null,
        after_photo_path: issue.after_photo_path ?? null,
      })

      let before_photo_url: string | null = null
      let after_photo_url: string | null = null
      let beforeError = false
      let afterError = false

      if (issue.before_photo_path) {
        before_photo_url = await createIssuePhotoSignedUrlClient(issue.before_photo_path)
        if (!before_photo_url) beforeError = true
      }

      if (issue.after_photo_path) {
        after_photo_url = await createIssuePhotoSignedUrlClient(issue.after_photo_path)
        if (!after_photo_url) afterError = true
      }

      return {
        issueId: issue.id,
        before_photo_path: issue.before_photo_path ?? null,
        after_photo_path: issue.after_photo_path ?? null,
        before_photo_url,
        after_photo_url,
        beforeError,
        afterError,
      }
    }),
  )

  console.log('photo signed urls:', results)
  return results
}

export function mergePhotoSignedUrls(
  issues: ExportIssue[],
  photoSignedUrls: PhotoSignedUrlEntry[],
): Array<
  ExportIssue & {
    before_photo_url: string | null
    after_photo_url: string | null
    beforePhotoLoadError: boolean
    afterPhotoLoadError: boolean
  }
> {
  const urlMap = new Map(photoSignedUrls.map((entry) => [entry.issueId, entry]))
  return issues.map((issue) => {
    const urls = urlMap.get(issue.id)
    return {
      ...issue,
      before_photo_url: urls?.before_photo_url ?? null,
      after_photo_url: urls?.after_photo_url ?? null,
      beforePhotoLoadError: urls?.beforeError ?? false,
      afterPhotoLoadError: urls?.afterError ?? false,
    }
  })
}
