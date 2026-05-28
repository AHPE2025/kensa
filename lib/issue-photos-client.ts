'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { buildIssuePhotoPath } from '@/lib/issue-photo-paths'
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
  const path = buildIssuePhotoPath({
    tenantId,
    projectId,
    drawingId,
    tempId: issueIdOrTemp,
    kind,
    file,
  })

  if (kind === 'before') {
    console.log('before photo upload path:', path)
  } else {
    console.log('after photo upload path:', path)
  }

  const { data, error } = await supabase.storage.from(ISSUE_PHOTOS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (error) {
    throw error
  }
  return data?.path ?? path
}

export async function attachIssuePhotoDisplayUrlsClient<
  T extends { before_photo_path?: string | null; after_photo_path?: string | null },
>(issue: T): Promise<T & { before_photo_url: string | null; after_photo_url: string | null }> {
  let before_photo_url: string | null = null
  let after_photo_url: string | null = null

  if (issue.before_photo_path) {
    console.log('create before photo signed url:', issue.before_photo_path)
    before_photo_url = await createIssuePhotoSignedUrlClient(issue.before_photo_path)
  }

  if (issue.after_photo_path) {
    console.log('create after photo signed url:', issue.after_photo_path)
    after_photo_url = await createIssuePhotoSignedUrlClient(issue.after_photo_path)
  }

  return {
    ...issue,
    before_photo_url,
    after_photo_url,
  }
}

export async function createIssuePhotoSignedUrlClient(
  path: string | null | undefined,
): Promise<string | null> {
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
        console.log('create before photo signed url:', issue.before_photo_path)
        before_photo_url = await createIssuePhotoSignedUrlClient(issue.before_photo_path)
        if (!before_photo_url) beforeError = true
      }

      if (issue.after_photo_path) {
        console.log('create after photo signed url:', issue.after_photo_path)
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
