'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Separator } from '@/components/ui/separator'
import { authedFetch } from '@/lib/authed-fetch'
import {
  sortDrawingsByFloorLabel,
  type Contractor,
  type Drawing,
  type Issue,
  type Project,
} from '@/lib/domain'
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
import { normalizeIssueStatus } from '@/lib/issue-status'
import { PdfExportIssueTable } from '@/components/pdf-export-issue-table'
import { PdfExportPhotoDetailPage, type PhotoDetailIssue } from '@/components/pdf-export-photo-detail'
import { IssuePinsStage } from '@/components/issue-pins-stage'
import { useAuthStore } from '@/lib/stores/auth-store'
import { toast } from 'sonner'

type DrawingRow = Drawing & {
  signed_url: string | null
  issue_count?: number
  file_name?: string | null
}

const UNASSIGNED_CONTRACTOR_KEY = '__none__'
const COMMON_CONTRACTOR_KEY = '__common__'

const FALLBACK_CONTRACTOR_NAMES = [
  'ウエハラ工芸',
  '新星工業',
  '幡成サッシ',
  'SHIN鉄工',
  'アルテエンジニアリング',
  '栄光プロビジョン',
  '富士機材',
  '工藤工務店',
] as const

const FALLBACK_CONTRACTORS: Contractor[] = FALLBACK_CONTRACTOR_NAMES.map((name, index) => ({
  id: `fallback-${index}`,
  tenant_id: 'fallback',
  name,
  category: '開発用',
  phone: null,
  created_at: new Date(0).toISOString(),
}))

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

export function PdfExportPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const loadingAuth = useAuthStore((s) => s.loading)

  const projectId = params.id
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

  const [exportTarget, setExportTarget] = useState<PdfExportCondition['exportTarget']>('all')
  const [exportContractorId, setExportContractorId] = useState<string>('all')
  const [selectedFloor, setSelectedFloor] = useState<string>('all')
  const [exportContent, setExportContent] = useState<'drawing_and_list' | 'drawing_only'>('drawing_and_list')
  const exportContentType: PdfExportCondition['exportContentType'] =
    exportContent === 'drawing_only' ? 'drawing_and_list' : 'drawing_and_list'

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

  useEffect(() => {
    console.log('pdf export page params:', { projectId, drawingId })
  }, [projectId, drawingId])

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
      setLoadError('案件情報を取得できませんでした')
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
        throw new Error(projectData.error ?? '案件情報を取得できませんでした')
      }
      if (!drawingListRes.ok) {
        throw new Error(drawingListData.error ?? '図面一覧の取得に失敗しました')
      }

      const resolvedContractors =
        (contractorData.contractors ?? []).length > 0
          ? (contractorData.contractors ?? [])
          : FALLBACK_CONTRACTORS

      if (!contractorRes.ok) {
        console.error('pdf export page load error:', contractorData.error ?? '業者情報を取得できませんでした')
      }

      const sortedDrawingsList = sortDrawingsByFloorLabel(drawingListData.drawings ?? [])
      if (sortedDrawingsList.length === 0) {
        throw new Error('対象図面が見つかりませんでした')
      }

      const drawingFromList =
        drawingId != null
          ? sortedDrawingsList.find((item) => item.id === drawingId) ?? null
          : null

      if (drawingId && !drawingFromList) {
        throw new Error('対象図面が見つかりませんでした')
      }

      const previewDrawingId = drawingFromList?.id ?? sortedDrawingsList[0]?.id
      if (!previewDrawingId) {
        throw new Error('対象図面が見つかりませんでした')
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

      const resolvedDrawing = await loadDrawingWithSignedUrl(
        previewDrawingId,
        drawingFromList ?? sortedDrawingsList[0] ?? null,
      )

      if (!resolvedDrawing) {
        throw new Error('対象図面が見つかりませんでした')
      }

      setProject(projectData.project)
      setDrawings(sortedDrawingsList)
      setDrawing(resolvedDrawing)
      setContractors(resolvedContractors)
      setIssues(allIssues)
      setSelectedFloor(drawingId && resolvedDrawing ? resolvedDrawing.floor_label : 'all')
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
    if (loading || !drawings.length) return

    const updatePreviewDrawing = async () => {
      const defaultDrawing =
        (drawingId ? drawings.find((item) => item.id === drawingId) : null) ?? drawings[0] ?? null

      const targetDrawing =
        selectedFloor === 'all'
          ? defaultDrawing
          : drawings.find((item) => item.floor_label === selectedFloor) ?? defaultDrawing

      if (!targetDrawing) return
      if (drawing?.id === targetDrawing.id && drawing.signed_url) return

      const resolved = await loadDrawingWithSignedUrl(targetDrawing.id, targetDrawing)
      if (resolved) {
        setDrawing(resolved)
      }
    }

    void updatePreviewDrawing()
  }, [drawing?.id, drawing?.signed_url, drawingId, drawings, loadDrawingWithSignedUrl, loading, selectedFloor])

  const sortedDrawings = useMemo(() => sortDrawingsByFloorLabel(drawings), [drawings])
  const floors = useMemo(() => sortedDrawings.map((item) => item.floor_label), [sortedDrawings])

  const exportDateLabel = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const inspectionDateLabel = useMemo(
    () => project?.inspection_date?.slice(0, 10) ?? exportDateLabel,
    [exportDateLabel, project?.inspection_date],
  )

  const exportCondition = useMemo<PdfExportCondition>(
    () => ({
      exportTarget,
      exportContractorId,
      exportContentType,
    }),
    [exportTarget, exportContractorId, exportContentType],
  )

  const numberedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
    return sorted.map((issue, index) => ({ ...issue, no: index + 1 }))
  }, [issues])

  const floorFilteredIssues = useMemo(() => {
    if (selectedFloor === 'all') return numberedIssues
    return numberedIssues.filter((issue) => issue.floor_label === selectedFloor)
  }, [numberedIssues, selectedFloor])

  const pdfExportSplit = useMemo(
    () => splitIssuesForPdfExport(floorFilteredIssues, exportCondition, contractors),
    [floorFilteredIssues, exportCondition, contractors],
  )

  const exportDrawingPageIssues = useMemo(
    () => pdfExportSplit.drawingIssues.filter((issue) => issue.page_index === drawingPageIndex),
    [pdfExportSplit.drawingIssues, drawingPageIndex],
  )

  const pinsToRender = exportDrawingPageIssues

  const exportStatusCounts = useMemo(() => {
    const targetIssues = pdfExportSplit.selectedIssues
    const pendingCount = targetIssues.filter(
      (issue) => normalizeIssueStatus(issue.status) === '未対応',
    ).length
    const completedCount = targetIssues.filter(
      (issue) => normalizeIssueStatus(issue.status) === '完了',
    ).length
    return { total: targetIssues.length, pending: pendingCount, completed: completedCount }
  }, [pdfExportSplit.selectedIssues])

  const photoDetailIssuesForPreview = useMemo(() => {
    return mergePhotoSignedUrls(
      pdfExportSplit.photoDetailIssues,
      pdfExportSplit.photoDetailIssues.map((issue) => ({
        issueId: issue.id,
        before_photo_path: issue.before_photo_path ?? null,
        after_photo_path: issue.after_photo_path ?? null,
        before_photo_url: issue.before_photo_url ?? null,
        after_photo_url: issue.after_photo_url ?? null,
        beforeError: false,
        afterError: false,
      })),
    )
  }, [pdfExportSplit.photoDetailIssues])

  const selectedTableBadgeVariant = useMemo(() => {
    if (exportTarget === 'common') return 'common' as const
    if (exportTarget === 'unassigned') return 'unassigned' as const
    if (exportTarget === 'all') return 'all' as const
    return 'contractor' as const
  }, [exportTarget])

  const contractorSelectValue = useMemo(() => {
    if (exportTarget === 'all') return 'all'
    if (exportTarget === 'unassigned') return UNASSIGNED_CONTRACTOR_KEY
    if (exportTarget === 'common') return COMMON_CONTRACTOR_KEY
    return exportContractorId
  }, [exportTarget, exportContractorId])

  useEffect(() => {
    console.log('pdf export condition:', {
      selectedContractor: contractorSelectValue,
      selectedFloor,
      exportContentType: exportContent,
    })
  }, [contractorSelectValue, selectedFloor, exportContent])

  useEffect(() => {
    console.log('pdf selected contractor:', pdfExportSplit.selectedContractor)
    console.log('pdf selected issues:', pdfExportSplit.selectedIssues)
    console.log('pdf common issues:', pdfExportSplit.commonIssues)
    console.log('pdf drawing issues:', pdfExportSplit.drawingIssues)
    console.log('pdf photo detail issues:', pdfExportSplit.photoDetailIssues)
  }, [pdfExportSplit])

  const handleContractorChange = (value: string) => {
    if (value === 'all') {
      setExportTarget('all')
      setExportContractorId('all')
      return
    }
    if (value === UNASSIGNED_CONTRACTOR_KEY) {
      setExportTarget('unassigned')
      setExportContractorId('all')
      return
    }
    if (value === COMMON_CONTRACTOR_KEY) {
      setExportTarget('common')
      setExportContractorId('all')
      return
    }
    setExportTarget('contractor')
    setExportContractorId(value)
  }

  const noop = useCallback(() => {}, [])

  const handlePdfExport = useCallback(async () => {
    try {
      setIsExporting(true)

      const {
        separateCommonPage,
        commonIssues,
        drawingIssues,
        selectedIssues,
        exportContractorLabel,
        photoDetailIssues,
      } = pdfExportSplit

      console.log('pdf export start:', {
        projectId,
        drawingId: drawing?.id ?? drawingId,
        selectedContractor: contractorSelectValue,
        selectedFloor,
        exportContentType: exportContent,
        selectedIssues,
        commonIssues,
        drawingIssues,
      })

      const targetIssues = selectedIssues
      const pendingCount = targetIssues.filter(
        (issue) => normalizeIssueStatus(issue.status) === '未対応',
      ).length
      const completedCount = targetIssues.filter(
        (issue) => normalizeIssueStatus(issue.status) === '完了',
      ).length
      console.log('pdf issue status counts:', {
        total: targetIssues.length,
        pending: pendingCount,
        completed: completedCount,
      })

      if (exportTarget === 'contractor' && exportContractorId === 'all') {
        throw new Error('出力する業者を選択してください')
      }

      const includeLists = exportContent === 'drawing_and_list'
      const includeDrawing = true
      const includePhotoDetail =
        exportContent === 'drawing_and_list' && photoDetailIssues.length > 0

      const selectedTableTarget = selectedTableExportRef.current
      if (includeLists && !selectedTableTarget) {
        throw new Error('指摘一覧表の出力対象が見つかりません')
      }

      let photoDetailIssuesWithUrls: PhotoDetailIssue[] = []
      if (includePhotoDetail && photoDetailIssues.length > 0) {
        const signedUrls = await createPhotoSignedUrlsForExport(photoDetailIssues)
        console.log('photo signed urls:', signedUrls)
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
      if (includeLists && separateCommonPage && commonIssues.length > 0) {
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
        hasCommonPage: includeLists && separateCommonPage && commonIssues.length > 0,
      })

      downloadPdfBlob(blob, filename)
      console.log('pdf export done')
      toast.success(`${exportContractorLabel}のPDFを出力しました`)
    } catch (error) {
      console.error('pdf export error:', error)
      toast.error('PDF出力に失敗しました')
    } finally {
      setPhotoDetailExportData([])
      setIsExporting(false)
    }
  }, [
    contractorSelectValue,
    drawing?.id,
    drawingId,
    exportContent,
    exportContractorId,
    exportTarget,
    pdfExportSplit,
    projectId,
    selectedFloor,
  ])

  const backHref =
    projectId && drawingId
      ? `/projects/${projectId}/drawings/${drawingId}`
      : projectId
        ? `/projects/${projectId}`
        : '/projects'

  if (!projectId) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center text-sm text-destructive">
            案件情報を取得できませんでした
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  if (loadError || !project || !drawing) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md">
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-sm text-destructive">
              {loadError ?? 'PDF出力に必要な情報が取得できません'}
            </p>
            <Button variant="outline" onClick={() => router.push(backHref)}>
              図面編集画面に戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const showLists = exportContent === 'drawing_and_list'
  const showCommonTable =
    showLists && pdfExportSplit.separateCommonPage && pdfExportSplit.commonIssues.length > 0
  const showPhotoDetail =
    showLists && pdfExportSplit.photoDetailIssues.length > 0

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-foreground">PDF出力</h1>
          <p className="text-xs text-muted-foreground">{project.name}</p>
        </div>
        <Button
          variant="outline"
          className="h-10 gap-2"
          onClick={() => toast.info('全業者一括出力は準備中です')}
        >
          <Printer className="h-4 w-4" />
          全業者一括出力
        </Button>
        <Button
          className="h-10 gap-2 bg-blue-600 hover:bg-blue-700"
          disabled={isExporting}
          onClick={() => void handlePdfExport()}
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'PDF作成中...' : 'PDF出力'}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card lg:w-80">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">出力設定</h2>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-6 p-4">
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">業者選択</Label>
                <Select value={contractorSelectValue} onValueChange={handleContractorChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="業者を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全業者</SelectItem>
                    <SelectItem value={UNASSIGNED_CONTRACTOR_KEY}>業者未定</SelectItem>
                    <SelectItem value={COMMON_CONTRACTOR_KEY}>共通</SelectItem>
                    {contractors.map((contractor) => (
                      <SelectItem key={contractor.id} value={contractor.id}>
                        {contractor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">階選択</Label>
                <Select value={selectedFloor} onValueChange={setSelectedFloor}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全階</SelectItem>
                    {floors.map((floor) => (
                      <SelectItem key={floor} value={floor}>
                        {floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex flex-col gap-3">
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

              <Separator />

              <Card className="bg-accent/50">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">対象業者</span>
                      <span className="font-medium text-foreground">
                        {pdfExportSplit.exportContractorLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">対象階</span>
                      <span className="font-medium text-foreground">
                        {selectedFloor === 'all' ? '全階' : selectedFloor}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">合計件数</span>
                      <span className="font-bold text-foreground">
                        {exportStatusCounts.total}件
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">未対応件数</span>
                      <span className="font-medium text-orange-700">
                        {exportStatusCounts.pending}件
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">完了件数</span>
                      <span className="font-medium text-green-700">
                        {exportStatusCounts.completed}件
                      </span>
                    </div>
                    {pdfExportSplit.photoDetailIssues.length > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">写真付き</span>
                        <span className="font-medium text-foreground">
                          {pdfExportSplit.photoDetailIssues.length}件
                        </span>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </aside>

        <div className="flex-1 overflow-auto bg-muted/30 p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            {showLists ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-lg">
                <div className="origin-top-left scale-[0.72] md:scale-[0.85]" style={{ width: 1122 }}>
                  <PdfExportIssueTable
                    title="検査指摘一覧表"
                    projectName={project.name}
                    address={project.address}
                    inspectionDate={inspectionDateLabel}
                    exportDate={exportDateLabel}
                    badgeLabel={pdfExportSplit.exportContractorLabel}
                    badgeVariant={selectedTableBadgeVariant}
                    issues={pdfExportSplit.selectedIssues}
                  />
                </div>
              </div>
            ) : null}

            {showCommonTable ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-lg">
                <div className="origin-top-left scale-[0.72] md:scale-[0.85]" style={{ width: 1122 }}>
                  <PdfExportIssueTable
                    title="共通指摘一覧表"
                    projectName={project.name}
                    address={project.address}
                    inspectionDate={inspectionDateLabel}
                    exportDate={exportDateLabel}
                    badgeLabel="共通"
                    badgeVariant="common"
                    issues={pdfExportSplit.commonIssues}
                  />
                </div>
              </div>
            ) : null}

            <Card className="overflow-hidden shadow-lg">
              <CardContent className="p-4">
                <p className="mb-3 text-sm font-medium text-foreground">図面プレビュー（ピン付き）</p>
                {pdfUrl ? (
                  <div className="flex justify-center overflow-auto bg-slate-100 p-2">
                    <div
                      className="relative bg-white shadow"
                      style={{ width: stageWidth * 0.55, height: stageHeight * 0.55 }}
                    >
                      <div
                        className="relative origin-top-left"
                        style={{
                          width: stageWidth,
                          height: stageHeight,
                          transform: 'scale(0.55)',
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
                          pinsToRender={pinsToRender}
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
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                    <FileText className="h-12 w-12" />
                    <p className="text-sm">図面を読み込めません</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {showPhotoDetail ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-foreground">写真付き指摘詳細プレビュー</p>
                {photoDetailIssuesForPreview.map((issue) => (
                  <div
                    key={issue.id}
                    className="overflow-hidden rounded-lg border bg-white shadow-lg"
                  >
                    <div className="origin-top-left scale-[0.55]" style={{ width: 794 }}>
                      <PdfExportPhotoDetailPage issue={issue} />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
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
              badgeLabel={pdfExportSplit.exportContractorLabel}
              badgeVariant={selectedTableBadgeVariant}
              issues={pdfExportSplit.selectedIssues}
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
              badgeLabel="共通"
              badgeVariant="common"
              issues={pdfExportSplit.commonIssues}
            />
          </div>
        ) : null}
        <div ref={drawingExportRef} className="relative bg-white" style={{ width: stageWidth, height: stageHeight }}>
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
        {(photoDetailExportData.length > 0
          ? photoDetailExportData
          : photoDetailIssuesForPreview
        ).map((issue, index) => (
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
