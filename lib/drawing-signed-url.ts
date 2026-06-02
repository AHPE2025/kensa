import type { SupabaseClient } from '@supabase/supabase-js'
import { DRAWING_IMAGES_BUCKET, DRAWING_SIGNED_URL_TTL_SECONDS, DRAWINGS_PDF_BUCKET } from '@/lib/storage'

type DrawingPathSource = {
  file_path?: string | null
  original_pdf_path?: string | null
  page_images?: string[] | null
}

export function resolveDrawingPdfStoragePath(drawing: DrawingPathSource): string | null {
  const path = drawing.original_pdf_path ?? drawing.file_path ?? null
  return typeof path === 'string' && path.trim() ? path.trim() : null
}

export function resolveDrawingPreviewImagePath(drawing: DrawingPathSource): string | null {
  const pageImages = Array.isArray(drawing.page_images) ? drawing.page_images : []
  const first = pageImages[0]
  return typeof first === 'string' && first.trim() ? first.trim() : null
}

export async function createDrawingPdfSignedUrl(
  client: SupabaseClient,
  drawing: DrawingPathSource,
): Promise<string | null> {
  const pdfPath = resolveDrawingPdfStoragePath(drawing)
  if (!pdfPath) return null

  const { data, error } = await client.storage
    .from(DRAWINGS_PDF_BUCKET)
    .createSignedUrl(pdfPath, DRAWING_SIGNED_URL_TTL_SECONDS)

  if (error) {
    console.error('pdf signed url error:', { pdfPath, error })
    return null
  }

  return data?.signedUrl ?? null
}

export async function createDrawingPreviewSignedUrl(
  client: SupabaseClient,
  drawing: DrawingPathSource,
): Promise<string | null> {
  const imagePath = resolveDrawingPreviewImagePath(drawing)
  if (!imagePath) return null

  const { data, error } = await client.storage
    .from(DRAWING_IMAGES_BUCKET)
    .createSignedUrl(imagePath, DRAWING_SIGNED_URL_TTL_SECONDS)

  if (error) {
    console.error('drawing preview signed url error:', { imagePath, error })
    return null
  }

  return data?.signedUrl ?? null
}
