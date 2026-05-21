'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react'
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
  buildInspectionReportPdf,
  captureElement,
  downloadPdfBlob,
  splitIssuesForPdfExport,
  type PdfExportCondition,
} from '@/lib/pdf-export-client'
import { PdfExportIssueTable } from '@/components/pdf-export-issue-table'
import { useAuthStore } from '@/lib/stores/auth-store'
import { toast } from 'sonner'

type DrawingRow = Drawing & {
  signed_url: string | null
  issue_count?: number
  file_name?: string | null
}

const UNASSIGNED_CONTRACTOR_KEY = '__none__'

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

function resolveInitialExportTarget(contractorId: string | null): PdfExportCondition['exportTarget'] {
  if (!contractorId || contractorId === 'all') return 'all'
  if (contractorId === UNASSIGNED_CONTRACTOR_KEY) return 'unassigned'
  return 'contractor'
}

export function PdfExportPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const loadingAuth = useAuthStore((s) => s.loading)

  const projectId = params.id
  const drawingId = searchParams.get('drawingId')
  const initialContractorId = searchParams.get('contractorId')

  const [project, setProject] = useState<Project | null>(null)
  const [drawings, setDrawings] = useState<DrawingRow[]>([])
  const [drawing, setDrawing] = useState<DrawingRow | null>(null)
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const [exportTarget, setExportTarget] = useState<PdfExportCondition['exportTarget']>(
    resolveInitialExportTarget(initialContractorId),
  )
  const [exportContractorId, setExportContractorId] = useState<string>(
    initialContractorId && initialContractorId !== 'all' && initialContractorId !== UNASSIGNED_CONTRACTOR_KEY
      ? initialContractorId
      : 'all',
  )
  const [selectedFloor, setSelectedFloor] = useState<string>('all')
  const [exportContent, setExportContent] = useState<'drawing_and_list' | 'drawing_only'>('drawing_and_list')
  const exportContentType: PdfExportCondition['exportContentType'] = 'drawing_and_list'

  const selectedTableExportRef = useRef<HTMLDivElement | null>(null)
  const commonTableExportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!loadingAuth && !user) router.replace('/login')
  }, [loadingAuth, user, router])

  const loadData = useCallback(async () => {
    if (!projectId || !drawingId) {
      setLoadError('PDF出力に必要な情報が取得できません')
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)

    try {
      const [projectRes, drawingListRes, contractorRes, issueRes] = await Promise.all([
        authedFetch(`/api/projects/${projectId}`),
        authedFetch(`/api/projects/${projectId}/drawings`),
        authedFetch(`/api/projects/${projectId}/contractors`),
        authedFetch(`/api/drawings/${drawingId}/issues`),
      ])

      const projectData = (await projectRes.json()) as { project?: Project; error?: string }
      const drawingListData = (await drawingListRes.json()) as { drawings?: DrawingRow[]; error?: string }
      const contractorData = (await contractorRes.json()) as { contractors?: Contractor[]; error?: string }
      const issueData = (await issueRes.json()) as {
        drawing?: DrawingRow
        issues?: Issue[]
        error?: string
      }

      if (!projectRes.ok || !projectData.project) {
        throw new Error(projectData.error ?? '物件情報の取得に失敗しました')
      }
      if (!drawingListRes.ok) {
        throw new Error(drawingListData.error ?? '図面一覧の取得に失敗しました')
      }
      if (!contractorRes.ok) {
        throw new Error(contractorData.error ?? '業者一覧の取得に失敗しました')
      }
      if (!issueRes.ok) {
        throw new Error(issueData.error ?? '指摘一覧の取得に失敗しました')
      }

      const resolvedContractors =
        (contractorData.contractors ?? []).length > 0
          ? (contractorData.contractors ?? [])
          : FALLBACK_CONTRACTORS

      const drawingFromList =
        (drawingListData.drawings ?? []).find((item) => item.id === drawingId) ?? null
      const resolvedDrawing = issueData.drawing
        ? {
            ...drawingFromList,
            ...issueData.drawing,
            storage_path: issueData.drawing.storage_path ?? issueData.drawing.file_path ?? null,
          }
        : drawingFromList

      if (!resolvedDrawing) {
        throw new Error('対象図面が見つかりません')
      }

      setProject(projectData.project)
      setDrawings(drawingListData.drawings ?? [])
      setDrawing(resolvedDrawing)
      setContractors(resolvedContractors)
      setIssues(issueData.issues ?? [])
      setSelectedFloor(resolvedDrawing.floor_label)
    } catch (error) {
      console.error('pdf export navigation error:', error)
      setLoadError('PDF出力に必要な情報が取得できません')
    } finally {
      setLoading(false)
    }
  }, [drawingId, projectId])

  useEffect(() => {
    if (user) void loadData()
  }, [user, loadData])

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

  const selectedTableBadgeVariant = useMemo(() => {
    if (exportTarget === 'unassigned') return 'unassigned' as const
    if (exportTarget === 'all') return 'all' as const
    return 'contractor' as const
  }, [exportTarget])

  useEffect(() => {
    if (!project) return
    console.log('pdf export page project:', project)
  }, [project])

  useEffect(() => {
    if (!drawing) return
    console.log('pdf export page drawing:', drawing)
  }, [drawing])

  useEffect(() => {
    console.log('pdf export page issues:', issues)
  }, [issues])

  useEffect(() => {
    console.log('pdf export condition:', exportCondition)
  }, [exportCondition])

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
    setExportTarget('contractor')
    setExportContractorId(value)
  }

  const contractorSelectValue = useMemo(() => {
    if (exportTarget === 'all') return 'all'
    if (exportTarget === 'unassigned') return UNASSIGNED_CONTRACTOR_KEY
    return exportContractorId
  }, [exportTarget, exportContractorId])

  const handlePdfExport = useCallback(async () => {
    try {
      setIsExporting(true)

      if (exportTarget === 'contractor' && exportContractorId === 'all') {
        throw new Error('出力する業者を選択してください')
      }

      const { separateCommonPage, commonIssues, exportContractorLabel } = pdfExportSplit
      const selectedTableTarget = selectedTableExportRef.current
      if (exportContent === 'drawing_and_list' && !selectedTableTarget) {
        throw new Error('指摘一覧表の出力対象が見つかりません')
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

      const selectedTableImage =
        exportContent === 'drawing_and_list' && selectedTableTarget
          ? await captureElement(selectedTableTarget)
          : null

      let commonTableImage: string | null = null
      if (exportContent === 'drawing_and_list' && separateCommonPage && commonIssues.length > 0) {
        const commonTableTarget = commonTableExportRef.current
        if (!commonTableTarget) {
          throw new Error('共通指摘一覧表の出力対象が見つかりません')
        }
        commonTableImage = await captureElement(commonTableTarget)
      }

      const { blob, filename } = await buildInspectionReportPdf({
        selectedTableImage,
        commonTableImage,
        drawingImageData: null,
        includeDrawing: exportContent === 'drawing_and_list' || exportContent === 'drawing_only',
        hasCommonPage: exportContent === 'drawing_and_list' && separateCommonPage && commonIssues.length > 0,
      })

      downloadPdfBlob(blob, filename)
      toast.success(`${exportContractorLabel}のPDFを出力しました`)
    } catch (error) {
      console.error('pdf export error:', error)
      toast.error('PDF出力に失敗しました')
    } finally {
      setIsExporting(false)
    }
  }, [exportContent, exportContractorId, exportTarget, pdfExportSplit])

  const backHref =
    projectId && drawingId
      ? `/projects/${projectId}/drawings/${drawingId}`
      : projectId
        ? `/projects/${projectId}`
        : '/projects'

  if (!projectId || !drawingId) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center text-sm text-destructive">
            PDF出力に必要な情報が取得できません
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
                      <span className="text-muted-foreground">指摘件数</span>
                      <span className="font-bold text-foreground">
                        {pdfExportSplit.selectedIssues.length}件
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </aside>

        <div className="flex-1 overflow-auto bg-muted/30 p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            {exportContent === 'drawing_and_list' ? (
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

            {exportContent === 'drawing_and_list' &&
            pdfExportSplit.separateCommonPage &&
            pdfExportSplit.commonIssues.length > 0 ? (
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

            {exportContent === 'drawing_and_list' || exportContent === 'drawing_only' ? (
              <Card className="shadow-lg">
                <CardContent className="flex flex-col items-center justify-center gap-3 p-16 text-muted-foreground">
                  {drawing.signed_url ? (
                    <iframe
                      src={drawing.signed_url}
                      title="図面プレビュー"
                      className="h-[480px] w-full rounded border bg-white"
                    />
                  ) : (
                    <>
                      <FileText className="h-12 w-12" />
                      <p className="text-sm font-medium">図面プレビュー</p>
                      <p className="text-xs">指摘ピン付き図面がここに表示されます</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed left-[-12000px] top-0 z-[-1]" aria-hidden>
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
        {pdfExportSplit.separateCommonPage && pdfExportSplit.commonIssues.length > 0 ? (
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
      </div>
    </div>
  )
}
