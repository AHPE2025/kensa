import {
  sortDrawingsByFloorLabel,
  type Contractor,
  type Drawing,
  type Issue,
} from '@/lib/domain'
import {
  splitIssuesForPdfExport,
  type ExportIssue,
  type PdfExportCondition,
  type PdfExportSplit,
} from '@/lib/pdf-export-client'

export type NumberedIssue = Issue & { no: number }

export function applyFloorFilter(
  issues: NumberedIssue[],
  selectedFloor: 'all' | string,
  drawings: Drawing[],
): NumberedIssue[] {
  if (selectedFloor === 'all') return issues
  const floorDrawingIds = new Set(
    drawings.filter((drawing) => drawing.floor_label === selectedFloor).map((drawing) => drawing.id),
  )
  return issues.filter(
    (issue) => issue.floor_label === selectedFloor || floorDrawingIds.has(issue.drawing_id),
  )
}

export function getPdfExportSplit(
  issues: NumberedIssue[],
  condition: PdfExportCondition,
  contractors: Contractor[],
  selectedFloor: 'all' | string,
  drawings: Drawing[],
): PdfExportSplit {
  const floorFiltered = applyFloorFilter(issues, selectedFloor, drawings)
  return splitIssuesForPdfExport(floorFiltered, condition, contractors)
}

export function getFilteredIssues(
  issues: NumberedIssue[],
  condition: PdfExportCondition,
  contractors: Contractor[],
  selectedFloor: 'all' | string,
  drawings: Drawing[],
): ExportIssue[] {
  const split = getPdfExportSplit(issues, condition, contractors, selectedFloor, drawings)
  return [...split.selectedIssues, ...split.commonIssues]
}

function resolveIssueDrawingId(issue: ExportIssue): string {
  const record = issue as ExportIssue & { drawingId?: string | null }
  return record.drawing_id ?? record.drawingId ?? ''
}

export function getIssuesByDrawingId(filteredIssues: ExportIssue[], drawingId: string): ExportIssue[] {
  return filteredIssues.filter((issue) => resolveIssueDrawingId(issue) === drawingId)
}

export function getTargetDrawings<T extends Drawing>(
  drawings: T[],
  filteredIssues: ExportIssue[],
  selectedFloor: 'all' | string,
): T[] {
  const sorted = sortDrawingsByFloorLabel(drawings)
  const drawingIdsWithIssues = new Set(
    filteredIssues.map((issue) => resolveIssueDrawingId(issue)).filter(Boolean),
  )
  return sorted.filter((drawing) => {
    if (!drawingIdsWithIssues.has(drawing.id)) return false
    if (selectedFloor !== 'all' && drawing.floor_label !== selectedFloor) return false
    return true
  })
}
