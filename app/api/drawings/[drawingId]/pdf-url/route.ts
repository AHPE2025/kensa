import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { createDrawingPdfSignedUrl } from '@/lib/drawing-signed-url'

type Params = { params: Promise<{ drawingId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { drawingId } = await params

  const { data: drawing, error } = await client
    .from('drawings')
    .select('id, file_path, original_pdf_path, page_images')
    .eq('id', drawingId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !drawing) {
    return NextResponse.json({ error: '図面が見つかりません' }, { status: 404 })
  }

  const signedUrl = await createDrawingPdfSignedUrl(client, drawing)
  if (!signedUrl) {
    return NextResponse.json({ error: '図面PDFの署名付きURLを取得できませんでした' }, { status: 404 })
  }

  return NextResponse.json({ signedUrl, drawingId })
}
