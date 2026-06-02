import {
  buildInspectionReportPdf,
  captureElement,
  includesDrawingPages,
  includesListPages,
  waitForDomUpdate,
  type PdfExportContentType,
  type PdfExportSplit,
} from '@/lib/pdf-export-client'
import {
  canvasToDataUrl,
  renderDrawingToCanvas,
  type DrawingForRender,
} from '@/lib/drawing-render-export'
import type { ExportIssue } from '@/lib/pdf-export-client'

export type InspectionPdfExportOptions = {
  exportContent: PdfExportContentType
  split: PdfExportSplit
  targetDrawings: DrawingForRender[]
  getDrawingIssues: (drawingId: string) => ExportIssue[]
  resolveDrawingPdfUrl: (drawingId: string) => Promise<string | null>
  getSelectedTableElement: () => HTMLElement | null
  getCommonTableElement: () => HTMLElement | null
  photoDetailImages?: string[]
  includePhotoDetail?: boolean
  filenameLabel?: string
  skipEmpty?: boolean
}

export async function exportInspectionPdf(
  options: InspectionPdfExportOptions,
): Promise<{ exported: boolean; blob?: Blob; filename?: string }> {
  const {
    exportContent,
    split,
    targetDrawings,
    getDrawingIssues,
    resolveDrawingPdfUrl,
    getSelectedTableElement,
    getCommonTableElement,
    photoDetailImages = [],
    includePhotoDetail: includePhotoDetailOption = false,
    filenameLabel,
    skipEmpty,
  } = options

  const { commonIssues: commonForExport, photoDetailIssues, selectedIssues, exportContractorLabel } =
    split
  const includeLists = includesListPages(exportContent)
  const includeDrawing = includesDrawingPages(exportContent)
  const includePhotoDetail = includePhotoDetailOption && photoDetailImages.length > 0
  const label = filenameLabel ?? exportContractorLabel

  console.log('PDF export condition', {
    exportContentType: exportContent,
    includeLists,
    includeDrawing,
    selectedIssuesCount: selectedIssues.length,
    commonIssuesCount: commonForExport.length,
    targetDrawingsCount: targetDrawings.length,
  })
  console.log('filteredIssues', [...selectedIssues, ...commonForExport])
  console.log('targetDrawings', targetDrawings)

  if (
    skipEmpty &&
    includeLists &&
    selectedIssues.length === 0 &&
    commonForExport.length === 0
  ) {
    return { exported: false }
  }
  if (skipEmpty && includeDrawing && targetDrawings.length === 0 && !includeLists) {
    return { exported: false }
  }

  if (includeLists && selectedIssues.length === 0 && commonForExport.length === 0 && !includeDrawing) {
    throw new Error('出力対象の指摘がありません')
  }
  if (includeDrawing && targetDrawings.length === 0 && !includeLists) {
    throw new Error('出力対象の図面がありません')
  }

  const selectedTableTarget = getSelectedTableElement()
  if (includeLists && selectedIssues.length + commonForExport.length > 0 && !selectedTableTarget) {
    throw new Error('指摘一覧表の出力対象が見つかりません')
  }

  await waitForDomUpdate()

  const selectedTableImage =
    includeLists && selectedTableTarget && selectedIssues.length > 0
      ? await captureElement(selectedTableTarget)
      : null

  let commonTableImage: string | null = null
  if (includeLists && commonForExport.length > 0) {
    const commonTableTarget = getCommonTableElement()
    if (!commonTableTarget) {
      throw new Error('共通指摘一覧表の出力対象が見つかりません')
    }
    commonTableImage = await captureElement(commonTableTarget)
  }

  const drawingImageDataList: string[] = []
  if (includeDrawing) {
    for (const drawing of targetDrawings) {
      const drawingIssues = getDrawingIssues(drawing.id)
      console.log('PDF export drawing', {
        drawingId: drawing.id,
        file_path: drawing.file_path,
        issueCount: drawingIssues.length,
      })

      try {
        const drawingWithUrl: DrawingForRender = {
          ...drawing,
          pdf_signed_url: drawing.pdf_signed_url ?? null,
        }
        const canvas = await renderDrawingToCanvas(drawingWithUrl, drawingIssues, {
          resolvePdfUrl: resolveDrawingPdfUrl,
        })
        drawingImageDataList.push(canvasToDataUrl(canvas))
      } catch (error) {
        console.error('Drawing render failed', { drawingId: drawing.id, error })
        throw error
      }
    }
  }

  const hasExportableList = selectedIssues.length > 0 || commonForExport.length > 0
  const hasExportableContent =
    hasExportableList || drawingImageDataList.length > 0 || photoDetailImages.length > 0
  if (skipEmpty && !hasExportableContent) {
    return { exported: false }
  }

  const { blob, filename } = await buildInspectionReportPdf({
    selectedTableImage,
    commonTableImage,
    drawingImageDataList,
    photoDetailImages,
    includeLists: includeLists && hasExportableList,
    includeDrawing,
    includePhotoDetail: includePhotoDetail && photoDetailImages.length > 0,
    hasCommonPage: includeLists && commonForExport.length > 0,
    filenameLabel: label,
  })

  return { exported: true, blob, filename }
}
