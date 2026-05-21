import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { Contractor, Issue } from '@/lib/domain'

export type PdfExportCondition = {
  exportTarget: 'all' | 'unassigned' | 'contractor'
  exportContractorId: string
  exportContentType: 'list' | 'drawing_and_list'
}

export type PdfExportMeta = {
  projectName: string
  address: string
  inspectionDate: string
  exportDate: string
  contractorLabel: string
}

export type NumberedIssue = Issue & { no: number }

export type PdfExportSplit = {
  selectedIssues: NumberedIssue[]
  commonIssues: NumberedIssue[]
  drawingIssues: NumberedIssue[]
  separateCommonPage: boolean
  selectedContractor: Contractor | null
  exportContractorLabel: string
}

function formatExportTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function isCommonIssue(issue: Issue): boolean {
  if (issue.issue_category === 'common') return true
  if (issue.contractor?.name === '共通') return true
  return false
}

export function isUnassignedIssue(issue: Issue): boolean {
  return issue.contractor_id === null && !isCommonIssue(issue)
}

export function splitIssuesForPdfExport(
  issues: NumberedIssue[],
  condition: PdfExportCondition,
  contractors: Contractor[],
): PdfExportSplit {
  const commonIssues = issues.filter(isCommonIssue)
  let selectedIssues: NumberedIssue[]
  let exportContractorLabel: string
  let selectedContractor: Contractor | null = null
  let separateCommonPage = false

  if (condition.exportTarget === 'unassigned') {
    selectedIssues = issues.filter(isUnassignedIssue)
    exportContractorLabel = '業者未定'
    separateCommonPage = commonIssues.length > 0
  } else if (condition.exportTarget === 'contractor' && condition.exportContractorId !== 'all') {
    selectedContractor = contractors.find((item) => item.id === condition.exportContractorId) ?? null
    exportContractorLabel = selectedContractor?.name ?? '担当業者'
    selectedIssues = issues.filter(
      (issue) => !isCommonIssue(issue) && issue.contractor_id === condition.exportContractorId,
    )
    separateCommonPage = commonIssues.length > 0
  } else {
    selectedIssues = issues
    exportContractorLabel = '全業者'
    separateCommonPage = false
  }

  const drawingIssues = separateCommonPage
    ? [...selectedIssues, ...commonIssues]
    : selectedIssues

  return {
    selectedIssues,
    commonIssues,
    drawingIssues,
    separateCommonPage,
    selectedContractor,
    exportContractorLabel,
  }
}

/** @deprecated Use splitIssuesForPdfExport — kept for any external callers */
export function filterIssuesForExport(
  issues: NumberedIssue[],
  condition: PdfExportCondition,
): NumberedIssue[] {
  return splitIssuesForPdfExport(issues, condition, []).drawingIssues
}

export async function captureElement(element: HTMLElement): Promise<string> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    onclone: (_clonedDoc, clonedElement) => {
      const sourceCanvases = element.querySelectorAll('canvas')
      const clonedCanvases = clonedElement.querySelectorAll('canvas')
      clonedCanvases.forEach((clonedCanvas, index) => {
        const sourceCanvas = sourceCanvases[index]
        if (!sourceCanvas || !(clonedCanvas instanceof HTMLCanvasElement)) return
        const context = clonedCanvas.getContext('2d')
        if (!context) return
        clonedCanvas.width = sourceCanvas.width
        clonedCanvas.height = sourceCanvas.height
        context.drawImage(sourceCanvas, 0, 0)
      })
    },
  })
  return canvas.toDataURL('image/png')
}

/** @deprecated Use captureElement */
export const captureDrawingElement = captureElement

function addImageFitPage(pdf: jsPDF, imageData: string): Promise<void> {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 8
  const maxWidth = pageWidth - margin * 2
  const maxHeight = pageHeight - margin * 2

  const image = new Image()
  image.src = imageData
  return new Promise<void>((resolve, reject) => {
    image.onload = () => {
      const ratio = Math.min(maxWidth / image.width, maxHeight / image.height)
      const width = image.width * ratio
      const height = image.height * ratio
      const x = (pageWidth - width) / 2
      const y = (pageHeight - height) / 2
      pdf.addImage(imageData, 'PNG', x, y, width, height)
      resolve()
    }
    image.onerror = () => reject(new Error('Failed to load captured image'))
  })
}

async function addCapturedPage(pdf: jsPDF, imageData: string, isFirstPage: boolean) {
  if (!isFirstPage) {
    pdf.addPage('a4', 'landscape')
  }
  await addImageFitPage(pdf, imageData)
}

export async function buildInspectionReportPdf(options: {
  selectedTableImage?: string | null
  commonTableImage?: string | null
  drawingImageData?: string | null
  includeDrawing: boolean
  hasCommonPage: boolean
}): Promise<{ blob: Blob; filename: string }> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  let pageCount = 0

  if (options.selectedTableImage) {
    await addCapturedPage(pdf, options.selectedTableImage, pageCount === 0)
    pageCount += 1
  }

  if (options.hasCommonPage && options.commonTableImage) {
    await addCapturedPage(pdf, options.commonTableImage, pageCount === 0)
    pageCount += 1
  }

  if (options.includeDrawing && options.drawingImageData) {
    await addCapturedPage(pdf, options.drawingImageData, pageCount === 0)
  }

  const filename = `inspection_report_${formatExportTimestamp(new Date())}.pdf`
  return { blob: pdf.output('blob'), filename }
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
