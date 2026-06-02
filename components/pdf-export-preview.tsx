'use client'

import type { Contractor, Drawing, Project } from '@/lib/domain'
import type { ExportIssue, PdfExportSplit } from '@/lib/pdf-export-client'
import { InspectionListPreview } from '@/components/inspection-list-preview'
import { DrawingPdfPreview, type DrawingPdfPreviewProps } from '@/components/drawing-pdf-preview'

type DrawingRow = Drawing & {
  signed_url?: string | null
  pdf_signed_url?: string | null
  image_signed_url?: string | null
}

export type PdfExportPreviewProps = {
  project: Project
  inspectionDateLabel: string
  exportDateLabel: string
  floorLabel: string
  showLists: boolean
  showDrawingPreview: boolean
  showCommonTable: boolean
  pdfExportSplit: PdfExportSplit
  selectedTableBadgeVariant: 'all' | 'contractor' | 'unassigned' | 'common'
  targetDrawings: DrawingRow[]
  filteredIssues: ExportIssue[]
  getDrawingIssues: (drawingId: string) => ExportIssue[]
  contractors: Contractor[]
  listPreviewScale?: number
  drawingPreviewScale?: number
}

export function PdfExportPreview({
  project,
  inspectionDateLabel,
  exportDateLabel,
  floorLabel,
  showLists,
  showDrawingPreview,
  showCommonTable,
  pdfExportSplit,
  selectedTableBadgeVariant,
  targetDrawings,
  getDrawingIssues,
  contractors,
  listPreviewScale = 0.75,
  drawingPreviewScale = 0.65,
}: PdfExportPreviewProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {showLists ? (
        <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
          <InspectionListPreview
            previewScale={listPreviewScale}
            title="検査指摘一覧表"
            projectName={project.name}
            address={project.address}
            inspectionDate={inspectionDateLabel}
            exportDate={exportDateLabel}
            floorLabel={floorLabel}
            badgeLabel={pdfExportSplit.exportContractorLabel}
            badgeVariant={selectedTableBadgeVariant}
            issues={pdfExportSplit.selectedIssues}
            emptyMessage="この条件の指摘はありません"
          />
        </div>
      ) : null}

      {showCommonTable ? (
        <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
          <InspectionListPreview
            previewScale={listPreviewScale}
            title="共通指摘一覧表"
            projectName={project.name}
            address={project.address}
            inspectionDate={inspectionDateLabel}
            exportDate={exportDateLabel}
            floorLabel={floorLabel}
            badgeLabel="共通"
            badgeVariant="common"
            issues={pdfExportSplit.commonIssues}
          />
        </div>
      ) : null}

      {showDrawingPreview ? (
        <div className="space-y-6">
          {targetDrawings.length === 0 ? (
            <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
              <div className="border-b border-slate-100 px-6 py-4">
                <h3 className="text-base font-semibold text-slate-900">図面プレビュー</h3>
              </div>
              <div className="p-6 text-center text-sm text-slate-500">
                対象指摘がある図面がありません
              </div>
            </div>
          ) : (
            targetDrawings.map((drawing) => {
              const drawingIssues = getDrawingIssues(drawing.id)
              return (
                <div
                  key={drawing.id}
                  className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"
                >
                  <div className="border-b border-slate-100 px-6 py-4">
                    <h3 className="text-base font-semibold text-slate-900">図面プレビュー</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {drawing.floor_label} — 指摘ピン（{drawingIssues.length}件）
                    </p>
                  </div>
                  <div className="p-4 md:p-6">
                    <DrawingPdfPreview
                      drawing={drawing}
                      issues={drawingIssues}
                      contractors={contractors}
                      scale={drawingPreviewScale}
                      showLabels
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

export type DrawingExportCaptureProps = Omit<DrawingPdfPreviewProps, 'scale' | 'showLabels'> & {
  exportRef?: React.Ref<HTMLDivElement>
}

export function DrawingExportCapture({
  exportRef,
  drawing,
  issues,
  contractors,
  renderWidth = 1100,
  pageIndex = 0,
}: DrawingExportCaptureProps) {
  return (
    <div ref={exportRef}>
      <DrawingPdfPreview
        drawing={drawing}
        issues={issues}
        contractors={contractors}
        scale={1}
        showLabels
        renderWidth={renderWidth}
        pageIndex={pageIndex}
      />
    </div>
  )
}
