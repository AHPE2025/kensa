'use client'

import { memo, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { Issue } from '@/lib/domain'
import type { EditorMode } from '@/lib/stores/editor-store'
import { IssuePinsStage } from '@/components/issue-pins-stage'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

type NumberedIssue = Issue & { no: number }

type PdfLayerProps = {
  pdfUrl: string
  pageIndex: number
  totalPages: number
  renderWidth: number
  rotation: number
  stageWidth: number
  stageHeight: number
  onPdfLoadSuccess: (numPages: number) => void
  onPdfLoadError: () => void
  onPageLoadSuccess: (width: number, height: number) => void
}

const PdfLayer = memo(function PdfLayer({
  pdfUrl,
  pageIndex,
  totalPages,
  renderWidth,
  rotation,
  stageWidth,
  stageHeight,
  onPdfLoadSuccess,
  onPdfLoadError,
  onPageLoadSuccess,
}: PdfLayerProps) {
  const handlePageLoadSuccess = useCallback(
    (page: { getViewport: (opts: { scale: number }) => { width: number; height: number } }) => {
      const viewport = page.getViewport({ scale: 1 })
      onPageLoadSuccess(viewport.width, viewport.height)
    },
    [onPageLoadSuccess],
  )

  return (
    <Document
      file={pdfUrl}
      onLoadSuccess={({ numPages }) => onPdfLoadSuccess(numPages)}
      onLoadError={onPdfLoadError}
      loading={<div className="p-6 text-sm text-muted-foreground">PDFを読み込み中...</div>}
    >
      <Page
        pageNumber={Math.min(pageIndex + 1, totalPages)}
        width={renderWidth}
        rotate={rotation}
        onLoadSuccess={handlePageLoadSuccess}
      />
    </Document>
  )
})

type DrawingCanvasProps = {
  pdfUrl: string
  pageIndex: number
  totalPages: number
  renderWidth: number
  rotation: number
  stageWidth: number
  stageHeight: number
  effectiveScale: number
  pinsToRender: NumberedIssue[]
  mode: EditorMode
  selectedIssueId: string | null
  isExporting: boolean
  visibleContractorIds: Set<string>
  getIssueContractorId: (issue: Issue) => string
  onPdfLoadSuccess: (numPages: number) => void
  onPdfLoadError: () => void
  onPageLoadSuccess: (width: number, height: number) => void
  onStageClick: (event: {
    target: {
      getStage: () => unknown
      getPointerPosition?: () => { x: number; y: number } | null
    }
  }) => void
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onDeleteRequest: (issue: NumberedIssue) => void
  onDragPin: (issueId: string, pinX: number, pinY: number) => boolean | void | Promise<boolean | void>
  onDragCallout: (issueId: string, calloutX: number, calloutY: number) => boolean | void | Promise<boolean | void>
  canvasRef?: React.RefObject<HTMLDivElement | null>
}

function DrawingCanvasComponent({
  pdfUrl,
  pageIndex,
  totalPages,
  renderWidth,
  rotation,
  stageWidth,
  stageHeight,
  effectiveScale,
  pinsToRender,
  mode,
  selectedIssueId,
  isExporting,
  visibleContractorIds,
  getIssueContractorId,
  onPdfLoadSuccess,
  onPdfLoadError,
  onPageLoadSuccess,
  onStageClick,
  onSelect,
  onEdit,
  onDeleteRequest,
  onDragPin,
  onDragCallout,
  canvasRef,
}: DrawingCanvasProps) {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div
        className="relative overflow-hidden bg-white p-2 shadow"
        style={{ transform: `scale(${effectiveScale})`, transformOrigin: 'center center' }}
      >
        <div ref={canvasRef} className="relative" style={{ width: stageWidth, height: stageHeight }}>
          <PdfLayer
            pdfUrl={pdfUrl}
            pageIndex={pageIndex}
            totalPages={totalPages}
            renderWidth={renderWidth}
            rotation={rotation}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            onPdfLoadSuccess={onPdfLoadSuccess}
            onPdfLoadError={onPdfLoadError}
            onPageLoadSuccess={onPageLoadSuccess}
          />
          <IssuePinsStage
            pinsToRender={pinsToRender}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            mode={mode}
            selectedIssueId={selectedIssueId}
            isExporting={isExporting}
            visibleContractorIds={visibleContractorIds}
            getIssueContractorId={getIssueContractorId}
            onStageClick={onStageClick}
            onSelect={onSelect}
            onEdit={onEdit}
            onDeleteRequest={onDeleteRequest}
            onDragPin={onDragPin}
            onDragCallout={onDragCallout}
          />
        </div>
      </div>
    </div>
  )
}

export const DrawingCanvas = memo(DrawingCanvasComponent)
