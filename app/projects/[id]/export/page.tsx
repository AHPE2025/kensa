'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const PdfExportPage = dynamic(
  () => import('@/components/pdf-export-page').then((mod) => mod.PdfExportPage),
  { ssr: false },
)

function PdfExportPageFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">PDF出力確認ページを読み込み中...</p>
    </div>
  )
}

export default function ProjectPdfExportPage() {
  return (
    <Suspense fallback={<PdfExportPageFallback />}>
      <PdfExportPage />
    </Suspense>
  )
}
