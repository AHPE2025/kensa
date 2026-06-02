import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { Contractor, Issue } from '@/lib/domain'
import { toAsciiFileName } from '@/lib/filename'

export type PdfExportContentType = 'list_and_drawing' | 'drawing_only' | 'list_only'

/** @deprecated Use PdfExportContentType */
export type LegacyPdfExportContentType = 'list' | 'drawing_and_list'

export type PdfExportCondition = {
  exportTarget: 'all' | 'unassigned' | 'contractor' | 'common'
  exportContractorId: string
  exportContentType: PdfExportContentType | LegacyPdfExportContentType
}

export function normalizeExportContentType(
  value: PdfExportContentType | LegacyPdfExportContentType | string | null | undefined,
): PdfExportContentType {
  if (value === 'drawing_only' || value === 'drawing-only') return 'drawing_only'
  if (value === 'list_only' || value === 'list') return 'list_only'
  if (value === 'list_and_drawing' || value === 'list-and-drawing' || value === 'drawing_and_list') {
    return 'list_and_drawing'
  }
  return 'list_and_drawing'
}

export function includesListPages(contentType: PdfExportContentType): boolean {
  return contentType === 'list_and_drawing' || contentType === 'list_only'
}

export function includesDrawingPages(contentType: PdfExportContentType): boolean {
  return contentType === 'list_and_drawing' || contentType === 'drawing_only'
}

export type PdfExportMeta = {
  projectName: string
  address: string
  inspectionDate: string
  exportDate: string
  contractorLabel: string
}

export type NumberedIssue = Issue & { no: number }

export type ExportIssue = Issue & { exportNo: number | string; no: number }

export type PdfExportSplit = {
  selectedIssues: ExportIssue[]
  commonIssues: ExportIssue[]
  drawingIssues: ExportIssue[]
  photoDetailIssues: ExportIssue[]
  excludedIssues: NumberedIssue[]
  separateCommonPage: boolean
  selectedContractor: Contractor | null
  exportContractorLabel: string
}

export type PhotoSignedUrlEntry = {
  issueId: string
  before_photo_path: string | null
  after_photo_path: string | null
  before_photo_url: string | null
  after_photo_url: string | null
  beforeError: boolean
  afterError: boolean
}

function formatExportTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export type BulkExportTarget = {
  exportTarget: 'contractor' | 'unassigned'
  exportContractorId: string
  label: string
}

export function listBulkExportTargets(
  contractors: Contractor[],
  issues: Issue[],
): BulkExportTarget[] {
  const targets: BulkExportTarget[] = contractors.map((contractor) => ({
    exportTarget: 'contractor',
    exportContractorId: contractor.id,
    label: contractor.name,
  }))
  if (issues.some(isUnassignedIssue)) {
    targets.push({
      exportTarget: 'unassigned',
      exportContractorId: 'all',
      label: '業者未定',
    })
  }
  return targets
}

export function buildInspectionReportFilename(label?: string): string {
  const safeLabel = label ? toAsciiFileName(label) : 'report'
  return `inspection_report_${safeLabel}_${formatExportTimestamp(new Date())}.pdf`
}

export async function waitForDomUpdate(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

const DOWNLOAD_INTERVAL_MS = 400

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export { DOWNLOAD_INTERVAL_MS }

export function isCommonIssue(issue: Issue): boolean {
  return issue.issue_category === 'common'
}

export function isUnassignedIssue(issue: Issue): boolean {
  return !issue.contractor_id && issue.issue_category !== 'common'
}

export { issueStatusLabel, normalizeIssueStatus, type IssueStatus } from '@/lib/issue-status'

function assignVendorExportNumbers(issues: Issue[]): ExportIssue[] {
  return issues.map((issue, index) => {
    const exportNo = index + 1
    return { ...issue, exportNo, no: exportNo }
  })
}

function assignCommonExportNumbers(issues: Issue[]): ExportIssue[] {
  return issues.map((issue, index) => {
    const exportNo = `C-${index + 1}`
    return { ...issue, exportNo, no: index + 1 }
  })
}

export function splitIssuesForPdfExport(
  issues: NumberedIssue[],
  condition: PdfExportCondition,
  contractors: Contractor[],
): PdfExportSplit {
  const commonIssuesRaw = issues.filter(isCommonIssue)
  let selectedIssuesRaw: NumberedIssue[] = []
  let exportContractorLabel: string
  let selectedContractor: Contractor | null = null
  let separateCommonPage = false
  let commonIssuesForPage: NumberedIssue[] = []

  if (condition.exportTarget === 'common') {
    selectedIssuesRaw = commonIssuesRaw
    commonIssuesForPage = []
    exportContractorLabel = '共通'
    separateCommonPage = false
  } else if (condition.exportTarget === 'unassigned') {
    selectedIssuesRaw = issues.filter(isUnassignedIssue)
    commonIssuesForPage = commonIssuesRaw
    exportContractorLabel = '業者未定'
    separateCommonPage = commonIssuesForPage.length > 0
  } else if (condition.exportTarget === 'contractor' && condition.exportContractorId !== 'all') {
    selectedContractor = contractors.find((item) => item.id === condition.exportContractorId) ?? null
    exportContractorLabel = selectedContractor?.name ?? '担当業者'
    selectedIssuesRaw = issues.filter(
      (issue) => !isCommonIssue(issue) && issue.contractor_id === condition.exportContractorId,
    )
    commonIssuesForPage = commonIssuesRaw
    separateCommonPage = commonIssuesForPage.length > 0
  } else {
    selectedIssuesRaw = issues.filter((issue) => !isCommonIssue(issue))
    commonIssuesForPage = commonIssuesRaw
    exportContractorLabel = '全業者'
    separateCommonPage = commonIssuesForPage.length > 0
  }

  const selectedIssues = assignVendorExportNumbers(selectedIssuesRaw)
  const commonIssues = assignCommonExportNumbers(commonIssuesForPage)
  const drawingIssues = [...selectedIssues, ...commonIssues]
  const photoDetailIssues = drawingIssues.filter(
    (issue) => issue.before_photo_path || issue.after_photo_path,
  )
  const includedIds = new Set(drawingIssues.map((issue) => issue.id))
  const excludedIssues = issues.filter((issue) => !includedIds.has(issue.id))

  return {
    selectedIssues,
    commonIssues,
    drawingIssues,
    photoDetailIssues,
    excludedIssues,
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

export async function waitForExportReady(element: HTMLElement, timeoutMs = 15000): Promise<void> {
  if (element.dataset.exportReady === 'true') return
  await new Promise<void>((resolve) => {
    const done = () => resolve()
    const observer = new MutationObserver(() => {
      if (element.dataset.exportReady === 'true') {
        observer.disconnect()
        done()
      }
    })
    observer.observe(element, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-export-ready'],
    })
    setTimeout(() => {
      observer.disconnect()
      done()
    }, timeoutMs)
  })
}

export async function waitForElementImages(element: HTMLElement, timeoutMs = 15000): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalHeight > 0) {
            resolve()
            return
          }
          const onDone = () => {
            img.removeEventListener('load', onDone)
            img.removeEventListener('error', onDone)
            resolve()
          }
          img.addEventListener('load', onDone)
          img.addEventListener('error', onDone)
          setTimeout(onDone, timeoutMs)
        }),
    ),
  )
}

export async function captureElement(element: HTMLElement): Promise<string> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    scrollX: 0,
    scrollY: 0,
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

function addImageFitPage(
  pdf: jsPDF,
  imageData: string,
  orientation: 'landscape' | 'portrait',
): Promise<void> {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = orientation === 'portrait' ? 10 : 8
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

async function addCapturedPage(
  pdf: jsPDF,
  imageData: string,
  isFirstPage: boolean,
  orientation: 'landscape' | 'portrait',
) {
  if (!isFirstPage) {
    pdf.addPage('a4', orientation)
  }
  await addImageFitPage(pdf, imageData, orientation)
}

export async function buildInspectionReportPdf(options: {
  selectedTableImage?: string | null
  commonTableImage?: string | null
  drawingImageData?: string | null
  drawingImageDataList?: string[]
  photoDetailImages?: string[]
  includeLists: boolean
  includeDrawing: boolean
  includePhotoDetail: boolean
  hasCommonPage: boolean
  filenameLabel?: string
}): Promise<{ blob: Blob; filename: string }> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  let pageCount = 0
  const pageOrientation: 'landscape' | 'portrait' = 'portrait'

  if (options.includeLists && options.selectedTableImage) {
    await addCapturedPage(pdf, options.selectedTableImage, pageCount === 0, pageOrientation)
    pageCount += 1
  }

  if (options.includeLists && options.hasCommonPage && options.commonTableImage) {
    await addCapturedPage(pdf, options.commonTableImage, pageCount === 0, pageOrientation)
    pageCount += 1
  }

  const drawingImages = [
    ...(options.drawingImageDataList ?? []),
    ...(options.drawingImageData ? [options.drawingImageData] : []),
  ]
  if (options.includeDrawing) {
    for (const imageData of drawingImages) {
      await addCapturedPage(pdf, imageData, pageCount === 0, pageOrientation)
      pageCount += 1
    }
  }

  if (options.includePhotoDetail && options.photoDetailImages) {
    for (const imageData of options.photoDetailImages) {
      await addCapturedPage(pdf, imageData, pageCount === 0, pageOrientation)
      pageCount += 1
    }
  }

  const filename = buildInspectionReportFilename(options.filenameLabel)
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
