export const STORAGE_BUCKETS = {
  drawingsPdf: 'drawings-pdf',
  drawingImages: 'drawings-images',
  exportsPdf: 'exports-pdf',
  issuePhotos: 'issue-photos',
} as const

export const DRAWING_SIGNED_URL_TTL_SECONDS = 60 * 60
export const DRAWINGS_PDF_BUCKET = STORAGE_BUCKETS.drawingsPdf
export const DRAWING_IMAGES_BUCKET = STORAGE_BUCKETS.drawingImages
export const ISSUE_PHOTOS_BUCKET = STORAGE_BUCKETS.issuePhotos
