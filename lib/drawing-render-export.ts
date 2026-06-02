import type { Drawing } from '@/lib/domain'
import type { ExportIssue } from '@/lib/pdf-export-client'
import { normalizeIssueStatus } from '@/lib/issue-status'
import { configurePdfJsWorker, getPdfJsModule } from '@/lib/pdfjs-client'

export type DrawingForRender = Drawing & {
  signed_url?: string | null
  pdf_signed_url?: string | null
  image_signed_url?: string | null
}

const DEFAULT_RENDER_WIDTH = 1100

function normalizeRotation(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  const normalized = ((numeric % 360) + 360) % 360
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized
  }
  return 0
}

export function resolveDrawingBackground(drawing: DrawingForRender | null): {
  type: 'pdf' | 'image'
  url: string
} | null {
  if (!drawing) return null

  const pageImages = Array.isArray(drawing.page_images) ? drawing.page_images : []
  if (pageImages.length > 0) {
    const imageUrl = drawing.image_signed_url ?? null
    if (imageUrl) return { type: 'image', url: imageUrl }
  }

  const pdfUrl =
    drawing.pdf_signed_url ??
    drawing.signed_url ??
    null
  if (pdfUrl) return { type: 'pdf', url: pdfUrl }

  const fallbackImageUrl = drawing.image_signed_url ?? null
  if (fallbackImageUrl) return { type: 'image', url: fallbackImageUrl }

  return null
}

function computeStageSize(
  contentWidth: number,
  contentHeight: number,
  renderWidth: number,
  rotation: number,
): { stageWidth: number; stageHeight: number } {
  const aspect = contentHeight / contentWidth
  const basePageWidth = renderWidth
  const basePageHeight = renderWidth * aspect
  const isQuarterTurn = rotation % 180 !== 0
  return {
    stageWidth: isQuarterTurn ? basePageHeight : basePageWidth,
    stageHeight: isQuarterTurn ? basePageWidth : basePageHeight,
  }
}

function clampRatio(value: number) {
  return Math.max(0.03, Math.min(0.97, value))
}

function toStageCoords(ratioX: number, ratioY: number, stageWidth: number, stageHeight: number) {
  return { x: ratioX * stageWidth, y: ratioY * stageHeight }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    for (const char of paragraph) {
      const next = current + char
      if (ctx.measureText(next).width > maxWidth && current.length > 0) {
        lines.push(current)
        current = char
      } else {
        current = next
      }
    }
    if (current) lines.push(current)
  }
  return lines.length > 0 ? lines : ['']
}

export function drawIssuePinsOnCanvas(
  ctx: CanvasRenderingContext2D,
  issues: ExportIssue[],
  stageWidth: number,
  stageHeight: number,
  pageIndex = 0,
) {
  const pageIssues = issues.filter((issue) => (issue.page_index ?? 0) === pageIndex)

  for (const issue of pageIssues) {
    const pin = toStageCoords(issue.pin_x, issue.pin_y, stageWidth, stageHeight)
    const callout = toStageCoords(issue.callout_x, issue.callout_y, stageWidth, stageHeight)
    const isDone = normalizeIssueStatus(issue.status) === '完了'
    const pinColor = isDone ? '#16a34a' : '#ea580c'
    const calloutBg = isDone ? '#f0fdf4' : '#fff7ed'
    const pinNo = issue.exportNo ?? issue.no
    const shortText = issue.issue_text?.trim() ? issue.issue_text.slice(0, 24) : '未入力'
    const calloutText = [`#${pinNo} ${issue.issue_type}`, shortText].filter(Boolean).join('\n')

    ctx.save()
    ctx.strokeStyle = pinColor
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(pin.x, pin.y)
    ctx.lineTo(callout.x, callout.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    ctx.save()
    ctx.fillStyle = pinColor
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(pin.x, pin.y, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(pinNo), pin.x, pin.y)
    ctx.restore()

    ctx.save()
    ctx.font = '11px sans-serif'
    const padding = 8
    const maxTextWidth = 220
    const lines = wrapText(ctx, calloutText, maxTextWidth)
    const lineHeight = 14
    const textHeight = lines.length * lineHeight
    const boxWidth = Math.min(
      maxTextWidth + padding * 2,
      Math.max(...lines.map((line) => ctx.measureText(line).width), 40) + padding * 2,
    )
    const boxHeight = textHeight + padding * 2
    const boxX = callout.x
    const boxY = callout.y
    drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 6)
    ctx.fillStyle = calloutBg
    ctx.fill()
    ctx.strokeStyle = pinColor
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#0f172a'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    lines.forEach((line, index) => {
      ctx.fillText(line, boxX + padding, boxY + padding + index * lineHeight)
    })
    ctx.restore()
  }
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load drawing image: ${url}`))
    image.src = url
  })
}

async function renderPdfBackgroundToCanvas(
  url: string,
  rotation: number,
  renderWidth: number,
): Promise<{ pdfCanvas: HTMLCanvasElement; stageWidth: number; stageHeight: number }> {
  configurePdfJsWorker()
  const pdfjs = await getPdfJsModule()

  console.log('pdf.js document loading', { url: url.slice(0, 80) })
  const loadingTask = pdfjs.getDocument({ url, withCredentials: false })
  const pdfDocument = await loadingTask.promise
  console.log('pdf.js document loaded')

  try {
    const page = await pdfDocument.getPage(1)
    console.log('pdf.js page loaded')

    const baseViewport = page.getViewport({ scale: 1, rotation })
    const scale = renderWidth / baseViewport.width
    const viewport = page.getViewport({ scale, rotation })
    const { stageWidth, stageHeight } = computeStageSize(
      baseViewport.width,
      baseViewport.height,
      renderWidth,
      rotation,
    )

    const pdfCanvas = document.createElement('canvas')
    pdfCanvas.width = Math.floor(viewport.width)
    pdfCanvas.height = Math.floor(viewport.height)
    const context = pdfCanvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D context is unavailable')
    }

    console.log('pdf.js render started')
    const renderTask = page.render({
      canvasContext: context,
      viewport,
      canvas: pdfCanvas,
    })
    await renderTask.promise
    console.log('pdf.js render completed')

    return { pdfCanvas, stageWidth, stageHeight }
  } finally {
    await pdfDocument.destroy()
  }
}

async function renderImageBackgroundToCanvas(
  url: string,
  rotation: number,
  renderWidth: number,
): Promise<{ pdfCanvas: HTMLCanvasElement; stageWidth: number; stageHeight: number }> {
  const image = await loadImageElement(url)
  const { stageWidth, stageHeight } = computeStageSize(
    image.naturalWidth,
    image.naturalHeight,
    renderWidth,
    rotation,
  )

  const pdfCanvas = document.createElement('canvas')
  pdfCanvas.width = Math.floor(stageWidth)
  pdfCanvas.height = Math.floor(stageHeight)
  const context = pdfCanvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context is unavailable')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height)

  const isQuarterTurn = rotation % 180 !== 0
  const drawWidth = isQuarterTurn ? stageHeight : stageWidth
  const drawHeight = isQuarterTurn ? stageWidth : stageHeight
  const scale = Math.min(drawWidth / image.naturalWidth, drawHeight / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  const offsetX = (pdfCanvas.width - width) / 2
  const offsetY = (pdfCanvas.height - height) / 2

  if (rotation !== 0) {
    context.save()
    context.translate(pdfCanvas.width / 2, pdfCanvas.height / 2)
    context.rotate((rotation * Math.PI) / 180)
    context.drawImage(image, -width / 2, -height / 2, width, height)
    context.restore()
  } else {
    context.drawImage(image, offsetX, offsetY, width, height)
  }

  return { pdfCanvas, stageWidth, stageHeight }
}

/**
 * 図面PDF/画像を canvas に描画し、指摘ピンを重ねて返す（画面プレビュー非依存）。
 */
export async function renderDrawingToCanvas(
  drawing: DrawingForRender,
  issues: ExportIssue[],
  options?: {
    renderWidth?: number
    pageIndex?: number
    resolvePdfUrl?: (drawingId: string) => Promise<string | null>
  },
): Promise<HTMLCanvasElement> {
  const renderWidth = options?.renderWidth ?? DEFAULT_RENDER_WIDTH
  const pageIndex = options?.pageIndex ?? 0
  const rotation = normalizeRotation(drawing.rotation)

  console.log('render drawing start', {
    drawingId: drawing.id,
    signed_url: drawing.signed_url ?? null,
    file_path: drawing.file_path,
    storage_path: (drawing as DrawingForRender & { storage_path?: string | null }).storage_path ?? null,
  })

  let background = resolveDrawingBackground(drawing)
  if (!background && options?.resolvePdfUrl) {
    const signedUrl = await options.resolvePdfUrl(drawing.id)
    console.log('drawing signedUrl resolved', {
      drawingId: drawing.id,
      file_path: drawing.file_path,
      signedUrl: signedUrl ? `${signedUrl.slice(0, 80)}...` : null,
    })
    if (signedUrl) {
      background = { type: 'pdf', url: signedUrl }
    }
  }

  if (!background) {
    throw new Error(`図面URLを取得できませんでした（${drawing.floor_label}）`)
  }

  const { pdfCanvas, stageWidth, stageHeight } =
    background.type === 'pdf'
      ? await renderPdfBackgroundToCanvas(background.url, rotation, renderWidth)
      : await renderImageBackgroundToCanvas(background.url, rotation, renderWidth)

  const stageCanvas = document.createElement('canvas')
  stageCanvas.width = Math.floor(stageWidth)
  stageCanvas.height = Math.floor(stageHeight)
  const stageCtx = stageCanvas.getContext('2d')
  if (!stageCtx) {
    throw new Error('Canvas 2D context is unavailable')
  }

  stageCtx.fillStyle = '#ffffff'
  stageCtx.fillRect(0, 0, stageCanvas.width, stageCanvas.height)

  const offsetX = (stageCanvas.width - pdfCanvas.width) / 2
  const offsetY = (stageCanvas.height - pdfCanvas.height) / 2
  stageCtx.drawImage(pdfCanvas, offsetX, offsetY)

  drawIssuePinsOnCanvas(stageCtx, issues, stageWidth, stageHeight, pageIndex)

  console.log('render drawing completed', drawing.id)

  return stageCanvas
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}
