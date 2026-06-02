'use client'

import { PdfExportIssueTable, type PdfExportIssueTableProps } from '@/components/pdf-export-issue-table'

export type InspectionListPreviewProps = PdfExportIssueTableProps & {
  previewScale?: number
}

export function InspectionListPreview({
  previewScale = 1,
  ...tableProps
}: InspectionListPreviewProps) {
  if (previewScale === 1) {
    return <PdfExportIssueTable {...tableProps} />
  }

  return (
    <div
      className="origin-top mx-auto"
      style={{
        width: 1122,
        transform: `scale(${previewScale})`,
      }}
    >
      <PdfExportIssueTable {...tableProps} />
    </div>
  )
}
