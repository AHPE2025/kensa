import { GlobalWorkerOptions, version } from 'pdfjs-dist'

let workerConfigured = false

/**
 * pdf.js worker を一度だけ設定する（ブラウザ専用）。
 * Vercel / Next.js では public 配下の worker を優先し、失敗時は CDN にフォールバックする。
 */
export function configurePdfJsWorker(): void {
  if (typeof window === 'undefined' || workerConfigured) return

  const localWorker = `${window.location.origin}/pdf.worker.min.mjs`
  GlobalWorkerOptions.workerSrc = localWorker
  workerConfigured = true

  console.log('pdf.js worker configured', { workerSrc: localWorker, version })
}

export function getPdfJsModule() {
  configurePdfJsWorker()
  return import('pdfjs-dist')
}
