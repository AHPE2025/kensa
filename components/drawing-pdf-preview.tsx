'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { Contractor, Drawing, Issue } from '@/lib/domain'
import type { ExportIssue } from '@/lib/pdf-export-client'
import { IssuePinsStage } from '@/components/issue-pins-stage'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type DrawingPdfPreviewDrawing = Drawing & {
  signed_url?: string | null
  pdf_signed_url?: string | null
  image_signed_url?: string | null
}

export type DrawingPdfPreviewProps = {
  drawing: DrawingPdfPreviewDrawing | null
  issues: ExportIssue[]
  contractors: Contractor[]
  scale?: number
  showLabels?: boolean
  renderWidth?: number
  pageIndex?: number
  onBackgroundReady?: () => void
}

function normalizeRotation(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  const normalized = ((numeric % 360) + 360) % 360
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized
  }
  return 0
}

function resolveBackground(drawing: DrawingPdfPreviewDrawing | null): {
  type: 'pdf' | 'image'
  url: string
} | null {
  if (!drawing) return null

  const pageImages = Array.isArray(drawing.page_images) ? drawing.page_images : []
  if (pageImages.length > 0) {
    const imageUrl = drawing.image_signed_url ?? null
    if (imageUrl) return { type: 'image', url: imageUrl }
  }

  const pdfUrl = drawing.pdf_signed_url ?? drawing.signed_url ?? null
  if (pdfUrl) return { type: 'pdf', url: pdfUrl }

  const fallbackImageUrl = drawing.image_signed_url ?? null
  if (fallbackImageUrl) return { type: 'image', url: fallbackImageUrl }

  return null
}

export function DrawingPdfPreview({
  drawing,
  issues,
  scale = 1,
  showLabels = true,
  renderWidth = 1100,
  pageIndex = 0,
  onBackgroundReady,
}: DrawingPdfPreviewProps) {
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(1)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [backgroundReady, setBackgroundReady] = useState(false)

  const background = useMemo(() => resolveBackground(drawing), [drawing])
  const rotation = normalizeRotation(drawing?.rotation)
  const pageAspect = pageSize ? pageSize.height / pageSize.width : imageSize ? imageSize.height / imageSize.width : 1.4142
  const basePageWidth = renderWidth
  const basePageHeight = renderWidth * pageAspect
  const isQuarterTurn = rotation % 180 !== 0
  const stageWidth = isQuarterTurn ? basePageHeight : basePageWidth
  const stageHeight = isQuarterTurn ? basePageWidth : basePageHeight

  const drawingPageIssues = useMemo(
    () => issues.filter((issue) => (issue.page_index ?? 0) === pageIndex),
    [issues, pageIndex],
  )

  useEffect(() => {
    setBackgroundReady(false)
  }, [drawing?.id, background?.url])

  useEffect(() => {
    if (background?.type !== 'image') {
      setImageSize(null)
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight })
      setBackgroundReady(true)
      onBackgroundReady?.()
    }
    image.onerror = () => {
      console.error('drawing image load failed:', background.url)
    }
    image.src = background.url
  }, [background, onBackgroundReady])

  useEffect(() => {
    if (drawingPageIssues.length > 0) {
      console.log(
        'PDF export drawing issues',
        drawing?.id,
        drawingPageIssues.map((issue) => ({
          id: issue.id,
          pin_x: issue.pin_x,
          pin_y: issue.pin_y,
          callout_x: issue.callout_x,
          callout_y: issue.callout_y,
        })),
      )
    }
  }, [drawing?.id, drawingPageIssues])

  const noop = useCallback(() => {}, [])

  if (!drawing) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 py-16 text-slate-500">
        <FileText className="h-12 w-12" />
        <p className="text-sm">図面データがありません</p>
      </div>
    )
  }

  if (!background) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 py-16 text-slate-500">
        <FileText className="h-12 w-12" />
        <p className="text-sm">指摘ピン付き図面がここに表示されます</p>
        <p className="text-xs">図面URLを取得できませんでした（{drawing.floor_label}）</p>
      </div>
    )
  }

  const scaledStageWidth = stageWidth * scale
  const scaledStageHeight = stageHeight * scale

  return (
    <div className="flex justify-center" data-export-ready={backgroundReady ? 'true' : 'false'}>
      <div
        className="relative bg-white shadow-sm"
        style={{ width: scaledStageWidth, height: scaledStageHeight }}
      >
        <div
          className="relative origin-top-left"
          style={{
            width: stageWidth,
            height: stageHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {background.type === 'pdf' ? (
            <Document
              file={background.url}
              onLoadSuccess={({ numPages }) => {
                setPdfPageCount(numPages)
                setBackgroundReady(true)
                onBackgroundReady?.()
              }}
              loading={<div className="p-4 text-sm text-slate-500">図面を読み込み中...</div>}
              error={<div className="p-4 text-sm text-red-600">図面PDFの読み込みに失敗しました</div>}
            >
              <Page
                pageNumber={Math.min(pageIndex + 1, pdfPageCount)}
                width={renderWidth}
                rotate={rotation}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(page) => {
                  const viewport = page.getViewport({ scale: 1 })
                  setPageSize({ width: viewport.width, height: viewport.height })
                  setBackgroundReady(true)
                  onBackgroundReady?.()
                }}
              />
            </Document>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={background.url}
              alt={`${drawing.floor_label} 図面`}
              className="block h-full w-full object-contain"
              crossOrigin="anonymous"
            />
          )}
          <IssuePinsStage
            pinsToRender={drawingPageIssues}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            mode="view"
            selectedIssueId={null}
            isExporting
            pdfExportMode={showLabels}
            visibleContractorIds={new Set()}
            getIssueContractorId={() => ''}
            onStageClick={noop}
            onSelect={noop}
            onEdit={noop}
            onDeleteRequest={noop}
            onDragPin={noop}
            onDragCallout={noop}
          />
        </div>
      </div>
    </div>
  )
}
