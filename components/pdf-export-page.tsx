'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, Printer } from 'lucide-react'
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
  getFilteredIssues,
  getIssuesByDrawingId,
  getPdfExportSplit,
  getTargetDrawings,
} from '@/lib/pdf-export-filters'
import {
  buildInspectionReportPdf,
  captureElement,
  downloadPdfBlob,
  includesDrawingPages,
  includesListPages,
  normalizeExportContentType,
  waitForElementImages,
  waitForExportReady,
  type PdfExportCondition,
  type PdfExportContentType,
} from '@/lib/pdf-export-client'
import { InspectionListPreview } from '@/components/inspection-list-preview'
import { PdfExportPhotoDetailPage, type PhotoDetailIssue } from '@/components/pdf-export-photo-detail'
import { PdfExportPhotoPreviewSection } from '@/components/pdf-export-photo-preview'
import { DrawingExportCapture, PdfExportPreview } from '@/components/pdf-export-preview'
import { useAuthStore } from '@/lib/stores/auth-store'
import { toast } from 'sonner'

type DrawingRow = Drawing & {
  signed_url: string | null
  pdf_signed_url?: string | null
  image_signed_url?: string | null
  issue_count?: number
  file_name?: string | null
}

type ExportTargetMode = 'all' | 'unassigned' | 'contractor'
type ExportContentMode = PdfExportContentType

const ALL_FLOORS_VALUE = '__all__'

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

function parseExportTargetParam(value: string | null): ExportTargetMode {
  if (value === 'unassigned' || value === 'contractor' || value === 'all') return value
  return 'all'
}

function parseExportContentParam(value: string | null): ExportContentMode {
  return normalizeExportContentType(value)
}

function resolveInitialContractorId(
  target: ExportTargetMode,
  urlContractorId: string | null,
  resolvedContractors: Contractor[],
): string {
  if (target === 'contractor' && urlContractorId && urlContractorId !== 'all') {
    const matched = resolvedContractors.find((contractor) => contractor.id === urlContractorId)
    if (matched) return matched.id
  }
  return resolvedContractors[0]?.id ?? ''
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
  const urlDrawingId = searchParams.get('drawingId')
  const urlExportTarget = searchParams.get('target')
  const urlExportContractorId = searchParams.get('contractorId')
  const urlExportContentType = searchParams.get('contentType')

  const [project, setProject] = useState<Project | null>(null)
  const [drawings, setDrawings] = useState<DrawingRow[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [photoDetailExportData, setPhotoDetailExportData] = useState<PhotoDetailIssue[]>([])
  const [previewPhotoIssues, setPreviewPhotoIssues] = useState<PhotoDetailIssue[]>([])
  const [loadingPreviewPhotos, setLoadingPreviewPhotos] = useState(false)

  const [selectedExportTarget, setSelectedExportTarget] = useState<ExportTargetMode>('all')
  const [selectedContractorId, setSelectedContractorId] = useState<string>('')
  const [selectedFloor, setSelectedFloor] = useState<'all' | string>('all')
  const [exportContent, setExportContent] = useState<ExportContentMode>('list_and_drawing')

  const selectedTableExportRef = useRef<HTMLDivElement | null>(null)
  const commonTableExportRef = useRef<HTMLDivElement | null>(null)
  const drawingExportRefs = useRef<(HTMLDivElement | null)[]>([])
  const photoDetailExportRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (!loadingAuth && !user) router.replace('/login')
  }, [loadingAuth, user, router])

  const loadDrawingPdfUrl = useCallback(async (targetDrawingId: string): Promise<string | null> => {
    const issueRes = await authedFetch(`/api/drawings/${targetDrawingId}/issues`)
    const issueData = (await issueRes.json()) as {
      drawing?: DrawingRow
      error?: string
    }
    if (!issueRes.ok) {
      console.error('drawing pdf url load error:', issueData.error ?? targetDrawingId)
      return null
    }
    return issueData.drawing?.signed_url ?? null
  }, [])

  const loadData = useCallback(async () => {
    if (!projectId) {
      setLoadError('案件IDが取得できません。')
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

      const resolvedContractors =
        (contractorData.contractors ?? []).length > 0
          ? (contractorData.contractors ?? [])
          : FALLBACK_CONTRACTORS
      const initialExportTarget = parseExportTargetParam(urlExportTarget)
      const initialExportContent = parseExportContentParam(urlExportContentType)
      const initialContractorId = resolveInitialContractorId(
        initialExportTarget,
        urlExportContractorId,
        resolvedContractors,
      )
      const sortedDrawingsList = sortDrawingsByFloorLabel(drawingListData.drawings ?? []).map((drawing) => ({
        ...drawing,
        image_signed_url: drawing.signed_url ?? null,
      }))

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

      const pdfUrlEntries = await Promise.all(
        sortedDrawingsList.map(async (drawing) => {
          const pdfSignedUrl = await loadDrawingPdfUrl(drawing.id)
          return [drawing.id, pdfSignedUrl] as const
        }),
      )
      const drawingsWithUrls = sortedDrawingsList.map((drawing) => ({
        ...drawing,
        pdf_signed_url: pdfUrlEntries.find(([id]) => id === drawing.id)?.[1] ?? null,
      }))

      const initialFloor =
        urlDrawingId != null
          ? (drawingsWithUrls.find((drawing) => drawing.id === urlDrawingId)?.floor_label ?? 'all')
          : 'all'

      console.log('contractors:', resolvedContractors)
      console.log('issues:', allIssues)
      console.log('project drawings:', drawingsWithUrls)
      console.log('sorted drawings:', sortDrawingsByFloorLabel(drawingsWithUrls))
      if (urlDrawingId) {
        const currentDrawingIndex = drawingsWithUrls.findIndex((drawing) => drawing.id === urlDrawingId)
        console.log('current drawing index:', currentDrawingIndex)
        console.log('current drawing id:', urlDrawingId)
        console.log(
          'next drawing:',
          currentDrawingIndex >= 0 && currentDrawingIndex < drawingsWithUrls.length - 1
            ? drawingsWithUrls[currentDrawingIndex + 1]
            : null,
        )
        console.log(
          'prev drawing:',
          currentDrawingIndex > 0 ? drawingsWithUrls[currentDrawingIndex - 1] : null,
        )
      }

      setProject(projectData.project)
      setDrawings(drawingsWithUrls)
      setContractors(resolvedContractors)
      setIssues(allIssues)
      setSelectedExportTarget(initialExportTarget)
      setExportContent(initialExportContent)
      setSelectedContractorId(initialContractorId)
      setSelectedFloor(initialFloor === 'all' ? 'all' : initialFloor)
    } catch (error) {
      console.error('pdf export page load error:', error)
      const message = error instanceof Error ? error.message : 'PDF出力に必要な情報が取得できません'
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }, [loadDrawingPdfUrl, projectId, urlDrawingId, urlExportContentType, urlExportContractorId, urlExportTarget])

  useEffect(() => {
    if (user) void loadData()
  }, [user, loadData])

  const sortedDrawings = useMemo(() => sortDrawingsByFloorLabel(drawings), [drawings])

  const exportDateLabel = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const inspectionDateLabel = useMemo(
    () => project?.inspection_date?.slice(0, 10) ?? exportDateLabel,
    [exportDateLabel, project?.inspection_date],
  )

  const exportCondition = useMemo<PdfExportCondition>(
    () => ({
      exportTarget: selectedExportTarget,
      exportContractorId:
        selectedExportTarget === 'contractor' ? selectedContractorId || 'all' : 'all',
      exportContentType: exportContent,
    }),
    [exportContent, selectedContractorId, selectedExportTarget],
  )

  const numberedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
    return sorted.map((issue, index) => ({ ...issue, no: index + 1 }))
  }, [issues])

  const pdfExportSplit = useMemo(
    () => getPdfExportSplit(numberedIssues, exportCondition, contractors, selectedFloor, sortedDrawings),
    [numberedIssues, exportCondition, contractors, selectedFloor, sortedDrawings],
  )

  const filteredIssues = useMemo(
    () => getFilteredIssues(numberedIssues, exportCondition, contractors, selectedFloor, sortedDrawings),
    [numberedIssues, exportCondition, contractors, selectedFloor, sortedDrawings],
  )

  const targetDrawings = useMemo(
    () => getTargetDrawings(sortedDrawings, filteredIssues, selectedFloor),
    [sortedDrawings, filteredIssues, selectedFloor],
  )

  const getDrawingIssues = useCallback(
    (drawingId: string) => getIssuesByDrawingId(filteredIssues, drawingId),
    [filteredIssues],
  )

  const selectedFloorLabel =
    selectedFloor === 'all' ? '全階' : sortedDrawings.find((d) => d.floor_label === selectedFloor)?.floor_label ?? selectedFloor

  const selectedTableBadgeVariant = useMemo(() => {
    if (selectedExportTarget === 'unassigned') return 'unassigned' as const
    if (selectedExportTarget === 'all') return 'all' as const
    return 'contractor' as const
  }, [selectedExportTarget])

  const canExport = useMemo(() => {
    if (selectedExportTarget === 'contractor') {
      return Boolean(selectedContractorId) && selectedContractorId !== 'all'
    }
    return true
  }, [selectedContractorId, selectedExportTarget])

  const selectedVendorStats = useMemo(
    () => countStatusStats(pdfExportSplit.selectedIssues),
    [pdfExportSplit.selectedIssues],
  )

  const photoDetailIssuesForPreview = useMemo(() => {
    if (!includesListPages(exportContent)) return []
    return filteredIssues.filter((issue) => issue.before_photo_path || issue.after_photo_path)
  }, [exportContent, filteredIssues])

  useEffect(() => {
    console.log('pdf export condition:', {
      exportContentType: exportContent,
      exportContractorId: selectedExportTarget === 'contractor' ? selectedContractorId : 'all',
      exportTarget: selectedExportTarget,
    })
  }, [exportContent, selectedContractorId, selectedExportTarget])

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

  const handleFloorChange = (value: string) => {
    setSelectedFloor(value === ALL_FLOORS_VALUE ? 'all' : value)
  }

  const handleBulkExport = useCallback(() => {
    toast.info('全業者一括出力は次の工程で実装します')
  }, [])

  const handleExportPdf = useCallback(async () => {
    console.log('PDF export clicked')

    if (selectedExportTarget === 'contractor' && !selectedContractorId) {
      toast.error('出力する業者を選択してください')
      return
    }

    try {
      setIsExporting(true)
      setExportError(null)

      console.log('PDF export conditions', {
        exportContentType: exportContent,
        exportContractorId: selectedExportTarget === 'contractor' ? selectedContractorId : 'all',
        exportTarget: selectedExportTarget,
        selectedFloor,
      })
      console.log('PDF export filtered issues', filteredIssues)
      console.log('PDF export target drawings', targetDrawings)

      const { commonIssues: commonForExport, photoDetailIssues } = pdfExportSplit
      const includeLists = includesListPages(exportContent)
      const includeDrawing = includesDrawingPages(exportContent)
      const includePhotoDetail = includeLists && photoDetailIssues.length > 0

      if (includeLists && pdfExportSplit.selectedIssues.length === 0 && commonForExport.length === 0) {
        throw new Error('出力対象の指摘がありません')
      }
      if (includeDrawing && targetDrawings.length === 0) {
        throw new Error('出力対象の図面がありません')
      }

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

      const drawingImageDataList: string[] = []
      if (includeDrawing) {
        for (let index = 0; index < targetDrawings.length; index += 1) {
          const drawing = targetDrawings[index]
          const drawingIssues = getDrawingIssues(drawing.id)
          console.log('PDF export drawing issues', drawing.id, drawingIssues)

          const drawingTarget = drawingExportRefs.current[index]
          if (!drawingTarget) {
            throw new Error(`図面の出力対象が見つかりません（${drawing.floor_label}）`)
          }
          await waitForExportReady(drawingTarget)
          await waitForElementImages(drawingTarget)
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          })
          drawingImageDataList.push(await captureElement(drawingTarget))
        }
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
        drawingImageDataList,
        photoDetailImages,
        includeLists,
        includeDrawing,
        includePhotoDetail,
        hasCommonPage: includeLists && commonForExport.length > 0,
      })

      downloadPdfBlob(blob, filename)
      console.log('PDF export completed')
      toast.success(`${pdfExportSplit.exportContractorLabel}のPDFを出力しました`)
    } catch (error) {
      console.error('PDF export failed', error)
      setExportError('PDF出力に失敗しました。図面データまたは指摘データを確認してください。')
      toast.error('PDF出力に失敗しました')
    } finally {
      setPhotoDetailExportData([])
      setIsExporting(false)
    }
  }, [
    exportContent,
    filteredIssues,
    getDrawingIssues,
    pdfExportSplit,
    selectedContractorId,
    selectedExportTarget,
    selectedFloor,
    targetDrawings,
  ])

  const backHref = projectId
    ? urlDrawingId
      ? `/projects/${projectId}/drawings/${urlDrawingId}`
      : `/projects/${projectId}`
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-muted-foreground">読み込み中です...</p>
      </div>
    )
  }

  if (loadError || !project) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 p-6">
        <Card className="max-w-md shadow-sm">
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-sm text-destructive">
              {loadError ?? 'PDF出力に必要な情報が取得できません'}
            </p>
            <Button variant="outline" onClick={() => router.push(backHref)}>
              戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const showLists = includesListPages(exportContent)
  const showDrawingPreview = includesDrawingPages(exportContent)
  const showCommonTable = showLists && pdfExportSplit.commonIssues.length > 0
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
                戻る
              </Button>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 md:text-xl">検査表PDF出力</h1>
              <p className="mt-1 text-sm text-slate-600">
                {project.name}
                <span className="mx-2 text-slate-300">|</span>
                検査日：{inspectionDateLabel}
                <span className="mx-2 text-slate-300">|</span>
                対象階：{selectedFloorLabel}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {exportError ? <p className="text-sm text-red-600">{exportError}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
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
                disabled={isExporting || !canExport}
                onClick={() => void handleExportPdf()}
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'PDF生成中...' : 'PDF出力'}
              </Button>
            </div>
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
                    <Label className="text-sm font-medium">出力対象</Label>
                    <RadioGroup
                      value={selectedExportTarget}
                      onValueChange={(value) => setSelectedExportTarget(value as ExportTargetMode)}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="all" id="pdf-export-target-all" />
                        <Label htmlFor="pdf-export-target-all" className="text-sm">
                          全業者
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="contractor" id="pdf-export-target-contractor" />
                        <Label htmlFor="pdf-export-target-contractor" className="text-sm">
                          特定業者
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="unassigned" id="pdf-export-target-unassigned" />
                        <Label htmlFor="pdf-export-target-unassigned" className="text-sm">
                          業者未定
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">業者選択</Label>
                    {selectedExportTarget === 'contractor' ? (
                      hasContractors ? (
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
                      )
                    ) : (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        {selectedExportTarget === 'all' ? '全業者の指摘を出力します' : '業者未定の指摘を出力します'}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">階選択</Label>
                    <Select
                      value={selectedFloor === 'all' ? ALL_FLOORS_VALUE : selectedFloor}
                      onValueChange={handleFloorChange}
                      disabled={sortedDrawings.length === 0}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="階を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FLOORS_VALUE}>全部</SelectItem>
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
                      onValueChange={(value) => setExportContent(value as ExportContentMode)}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="list_and_drawing" id="pdf-list-and-drawing" />
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

                  {exportError ? <p className="text-sm text-red-600">{exportError}</p> : null}

                  <Button
                    type="button"
                    className="h-11 w-full bg-blue-600 hover:bg-blue-700"
                    disabled={isExporting || !canExport}
                    onClick={() => void handleExportPdf()}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {isExporting ? 'PDF生成中...' : 'PDF出力'}
                  </Button>
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
                      <dd className="font-medium text-slate-900">{selectedFloorLabel}</dd>
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
                      <dt className="text-slate-500">対象図面数</dt>
                      <dd className="font-medium text-slate-900">{targetDrawings.length}枚</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">共通指摘件数</dt>
                      <dd className="font-medium text-slate-900">{pdfExportSplit.commonIssues.length}件</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </aside>

        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 md:text-lg">PDFプレビュー</h2>
              <p className="mt-1 text-sm text-slate-600">
                この内容でPDF出力されます。業者・階を変更するとプレビューが更新されます。
              </p>
            </div>

            <PdfExportPreview
              project={project}
              inspectionDateLabel={inspectionDateLabel}
              exportDateLabel={exportDateLabel}
              floorLabel={selectedFloorLabel}
              showLists={showLists}
              showDrawingPreview={showDrawingPreview}
              showCommonTable={showCommonTable}
              pdfExportSplit={pdfExportSplit}
              selectedTableBadgeVariant={selectedTableBadgeVariant}
              targetDrawings={targetDrawings}
              filteredIssues={filteredIssues}
              getDrawingIssues={getDrawingIssues}
              contractors={contractors}
            />

            {loadingPreviewPhotos && showLists && photoDetailIssuesForPreview.length > 0 ? (
              <p className="text-center text-sm text-slate-500">写真を読み込み中...</p>
            ) : null}

            {showPhotoDetails ? <PdfExportPhotoPreviewSection issues={previewPhotoIssues} /> : null}

            {showLists &&
            pdfExportSplit.selectedIssues.length === 0 &&
            pdfExportSplit.commonIssues.length === 0 &&
            !loadingPreviewPhotos ? (
              <p className="text-center text-sm text-slate-500">対象の指摘はありません。</p>
            ) : null}
          </div>
        </main>
      </div>

      <div
        className="pointer-events-none fixed left-[-12000px] top-0 z-[-1] overflow-visible"
        aria-hidden
      >
        {showLists ? (
          <div ref={selectedTableExportRef}>
            <InspectionListPreview
              title="検査指摘一覧表"
              projectName={project.name}
              address={project.address}
              inspectionDate={inspectionDateLabel}
              exportDate={exportDateLabel}
              floorLabel={selectedFloorLabel}
              badgeLabel={pdfExportSplit.exportContractorLabel}
              badgeVariant={selectedTableBadgeVariant}
              issues={pdfExportSplit.selectedIssues}
              emptyMessage="この条件の指摘はありません"
            />
          </div>
        ) : null}
        {showCommonTable ? (
          <div ref={commonTableExportRef}>
            <InspectionListPreview
              title="共通指摘一覧表"
              projectName={project.name}
              address={project.address}
              inspectionDate={inspectionDateLabel}
              exportDate={exportDateLabel}
              floorLabel={selectedFloorLabel}
              badgeLabel="共通"
              badgeVariant="common"
              issues={pdfExportSplit.commonIssues}
            />
          </div>
        ) : null}
        {showDrawingPreview
          ? targetDrawings.map((drawing, index) => (
              <DrawingExportCapture
                key={drawing.id}
                exportRef={(element) => {
                  drawingExportRefs.current[index] = element
                }}
                drawing={drawing}
                issues={getDrawingIssues(drawing.id)}
                contractors={contractors}
              />
            ))
          : null}
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
