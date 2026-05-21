'use client'

import dynamic from 'next/dynamic'

const PdfExportPage = dynamic(
  () => import('@/components/pdf-export-page').then((mod) => mod.PdfExportPage),
  { ssr: false },
)

export default function ProjectPdfExportPage() {
  return <PdfExportPage />
}
