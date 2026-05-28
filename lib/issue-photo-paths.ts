export const ISSUE_PHOTO_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp'

export function getSafeImageExt(file: File): 'jpg' | 'png' | 'webp' {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export type BuildIssuePhotoPathParams = {
  tenantId: string
  projectId: string
  drawingId: string
  tempId: string
  kind: 'before' | 'after'
  file: File
}

export function buildIssuePhotoPath(params: BuildIssuePhotoPathParams): string {
  const { tenantId, projectId, drawingId, tempId, kind, file } = params
  const ext = getSafeImageExt(file)
  const timestamp = Date.now()
  return `${tenantId}/${projectId}/${drawingId}/${tempId}/${kind}_${timestamp}_photo.${ext}`
}

/** @deprecated Use buildIssuePhotoPath instead */
export function buildIssuePhotoStoragePath(
  tenantId: string,
  projectId: string,
  drawingId: string,
  issueIdOrTemp: string,
  kind: 'before' | 'after',
  file: File,
) {
  return buildIssuePhotoPath({
    tenantId,
    projectId,
    drawingId,
    tempId: issueIdOrTemp,
    kind,
    file,
  })
}

export function createTempIssueFolderId() {
  return `temp_${Date.now()}`
}

export function resolvePhotoUploadTenantId(options: {
  drawingTenantId?: string | null
  projectTenantId?: string | null
  profileTenantId?: string | null
}): string | null {
  const drawing = options.drawingTenantId?.trim()
  if (drawing) return drawing
  const project = options.projectTenantId?.trim()
  if (project) return project
  const profile = options.profileTenantId?.trim()
  if (profile) return profile
  return null
}
