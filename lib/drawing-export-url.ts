import { authedFetch } from '@/lib/authed-fetch'

export type DrawingUrlFields = {
  id: string
  signed_url?: string | null
  signedUrl?: string | null
  pdf_signed_url?: string | null
  pdfSignedUrl?: string | null
  url?: string | null
  publicUrl?: string | null
  storage_path?: string | null
  original_file_path?: string | null
  original_pdf_path?: string | null
  file_path?: string | null
}

export function resolveDrawingStoragePath(drawing: DrawingUrlFields): string | null {
  const path =
    drawing.storage_path ||
    drawing.original_file_path ||
    drawing.original_pdf_path ||
    drawing.file_path ||
    null
  return typeof path === 'string' && path.trim() ? path.trim() : null
}

/** APIレスポンスからPDF用 signed_url を取り出す（一覧のプレビュー画像URLと区別） */
export function pickPdfSignedUrl(source: DrawingUrlFields | null | undefined): string | null {
  if (!source) return null

  const explicitPdf = source.pdf_signed_url ?? source.pdfSignedUrl ?? source.signedUrl ?? null
  if (explicitPdf) return explicitPdf

  const signedUrl = source.signed_url ?? null
  const imageUrl = source.image_signed_url ?? null
  if (signedUrl && (!imageUrl || signedUrl !== imageUrl)) {
    return signedUrl
  }

  return source.url ?? source.publicUrl ?? null
}

/** エクスポート用に signed_url / pdf_signed_url を正規化 */
export function normalizeDrawingPdfUrl<T extends DrawingUrlFields>(drawing: T): T & { signed_url: string | null; pdf_signed_url: string | null } {
  const pdfUrl = pickPdfSignedUrl(drawing)
  return {
    ...drawing,
    storage_path: resolveDrawingStoragePath(drawing),
    signed_url: pdfUrl,
    pdf_signed_url: pdfUrl,
  }
}

export async function fetchDrawingPdfSignedUrl(drawingId: string): Promise<string | null> {
  const res = await authedFetch(`/api/drawings/${drawingId}`)
  const data = (await res.json().catch(() => ({}))) as DrawingUrlFields & {
    drawing?: DrawingUrlFields
    error?: string
  }

  console.log('fetch drawing detail response', {
    drawingId,
    data,
  })

  if (!res.ok) {
    console.error('drawing fetch error:', data.error ?? drawingId)
    return null
  }

  const payload = data.drawing ?? data
  return pickPdfSignedUrl(payload)
}

export async function getDrawingWithSignedUrl<T extends DrawingUrlFields>(
  drawing: T,
): Promise<T & { signed_url: string | null; pdf_signed_url: string | null }> {
  const existingSignedUrl =
    pickPdfSignedUrl(drawing) ??
    drawing.signed_url ??
    drawing.signedUrl ??
    drawing.url ??
    drawing.publicUrl ??
    null

  if (existingSignedUrl) {
    return normalizeDrawingPdfUrl({
      ...drawing,
      signed_url: existingSignedUrl,
      pdf_signed_url: existingSignedUrl,
    })
  }

  const res = await authedFetch(`/api/drawings/${drawing.id}`)
  const data = (await res.json().catch(() => ({}))) as DrawingUrlFields & {
    drawing?: DrawingUrlFields
    error?: string
  }

  console.log('fetch drawing detail response', {
    drawingId: drawing.id,
    data,
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch drawing signed url: ${drawing.id}`)
  }

  const payload = data.drawing ?? data
  const signedUrl =
    pickPdfSignedUrl(payload) ??
    payload.signed_url ??
    payload.signedUrl ??
    payload.url ??
    payload.publicUrl ??
    null

  return normalizeDrawingPdfUrl({
    ...drawing,
    ...payload,
    signed_url: signedUrl,
    pdf_signed_url: signedUrl,
  })
}
