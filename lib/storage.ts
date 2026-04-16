export const STORAGE_BUCKETS = {
  drawings: 'drawings',
  drawingsPdf: 'drawings-pdf',
  exportsPdf: 'exports-pdf',
} as const

export const DRAWING_SIGNED_URL_TTL_SECONDS = 60 * 60
export const DRAWING_BUCKET_CANDIDATES = [STORAGE_BUCKETS.drawings, STORAGE_BUCKETS.drawingsPdf] as const

type DrawingPathSource = {
  storage_path?: string | null
  file_path?: string | null
  file_name?: string | null
}

export function resolveDrawingStoragePath(source: DrawingPathSource): {
  ok: true
  path: string
  warning?: 'bucket_prefix_removed'
} | {
  ok: false
  reason: 'path_missing'
} {
  const rawPath = source.storage_path?.trim() || source.file_path?.trim() || ''
  if (!rawPath) return { ok: false, reason: 'path_missing' }

  const normalized = rawPath.replace(/^\/+/, '')
  const bucketPrefix = `${STORAGE_BUCKETS.drawingsPdf}/`
  if (normalized.startsWith(bucketPrefix)) {
    return {
      ok: true,
      path: normalized.slice(bucketPrefix.length),
      warning: 'bucket_prefix_removed',
    }
  }

  return { ok: true, path: normalized }
}
