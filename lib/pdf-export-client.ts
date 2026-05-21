import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { Issue } from '@/lib/domain'

export type PdfExportCondition = {
  exportTarget: 'all' | 'unassigned' | 'contractor'
  exportContractorId: string
  exportContentType: 'list' | 'drawing_and_list'
}

export type PdfExportMeta = {
  projectName: string
  address: string
  contractorLabel: string
  exportDate: string
}

type NumberedIssue = Issue & { no: number }

function formatExportTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function issueContractorLabel(issue: Issue): string {
  if (issue.issue_category === 'common') return 'Common'
  return issue.contractor?.name ?? 'Unassigned'
}

function issueStatusLabel(status: string): string {
  if (status === 'done' || status === '完了') return 'Done'
  return 'Open'
}

function issueTextLabel(text: string | null): string {
  const trimmed = text?.trim()
  return trimmed ? trimmed.slice(0, 40) : 'N/A'
}

export function filterIssuesForExport(
  issues: NumberedIssue[],
  condition: PdfExportCondition,
): NumberedIssue[] {
  if (condition.exportTarget === 'unassigned') {
    return issues.filter((issue) => issue.contractor_id === null)
  }
  if (condition.exportTarget === 'contractor' && condition.exportContractorId !== 'all') {
    return issues.filter((issue) => issue.contractor_id === condition.exportContractorId)
  }
  return issues
}

export async function captureDrawingElement(element: HTMLElement): Promise<string> {
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

function addSummaryPage(pdf: jsPDF, meta: PdfExportMeta, issues: NumberedIssue[]) {
  const margin = 10
  let y = margin

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('Inspection Report', margin, y)
  y += 12

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  const lines = [
    `Project: ${meta.projectName}`,
    `Address: ${meta.address}`,
    `Date: ${meta.exportDate}`,
    `Contractor: ${meta.contractorLabel}`,
    `Issue Count: ${issues.length}`,
  ]
  for (const line of lines) {
    pdf.text(line, margin, y)
    y += 6
  }
  y += 4

  const headers = ['No', 'Floor', 'Type', 'Text', 'Contractor', 'Status']
  const colX = [margin, 22, 40, 58, 118, 168]
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  headers.forEach((header, index) => pdf.text(header, colX[index], y))
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)

  const pageHeight = pdf.internal.pageSize.getHeight()
  for (const issue of issues) {
    if (y > pageHeight - margin) {
      pdf.addPage()
      y = margin
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      headers.forEach((header, index) => pdf.text(header, colX[index], y))
      y += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
    }
    const row = [
      String(issue.no),
      issue.floor_label,
      issue.issue_type,
      issueTextLabel(issue.issue_text),
      issueContractorLabel(issue),
      issueStatusLabel(issue.status),
    ]
    row.forEach((cell, index) => pdf.text(cell, colX[index], y))
    y += 5
  }
}

function addDrawingPage(pdf: jsPDF, imageData: string) {
  pdf.addPage()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 10
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
    image.onerror = () => reject(new Error('Failed to load drawing capture'))
  })
}

export async function buildInspectionReportPdf(options: {
  meta: PdfExportMeta
  issues: NumberedIssue[]
  condition: PdfExportCondition
  drawingImageData?: string | null
}): Promise<{ blob: Blob; filename: string }> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  addSummaryPage(pdf, options.meta, options.issues)

  if (options.condition.exportContentType === 'drawing_and_list' && options.drawingImageData) {
    await addDrawingPage(pdf, options.drawingImageData)
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
