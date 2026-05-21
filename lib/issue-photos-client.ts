'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { buildIssuePhotoStoragePath } from '@/lib/issue-photo-paths'
import { ISSUE_PHOTOS_BUCKET } from '@/lib/storage'

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
