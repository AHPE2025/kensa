'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { authedFetch } from '@/lib/authed-fetch'
import {
  sortDrawingsByFloorLabel,
  type Contractor,
  type Drawing,
  type Issue,
  type Project,
} from '@/lib/domain'
import { normalizeIssueStatus } from '@/lib/issue-status'
import {
  createPhotoSignedUrlsForExport,
  mergePhotoSignedUrls,
} from '@/lib/issue-photos-client'
import {
  buildInspectionReportPdf,
  captureElement,
  downloadPdfBlob,
  splitIssuesForPdfExport,
  waitForElementImages,
  type PdfExportCondition,
} from '@/lib/pdf-export-client'
import { PdfExportIssueTable } from '@/components/pdf-export-issue-table'
import { PdfExportPhotoDetailPage, type PhotoDetailIssue } from '@/components/pdf-export-photo-detail'
import { PdfExportPhotoPreviewSection } from '@/components/pdf-export-photo-preview'
import { IssuePinsStage } from '@/components/issue-pins-stage'
import { useAuthStore } from '@/lib/stores/auth-store'
import { toast } from 'sonner'

type DrawingRow = Drawing & {
  signed_url: string | null
  issue_count?: number
  file_name?: string | null
}

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

function normalizeRotation(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  const normalized = ((numeric % 360) + 360) % 360
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized
  }
  return 0
}

function countStatusStats(issues: Issue[]) {
  let open = 0
  let done = 0
  for (const issue of issues) {
    if (normalizeIssueStatus(issue.status) === '完了') {
      done += 1
    } else {
      open += 1
    }
  }
  return { total: issues.length, open, done }
}

type PdfExportPageProps = {
  projectId?: string
}

export function PdfExportPage({ projectId: projectIdProp }: PdfExportPageProps = {}) {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const loadingAuth = useAuthStore((s) => s.loading)

  const projectId = projectIdProp ?? params.id
  const drawingId = searchParams.get('drawingId')

  const [project, setProject] = useState<Project | null>(null)
  const [drawings, setDrawings] = useState<DrawingRow[]>([])
  const [drawing, setDrawing] = useState<DrawingRow | null>(null)
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(1)
  const [photoDetailExportData, setPhotoDetailExportData] = useState<PhotoDetailIssue[]>([])
  const [previewPhotoIssues, setPreviewPhotoIssues] = useState<PhotoDetailIssue[]>([])
  const [loadingPreviewPhotos, setLoadingPreviewPhotos] = useState(false)

  const [selectedContractorId, setSelectedContractorId] = useState<string>('')
  const [selectedDrawingId, setSelectedDrawingId] = useState<string>('')
  const [exportContent, setExportContent] = useState<'drawing_and_list' | 'drawing_only'>('drawing_and_list')

  const selectedTableExportRef = useRef<HTMLDivElement | null>(null)
  const commonTableExportRef = useRef<HTMLDivElement | null>(null)
  const drawingExportRef = useRef<HTMLDivElement | null>(null)
  const photoDetailExportRefs = useRef<(HTMLDivElement | null)[]>([])

  const pdfUrl = drawing?.signed_url ?? null
  const rotation = normalizeRotation(drawing?.rotation)
  const renderWidth = 1100
  const pageAspect = pageSize ? pageSize.height / pageSize.width : 1.4142
  const basePageWidth = renderWidth
  const basePageHeight = renderWidth * pageAspect
  const isQuarterTurn = rotation % 180 !== 0
  const stageWidth = isQuarterTurn ? basePageHeight : basePageWidth
  const stageHeight = isQuarterTurn ? basePageWidth : basePageHeight
  const drawingPageIndex = 0

  useEffect(() => {
    if (!loadingAuth && !user) router.replace('/login')
  }, [loadingAuth, user, router])

  const loadDrawingWithSignedUrl = useCallback(
    async (targetDrawingId: string, drawingFromList: DrawingRow | null): Promise<DrawingRow | null> => {
      const issueRes = await authedFetch(`/api/drawings/${targetDrawingId}/issues`)
      const issueData = (await issueRes.json()) as {
        drawing?: DrawingRow
        issues?: Issue[]
        error?: string
      }
      if (!issueRes.ok || !issueData.drawing) {
        return drawingFromList
      }
      return {
        ...drawingFromList,
        ...issueData.drawing,
        storage_path: issueData.drawing.storage_path ?? issueData.drawing.file_path ?? null,
        signed_url: issueData.drawing.signed_url ?? drawingFromList?.signed_url ?? null,
      }
    },
    [],
  )

  const loadData = useCallback(async () => {
    if (!projectId) {
      setLoadError('案件IDが取得できません。')
      setLoading(false)
      return
    }

    if (!drawingId) {
      setLoadError('図面IDが指定されていません。図面編集画面からPDF出力を開いてください。')
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)

    try {
      const [projectRes, drawingListRes, contractorRes] = await Promise.all([
        authedFetch(`/api/projects/${projectId}`),
        authedFetch(`/api/projects/${projectId}/drawings`),
        authedFetch(`/api/projects/${projectId}/contractors`),
      ])

      const projectData = (await projectRes.json()) as { project?: Project; error?: string }
      const drawingListData = (await drawingListRes.json()) as { drawings?: DrawingRow[]; error?: string }
      const contractorData = (await contractorRes.json()) as { contractors?: Contractor[]; error?: string }

      if (!projectRes.ok || !projectData.project) {
        throw new Error('案件情報が見つかりません。')
      }
      if (!drawingListRes.ok) {
        throw new Error(drawingListData.error ?? '図面一覧の取得に失敗しました')
      }

      const resolvedContractors = contractorData.contractors ?? []
      const sortedDrawingsList = sortDrawingsByFloorLabel(drawingListData.drawings ?? [])

      const drawingFromList = sortedDrawingsList.find((item) => item.id === drawingId) ?? null
      if (!drawingFromList) {
        throw new Error('図面情報が見つかりません。')
      }

      const issueResults = await Promise.all(
        sortedDrawingsList.map(async (item) => {
          const issueRes = await authedFetch(`/api/drawings/${item.id}/issues`)
          const issueData = (await issueRes.json()) as { issues?: Issue[]; error?: string }
          if (!issueRes.ok) {
            console.error('pdf export page load error:', issueData.error ?? '指摘情報を取得できませんでした')
            return [] as Issue[]
          }
          return issueData.issues ?? []
        }),
      )
      const allIssues = issueResults.flat()

      const resolvedDrawing = await loadDrawingWithSignedUrl(drawingId, drawingFromList)
      if (!resolvedDrawing) {
        throw new Error('図面情報が見つかりません。')
      }

      setProject(projectData.project)
      setDrawings(sortedDrawingsList)
      setDrawing(resolvedDrawing)
      setContractors(resolvedContractors)
      setIssues(allIssues)
      setSelectedDrawingId(drawingId)
      setSelectedContractorId(resolvedContractors[0]?.id ?? '')
    } catch (error) {
      console.error('pdf export page load error:', error)
      const message = error instanceof Error ? error.message : 'PDF出力に必要な情報が取得できません'
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }, [drawingId, loadDrawingWithSignedUrl, projectId])

  useEffect(() => {
    if (user) void loadData()
  }, [user, loadData])

  useEffect(() => {
    if (loading || !selectedDrawingId || !drawings.length) return

    const updatePreviewDrawing = async () => {
      const targetDrawing = drawings.find((item) => item.id === selectedDrawingId) ?? null
      if (!targetDrawing) return
      if (drawing?.id === targetDrawing.id && drawing.signed_url) return

      const resolved = await loadDrawingWithSignedUrl(targetDrawing.id, targetDrawing)
      if (resolved) {
        setDrawing(resolved)
      }
    }

    void updatePreviewDrawing()
  }, [drawing?.id, drawing?.signed_url, drawings, loadDrawingWithSignedUrl, loading, selectedDrawingId])

  const sortedDrawings = useMemo(() => sortDrawingsByFloorLabel(drawings), [drawings])

  const selectedDrawing = useMemo(
    () => sortedDrawings.find((item) => item.id === selectedDrawingId) ?? null,
    [selectedDrawingId, sortedDrawings],
  )

  const selectedFloorLabel = selectedDrawing?.floor_label ?? ''

  const exportDateLabel = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const inspectionDateLabel = useMemo(
    () => project?.inspection_date?.slice(0, 10) ?? exportDateLabel,
    [exportDateLabel, project?.inspection_date],
  )

  const exportCondition = useMemo<PdfExportCondition>(
    () => ({
      exportTarget: 'contractor',
      exportContractorId: selectedContractorId || 'all',
      exportContentType: 'drawing_and_list',
    }),
    [selectedContractorId],
  )

  const numberedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
    return sorted.map((issue, index) => ({ ...issue, no: index + 1 }))
  }, [issues])

  const drawingFilteredIssues = useMemo(() => {
    if (!selectedDrawingId) return []
    return numberedIssues.filter((issue) => issue.drawing_id === selectedDrawingId)
  }, [numberedIssues, selectedDrawingId])

  const pdfExportSplit = useMemo(
    () => splitIssuesForPdfExport(drawingFilteredIssues, exportCondition, contractors),
    [drawingFilteredIssues, exportCondition, contractors],
  )

  const selectedVendorIssues = pdfExportSplit.selectedIssues
  const commonIssues = pdfExportSplit.commonIssues
  const previewIssuesForDrawing = pdfExportSplit.drawingIssues

  const exportDrawingPageIssues = useMemo(
    () => previewIssuesForDrawing.filter((issue) => issue.page_index === drawingPageIndex),
    [previewIssuesForDrawing, drawingPageIndex],
  )

  const selectedVendorStats = useMemo(() => countStatusStats(selectedVendorIssues), [selectedVendorIssues])

  const photoDetailIssuesForPreview = useMemo(() => {
    if (exportContent !== 'drawing_and_list') return []
    return previewIssuesForDrawing.filter(
      (issue) => issue.before_photo_path || issue.after_photo_path,
    )
  }, [exportContent, previewIssuesForDrawing])

  useEffect(() => {
    if (photoDetailIssuesForPreview.length === 0) {
      setPreviewPhotoIssues([])
      return
    }

    let cancelled = false
    const loadPreviewPhotos = async () => {
      setLoadingPreviewPhotos(true)
      try {
        const signedUrls = await createPhotoSignedUrlsForExport(photoDetailIssuesForPreview)
        if (cancelled) return
        setPreviewPhotoIssues(mergePhotoSignedUrls(photoDetailIssuesForPreview, signedUrls))
      } catch (error) {
        console.error('preview photo signed url error:', error)
        if (!cancelled) {
          setPreviewPhotoIssues(
            mergePhotoSignedUrls(
              photoDetailIssuesForPreview,
              photoDetailIssuesForPreview.map((issue) => ({
                issueId: issue.id,
                before_photo_path: issue.before_photo_path ?? null,
                after_photo_path: issue.after_photo_path ?? null,
                before_photo_url: null,
                after_photo_url: null,
                beforeError: Boolean(issue.before_photo_path),
                afterError: Boolean(issue.after_photo_path),
              })),
            ),
          )
        }
      } finally {
        if (!cancelled) setLoadingPreviewPhotos(false)
      }
    }

    void loadPreviewPhotos()
    return () => {
      cancelled = true
    }
  }, [photoDetailIssuesForPreview])

  const handleFloorChange = (floorLabel: string) => {
    const targetDrawing = sortedDrawings.find((item) => item.floor_label === floorLabel)
    if (targetDrawing) {
      setSelectedDrawingId(targetDrawing.id)
    }
  }

  const noop = useCallback(() => {}, [])

  const handleBulkExport = useCallback(() => {
    toast.info('全業者一括出力は次の工程で実装します')
  }, [])

  const handlePdfExport = useCallback(async () => {
    if (!selectedContractorId) {
      toast.error('出力する業者を選択してください')
      return
    }

    try {
      setIsExporting(true)

      const { commonIssues: commonForExport, photoDetailIssues } = pdfExportSplit

      const includeLists = exportContent === 'drawing_and_list'
      const includeDrawing = true
      const includePhotoDetail = includeLists && photoDetailIssues.length > 0

      const selectedTableTarget = selectedTableExportRef.current
      if (includeLists && !selectedTableTarget) {
        throw new Error('指摘一覧表の出力対象が見つかりません')
      }

      let photoDetailIssuesWithUrls: PhotoDetailIssue[] = []
      if (includePhotoDetail && photoDetailIssues.length > 0) {
        const signedUrls = await createPhotoSignedUrlsForExport(photoDetailIssues)
        photoDetailIssuesWithUrls = mergePhotoSignedUrls(photoDetailIssues, signedUrls)
        setPhotoDetailExportData(photoDetailIssuesWithUrls)
      } else {
        setPhotoDetailExportData([])
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

      const selectedTableImage =
        includeLists && selectedTableTarget ? await captureElement(selectedTableTarget) : null

      let commonTableImage: string | null = null
      if (includeLists && commonForExport.length > 0) {
        const commonTableTarget = commonTableExportRef.current
        if (!commonTableTarget) {
          throw new Error('共通指摘一覧表の出力対象が見つかりません')
        }
        commonTableImage = await captureElement(commonTableTarget)
      }

      let drawingImageData: string | null = null
      if (includeDrawing) {
        const drawingTarget = drawingExportRef.current
        if (!drawingTarget) {
          throw new Error('図面の出力対象が見つかりません')
        }
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        drawingImageData = await captureElement(drawingTarget)
      }

      const photoDetailImages: string[] = []
      if (includePhotoDetail) {
        for (let index = 0; index < photoDetailIssuesWithUrls.length; index += 1) {
          const target = photoDetailExportRefs.current[index]
          if (!target) continue
          await waitForElementImages(target)
          photoDetailImages.push(await captureElement(target))
        }
      }

      const { blob, filename } = await buildInspectionReportPdf({
        selectedTableImage,
        commonTableImage,
        drawingImageData,
        photoDetailImages,
        includeLists,
        includeDrawing,
        includePhotoDetail,
        hasCommonPage: includeLists && commonForExport.length > 0,
      })

      downloadPdfBlob(blob, filename)
      toast.success(`${pdfExportSplit.exportContractorLabel}のPDFを出力しました`)
    } catch (error) {
      console.error('pdf export page error:', error)
      toast.error('PDF出力に失敗しました')
    } finally {
      setPhotoDetailExportData([])
      setIsExporting(false)
    }
  }, [exportContent, pdfExportSplit, selectedContractorId])

  const backHref =
    projectId && drawingId
      ? `/projects/${projectId}/drawings/${drawingId}`
      : projectId
        ? `/projects/${projectId}`
        : '/projects'

  if (!projectId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 p-6">
        <Card className="max-w-md shadow-sm">
          <CardContent className="p-6 text-center text-sm text-destructive">
            案件IDが取得できません。
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!drawingId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 p-6">
        <Card className="max-w-md shadow-sm">
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-sm text-destructive">
              図面IDが指定されていません。図面編集画面からPDF出力を開いてください。
            </p>
            <Button variant="outline" onClick={() => router.push(`/projects/${projectId}`)}>
              案件詳細に戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-muted-foreground">読み込み中です...</p>
      </div>
    )
  }

  if (loadError || !project || !drawing) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 p-6">
        <Card className="max-w-md shadow-sm">
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-sm text-destructive">
              {loadError ?? 'PDF出力に必要な情報が取得できません'}
            </p>
            <Button variant="outline" onClick={() => router.push(backHref)}>
              図面編集に戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const showLists = exportContent === 'drawing_and_list'
  const showCommonTable = showLists && commonIssues.length > 0
  const showPhotoDetails = showLists && previewPhotoIssues.length > 0
  const hasContractors = contractors.length > 0

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => router.push(backHref)}
              >
                <ArrowLeft className="h-4 w-4" />
                図面編集に戻る
              </Button>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 md:text-xl">検査表PDF出力</h1>
              <p className="mt-1 text-sm text-slate-600">
                {project.name}
                <span className="mx-2 text-slate-300">|</span>
                検査日：{inspectionDateLabel}
                <span className="mx-2 text-slate-300">|</span>
                対象階：{selectedFloorLabel || '—'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-10 gap-2 bg-white px-3 md:h-11 md:px-4"
              onClick={handleBulkExport}
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">全業者一括出力</span>
              <span className="sm:hidden">一括出力</span>
            </Button>
            <Button
              className="h-10 gap-2 bg-blue-600 px-3 hover:bg-blue-700 md:h-11 md:px-4"
              disabled={isExporting || !hasContractors}
              onClick={() => void handlePdfExport()}
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'PDF作成中...' : 'PDF出力'}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-100 lg:w-[320px] lg:border-b-0 lg:border-r">
          <ScrollArea className="h-full max-h-[40vh] lg:max-h-none">
            <div className="space-y-4 p-4">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">出力設定</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">業者選択</Label>
                    {hasContractors ? (
                      <Select value={selectedContractorId} onValueChange={setSelectedContractorId}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="業者を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {contractors.map((contractor) => (
                            <SelectItem key={contractor.id} value={contractor.id}>
                              {contractor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        業者が登録されていません
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">階選択</Label>
                    <Select
                      value={selectedFloorLabel}
                      onValueChange={handleFloorChange}
                      disabled={sortedDrawings.length === 0}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="階を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedDrawings.map((item) => (
                          <SelectItem key={item.id} value={item.floor_label}>
                            {item.floor_label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">出力内容</Label>
                    <RadioGroup
                      value={exportContent}
                      onValueChange={(value) =>
                        setExportContent(value as 'drawing_and_list' | 'drawing_only')
                      }
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="drawing_and_list" id="pdf-list-and-drawing" />
                        <Label htmlFor="pdf-list-and-drawing" className="text-sm">
                          一覧＋図面
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="drawing_only" id="pdf-drawing-only" />
                        <Label htmlFor="pdf-drawing-only" className="text-sm">
                          図面のみ
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">対象情報</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-slate-500">対象業者</dt>
                      <dd className="font-medium text-slate-900">
                        {hasContractors ? pdfExportSplit.exportContractorLabel : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">対象階</dt>
                      <dd className="font-medium text-slate-900">{selectedFloorLabel || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">対象指摘件数</dt>
                      <dd className="text-lg font-bold text-slate-900">{selectedVendorStats.total}件</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <dt className="text-xs text-slate-500">未対応</dt>
                        <dd className="text-base font-bold text-red-700">{selectedVendorStats.open}件</dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <dt className="text-xs text-slate-500">完了</dt>
                        <dd className="text-base font-bold text-green-700">{selectedVendorStats.done}件</dd>
                      </div>
                    </div>
                    <div>
                      <dt className="text-slate-500">共通指摘件数</dt>
                      <dd className="font-medium text-slate-900">{commonIssues.length}件</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">表示条件</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li>・選択業者の指摘のみ表示</li>
                    <li>・共通指摘も含める</li>
                    <li>・他業者の指摘は表示しない</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </aside>

        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 md:text-lg">PDFプレビュー</h2>
              <p className="mt-1 text-sm text-slate-600">
                この内容でPDF出力されます。業者・階を変更するとプレビューが更新されます。
              </p>
            </div>

            {showLists ? (
              <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
                <div
                  className="origin-top mx-auto scale-[0.68] sm:scale-[0.75] md:scale-[0.85]"
                  style={{ width: 1122 }}
                >
                  <PdfExportIssueTable
                    title="検査指摘一覧表"
                    projectName={project.name}
                    address={project.address}
                    inspectionDate={inspectionDateLabel}
                    exportDate={exportDateLabel}
                    floorLabel={selectedFloorLabel}
                    badgeLabel={pdfExportSplit.exportContractorLabel}
                    badgeVariant="contractor"
                    issues={selectedVendorIssues}
                    emptyMessage="この業者の指摘はありません"
                  />
                </div>
              </div>
            ) : null}

            {showCommonTable ? (
              <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
                <div
                  className="origin-top mx-auto scale-[0.68] sm:scale-[0.75] md:scale-[0.85]"
                  style={{ width: 1122 }}
                >
                  <PdfExportIssueTable
                    title="共通指摘一覧表"
                    projectName={project.name}
                    address={project.address}
                    inspectionDate={inspectionDateLabel}
                    exportDate={exportDateLabel}
                    floorLabel={selectedFloorLabel}
                    badgeLabel="共通"
                    badgeVariant="common"
                    issues={commonIssues}
                  />
                </div>
              </div>
            ) : null}

            <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
              <div className="border-b border-slate-100 px-6 py-4">
                <h3 className="text-base font-semibold text-slate-900">図面プレビュー</h3>
                <p className="mt-1 text-sm text-slate-600">
                  選択業者と共通指摘のピン（{exportDrawingPageIssues.length}件）
                </p>
              </div>
              <div className="p-4 md:p-6">
                {pdfUrl ? (
                  <div className="flex justify-center overflow-auto rounded-lg bg-slate-50 p-4">
                    <div
                      className="relative bg-white shadow-sm"
                      style={{ width: stageWidth * 0.65, height: stageHeight * 0.65 }}
                    >
                      <div
                        className="relative origin-top-left"
                        style={{
                          width: stageWidth,
                          height: stageHeight,
                          transform: 'scale(0.65)',
                          transformOrigin: 'top left',
                        }}
                      >
                        <Document
                          file={pdfUrl}
                          onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
                          loading={<div className="p-4 text-sm">図面を読み込み中...</div>}
                        >
                          <Page
                            pageNumber={Math.min(drawingPageIndex + 1, pdfPageCount)}
                            width={renderWidth}
                            rotate={rotation}
                            onLoadSuccess={(page) => {
                              const viewport = page.getViewport({ scale: 1 })
                              setPageSize({ width: viewport.width, height: viewport.height })
                            }}
                          />
                        </Document>
                        <IssuePinsStage
                          pinsToRender={exportDrawingPageIssues}
                          stageWidth={stageWidth}
                          stageHeight={stageHeight}
                          mode="view"
                          selectedIssueId={null}
                          isExporting
                          pdfExportMode
                          visibleContractorIds={new Set()}
                          getIssueContractorId={() => ''}
                          onStageClick={noop}
                          onSelect={noop}
                          onEdit={noop}
                          onDeleteRequest={noop}
                          onDragPin={noop}
                          onDragCallout={noop}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 py-16 text-slate-500">
                    <FileText className="h-12 w-12" />
                    <p className="text-sm">図面を読み込めませんでした</p>
                  </div>
                )}
              </div>
            </div>

            {loadingPreviewPhotos && showLists && photoDetailIssuesForPreview.length > 0 ? (
              <p className="text-center text-sm text-slate-500">写真を読み込み中...</p>
            ) : null}

            {showPhotoDetails ? <PdfExportPhotoPreviewSection issues={previewPhotoIssues} /> : null}

            {showLists &&
            selectedVendorIssues.length === 0 &&
            commonIssues.length === 0 &&
            !loadingPreviewPhotos ? (
              <p className="text-center text-sm text-slate-500">対象の指摘はありません。</p>
            ) : null}
          </div>
        </main>
      </div>

      <div className="pointer-events-none fixed left-[-12000px] top-0 z-[-1]" aria-hidden>
        {showLists ? (
          <div ref={selectedTableExportRef}>
            <PdfExportIssueTable
              title="検査指摘一覧表"
              projectName={project.name}
              address={project.address}
              inspectionDate={inspectionDateLabel}
              exportDate={exportDateLabel}
              floorLabel={selectedFloorLabel}
              badgeLabel={pdfExportSplit.exportContractorLabel}
              badgeVariant="contractor"
              issues={selectedVendorIssues}
              emptyMessage="この業者の指摘はありません"
            />
          </div>
        ) : null}
        {showCommonTable ? (
          <div ref={commonTableExportRef}>
            <PdfExportIssueTable
              title="共通指摘一覧表"
              projectName={project.name}
              address={project.address}
              inspectionDate={inspectionDateLabel}
              exportDate={exportDateLabel}
              floorLabel={selectedFloorLabel}
              badgeLabel="共通"
              badgeVariant="common"
              issues={commonIssues}
            />
          </div>
        ) : null}
        <div
          ref={drawingExportRef}
          className="relative bg-white"
          style={{ width: stageWidth, height: stageHeight }}
        >
          {pdfUrl ? (
            <>
              <Document file={pdfUrl} loading={null}>
                <Page
                  pageNumber={Math.min(drawingPageIndex + 1, pdfPageCount)}
                  width={renderWidth}
                  rotate={rotation}
                />
              </Document>
              <IssuePinsStage
                pinsToRender={exportDrawingPageIssues}
                stageWidth={stageWidth}
                stageHeight={stageHeight}
                mode="view"
                selectedIssueId={null}
                isExporting
                pdfExportMode
                visibleContractorIds={new Set()}
                getIssueContractorId={() => ''}
                onStageClick={noop}
                onSelect={noop}
                onEdit={noop}
                onDeleteRequest={noop}
                onDragPin={noop}
                onDragCallout={noop}
              />
            </>
          ) : null}
        </div>
        {(photoDetailExportData.length > 0 ? photoDetailExportData : []).map((issue, index) => (
          <div
            key={issue.id}
            ref={(element) => {
              photoDetailExportRefs.current[index] = element
            }}
          >
            <PdfExportPhotoDetailPage issue={issue} />
          </div>
        ))}
      </div>
    </div>
  )
}
