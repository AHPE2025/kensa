'use client'

import { authedFetch } from '@/lib/authed-fetch'
import type { ExportIssue, PhotoSignedUrlEntry } from '@/lib/pdf-export-client'

export type IssuePhotoUploadResult =
  | {
      ok: true
      beforePhotoPath: string | null
      afterPhotoPath: string | null
    }
  | {
      ok: false
      beforeFailed: boolean
      afterFailed: boolean
    }

export async function uploadIssuePhotoViaApi(
  projectId: string,
  issueId: string,
  photoType: 'before' | 'after',
  file: File,
): Promise<{ path: string } | { error: string }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('projectId', projectId)
  formData.append('issueId', issueId)
  formData.append('photoType', photoType)

  const response = await authedFetch('/api/issues/photos/upload', {
    method: 'POST',
    body: formData,
  })

  const data = (await response.json()) as { path?: string; error?: string }
  if (!response.ok || !data.path) {
    return { error: data.error ?? '写真のアップロードに失敗しました' }
  }
  return { path: data.path }
}

export async function deleteIssuePhotoViaApi(path: string): Promise<boolean> {
  try {
    const response = await authedFetch('/api/issues/photos/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    const data = (await response.json()) as { ok?: boolean }
    return response.ok && data.ok === true
  } catch (error) {
    console.error('issue photo delete api error:', error)
    return false
  }
}

export async function createIssuePhotoSignedUrlClient(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null

  try {
    const response = await authedFetch('/api/issues/photos/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    const data = (await response.json()) as { url?: string; error?: string }
    if (!response.ok || !data.url) {
      console.error('create photo signed url error:', data.error ?? response.status)
      return null
    }
    return data.url
  } catch (error) {
    console.error('create photo signed url error:', error)
    return null
  }
}

export async function uploadIssuePhotosViaApi(params: {
  projectId: string
  issueId: string
  beforePhotoFile: File | null
  afterPhotoFile: File | null
}): Promise<IssuePhotoUploadResult> {
  const { projectId, issueId, beforePhotoFile, afterPhotoFile } = params

  let beforePhotoPath: string | null = null
  let afterPhotoPath: string | null = null
  let beforeFailed = false
  let afterFailed = false

  if (beforePhotoFile) {
    const result = await uploadIssuePhotoViaApi(projectId, issueId, 'before', beforePhotoFile)
    if ('error' in result) {
      console.error('before photo upload error:', result.error)
      beforeFailed = true
    } else {
      beforePhotoPath = result.path
      console.log('before photo uploaded:', beforePhotoPath)
    }
  }

  if (afterPhotoFile) {
    const result = await uploadIssuePhotoViaApi(projectId, issueId, 'after', afterPhotoFile)
    if ('error' in result) {
      console.error('after photo upload error:', result.error)
      afterFailed = true
    } else {
      afterPhotoPath = result.path
      console.log('after photo uploaded:', afterPhotoPath)
    }
  }

  if (beforeFailed || afterFailed) {
    return { ok: false, beforeFailed, afterFailed }
  }

  return { ok: true, beforePhotoPath, afterPhotoPath }
}

export function formatIssuePhotoUploadError(result: {
  beforeFailed: boolean
  afterFailed: boolean
}): string {
  if (result.beforeFailed && result.afterFailed) {
    return 'ビフォー写真・アフター写真のアップロードに失敗しました。写真形式または容量を確認してください。'
  }
  if (result.beforeFailed) {
    return 'ビフォー写真のアップロードに失敗しました。写真形式または容量を確認してください。'
  }
  return 'アフター写真のアップロードに失敗しました。写真形式または容量を確認してください。'
}

/** @deprecated uploadIssuePhotosViaApi を使用してください */
export async function uploadIssuePhotoFromClient(
  _tenantId: string,
  projectId: string,
  _drawingId: string,
  issueId: string,
  kind: 'before' | 'after',
  file: File,
): Promise<string> {
  const result = await uploadIssuePhotoViaApi(projectId, issueId, kind, file)
  if ('error' in result) {
    throw new Error(result.error)
  }
  return result.path
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
