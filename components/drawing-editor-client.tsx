'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Download, Filter, MapPin, Trash2 } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Layer, Stage } from 'react-konva'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { authedFetch } from '@/lib/authed-fetch'
import { useEditorStore } from '@/lib/stores/editor-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import { ISSUE_TYPES, type Contractor, type Drawing, type Issue } from '@/lib/domain'
import { toast } from 'sonner'
import { DrawingToolbar } from '@/components/drawing-toolbar'
import { IssueListPanel } from '@/components/issue-list-panel'
import { ContractorFilter } from '@/components/contractor-filter'
import { IssuePin } from '@/components/issue-pin'
import { IssueModal } from '@/components/issue-modal'

type DrawingRow = Drawing & {
  signed_url: string | null
  issue_count: number
  file_name: string
  signed_page_urls?: Array<string | null>
}

type IssueFormValues = {
  floor_label: string
  issue_type: string
  issue_text: string
  contractor_id: string
  status: string
}

type IssueResponse = {
  drawing?: DrawingRow
  issues?: Issue[]
  issue?: Issue
  error?: string
  missing?: string[]
}

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

const UNASSIGNED_CONTRACTOR_KEY = '__none__'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export default function DrawingEditorClient() {
  const params = useParams<{ id: string; drawingId: string }>()
  const projectId = params.id
  const drawingId = params.drawingId
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const loadingAuth = useAuthStore((s) => s.loading)

  const mode = useEditorStore((s) => s.mode)
  const zoom = useEditorStore((s) => s.zoom)
  const issues = useEditorStore((s) => s.issues)
  const setIssues = useEditorStore((s) => s.setIssues)
  const setMode = useEditorStore((s) => s.setMode)
  const setZoom = useEditorStore((s) => s.setZoom)
  const setPan = useEditorStore((s) => s.setPan)

  const [drawings, setDrawings] = useState<DrawingRow[]>([])
  const [currentDrawing, setCurrentDrawing] = useState<DrawingRow | null>(null)
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [imageError, setImageError] = useState<string | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [fitScale, setFitScale] = useState(1)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [addingPin, setAddingPin] = useState<{ x: number; y: number } | null>(null)
  const [issueModalOpen, setIssueModalOpen] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'issues' | 'contractors'>('issues')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [visibleContractorIds, setVisibleContractorIds] = useState<Set<string>>(
    new Set([UNASSIGNED_CONTRACTOR_KEY]),
  )
  const [listFilters, setListFilters] = useState({
    searchText: '',
    contractorId: 'all',
    issueType: 'all',
    floorLabel: 'all',
  })

  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!loadingAuth && !user) router.replace('/login')
  }, [loadingAuth, user, router])

  const refetchIssues = async () => {
    const issueRes = await authedFetch(`/api/drawings/${drawingId}/issues`)
    const issueData = (await issueRes.json()) as IssueResponse
    if (!issueRes.ok) {
      console.error('create issue error:', issueData.error ?? '指摘再取得失敗')
      return false
    }
    setIssues(issueData.issues ?? [])
    return true
  }

  const loadData = async () => {
    try {
      const [drawingListRes, contractorRes, issueRes] = await Promise.all([
        authedFetch(`/api/projects/${projectId}/drawings`),
        authedFetch(`/api/projects/${projectId}/contractors`),
        authedFetch(`/api/drawings/${drawingId}/issues`),
      ])

      const drawingListData = (await drawingListRes.json()) as { drawings?: DrawingRow[]; error?: string }
      const contractorData = (await contractorRes.json()) as { contractors?: Contractor[]; error?: string }
      const issueData = (await issueRes.json()) as { drawing?: DrawingRow; issues?: Issue[]; error?: string }

      if (!drawingListRes.ok) return toast.error(drawingListData.error ?? '図面取得失敗')
      if (!contractorRes.ok) return toast.error(contractorData.error ?? '業者取得失敗')
      if (!issueRes.ok) return toast.error(issueData.error ?? '指摘取得失敗')

      const resolvedContractors = (contractorData.contractors ?? []).length > 0
        ? (contractorData.contractors ?? [])
        : FALLBACK_CONTRACTORS
      console.log('contractors:', resolvedContractors)

      setDrawings(drawingListData.drawings ?? [])
      const drawingFromList = (drawingListData.drawings ?? []).find((item) => item.id === drawingId) ?? null
      const drawing = issueData.drawing
        ? {
            ...drawingFromList,
            ...issueData.drawing,
            storage_path: issueData.drawing.storage_path ?? issueData.drawing.file_path ?? null,
          }
        : drawingFromList
      setCurrentDrawing(drawing)
      setContractors(resolvedContractors)
      setVisibleContractorIds(
        new Set([UNASSIGNED_CONTRACTOR_KEY, ...resolvedContractors.map((contractor) => contractor.id)]),
      )
      setIssues(issueData.issues ?? [])
      setPageIndex(0)
      if (drawing) {
        setListFilters((prev) => ({ ...prev, floorLabel: 'all' }))
      }
    } catch (error) {
      console.error('contractors load error:', error)
      toast.error('業者取得失敗')
    }
  }

  useEffect(() => {
    if (user) void loadData()
  }, [user, drawingId, projectId])

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setRotation(0)
  }, [drawingId, setZoom, setPan])

  useEffect(() => {
    if (!currentDrawing) return
    const totalPages = Math.max(pdfPageCount, currentDrawing.page_count ?? 0, 1)
    if (pageIndex < totalPages) return
    setPageIndex(Math.max(totalPages - 1, 0))
  }, [currentDrawing, pageIndex, pdfPageCount])

  useEffect(() => {
    console.log("rotation:", rotation)
  }, [rotation])

  const numberedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
    return sorted.map((issue, index) => ({ ...issue, no: index + 1 }))
  }, [issues])

  const pageIssues = useMemo(() => {
    const key = listFilters.searchText.trim().toLowerCase()
    return numberedIssues.filter((issue) => {
      if (issue.page_index !== pageIndex) return false
      if (!visibleContractorIds.has(issue.contractor_id ?? UNASSIGNED_CONTRACTOR_KEY)) return false
      if (listFilters.contractorId !== 'all') {
        if (listFilters.contractorId === UNASSIGNED_CONTRACTOR_KEY && issue.contractor_id !== null) return false
        if (listFilters.contractorId !== UNASSIGNED_CONTRACTOR_KEY && issue.contractor_id !== listFilters.contractorId) return false
      }
      if (listFilters.issueType !== 'all' && issue.issue_type !== listFilters.issueType) return false
      if (listFilters.floorLabel !== 'all' && issue.floor_label !== listFilters.floorLabel) return false
      if (!key) return true
      const contractorName = issue.contractor?.name ?? ''
      return `${issue.issue_text}${issue.issue_type}${contractorName}${issue.floor_label}`.toLowerCase().includes(key)
    })
  }, [listFilters, numberedIssues, pageIndex, visibleContractorIds])

  const floors = useMemo(() => {
    const set = new Set(drawings.map((drawing) => drawing.floor_label))
    return Array.from(set)
  }, [drawings])

  const getIssueContractorId = useCallback((issue: Issue) => issue.contractor_id ?? UNASSIGNED_CONTRACTOR_KEY, [])
  const isFallbackContractor = useCallback((contractorId: string) => contractorId.startsWith('fallback-'), [])

  const createIssue = useCallback(
    async (values: IssueFormValues, continueMode: boolean) => {
      if (!addingPin || !currentDrawing) return
      try {
        const payload = {
          tenant_id: user?.id ?? null,
          project_id: projectId,
          drawing_id: drawingId,
          page_index: pageIndex ?? 0,
          floor_label: values.floor_label || currentDrawing.floor_label,
          issue_type: values.issue_type,
          issue_text: values.issue_text.trim(),
          contractor_id:
            values.contractor_id && !isFallbackContractor(values.contractor_id)
              ? values.contractor_id
              : null,
          pin_x: addingPin.x,
          pin_y: addingPin.y,
          callout_x: addingPin.x + 0.05,
          callout_y: addingPin.y - 0.05,
          status: values.status || 'open',
        }
        console.log('issue payload FULL:', JSON.stringify(payload, null, 2))

        const response = await authedFetch(`/api/drawings/${drawingId}/issues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = (await response.json()) as IssueResponse
        if (!response.ok || !data.issue) {
          const errorMessage = Array.isArray(data.missing) && data.missing.length > 0
            ? `${data.error ?? '保存失敗'}: ${data.missing.join(', ')}`
            : data.error ?? '保存失敗'
          console.error('create issue error:', data)
          toast.error(errorMessage)
          return
        }
        await refetchIssues()
        setSelectedIssueId(data.issue.id)
        setAddingPin(null)
        setIssueModalOpen(false)
        toast.success('指摘を保存しました')
        if (continueMode) {
          setMode('add')
        }
      } catch (error) {
        console.error('create issue error:', error)
        toast.error('保存失敗')
      }
    },
    [addingPin, currentDrawing, drawingId, isFallbackContractor, pageIndex, projectId, refetchIssues, setMode, user?.id],
  )

  const updateIssue = useCallback(
    async (targetIssue: Issue, values: IssueFormValues) => {
      try {
        const payload = {
          floor_label: values.floor_label || currentDrawing?.floor_label,
          issue_type: values.issue_type,
          issue_text: values.issue_text.trim(),
          contractor_id:
            values.contractor_id && !isFallbackContractor(values.contractor_id)
              ? values.contractor_id
              : null,
          status: values.status || 'open',
        }
        console.log('issue payload FULL:', JSON.stringify(payload, null, 2))
        const response = await authedFetch(`/api/issues/${targetIssue.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = (await response.json()) as { issue?: Issue; error?: string; missing?: string[] }
        if (!response.ok || !data.issue) {
          console.error('create issue error:', data.error ?? data)
          toast.error(data.error ?? '更新に失敗しました')
          return
        }
        await refetchIssues()
        setSelectedIssueId(targetIssue.id)
        setEditingIssue(null)
        setIssueModalOpen(false)
        toast.success('指摘を更新しました')
      } catch (error) {
        console.error('create issue error:', error)
        toast.error('更新に失敗しました')
      }
    },
    [currentDrawing?.floor_label, isFallbackContractor, refetchIssues],
  )

  const deleteIssue = async () => {
    if (!selectedIssueId) return
    try {
      const response = await authedFetch(`/api/issues/${selectedIssueId}`, { method: 'DELETE' })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        console.error('create issue error:', data.error ?? data)
        toast.error(data.error ?? '削除失敗')
        return
      }
      await refetchIssues()
      setSelectedIssueId(null)
      toast.success('指摘を削除しました')
    } catch (error) {
      console.error('create issue error:', error)
      toast.error('削除失敗')
    } finally {
      setDeleteConfirmOpen(false)
    }
  }

  const jumpToIssue = (issue: Issue) => {
    setSelectedIssueId(issue.id)
    console.log('issue selected:', issue.id)
  }

  const startEditIssue = (issue: Issue) => {
    setEditingIssue(issue)
    setIssueModalOpen(true)
  }

  const updateCalloutPosition = useCallback(
    async (issueId: string, calloutX: number, calloutY: number) => {
      const response = await authedFetch(`/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callout_x: calloutX, callout_y: calloutY }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        console.error('create issue error:', data.error ?? data)
        return
      }
      await refetchIssues()
    },
    [refetchIssues],
  )

  const pdfUrl = currentDrawing?.signed_url ?? null
  const totalPages = Math.max(pdfPageCount, currentDrawing?.page_count ?? 0, 1)
  const renderWidth = 1100
  const pageAspect = pageSize ? pageSize.height / pageSize.width : 1.4142
  const basePageWidth = renderWidth
  const basePageHeight = renderWidth * pageAspect
  const isQuarterTurn = rotation % 180 !== 0
  const stageWidth = isQuarterTurn ? basePageHeight : basePageWidth
  const stageHeight = isQuarterTurn ? basePageWidth : basePageHeight
  const effectiveScale = zoom * fitScale

  const recalculateFitScale = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const availableWidth = Math.max(rect.width - 48, 1)
    const availableHeight = Math.max(rect.height - 48, 1)
    const nextFitScale = Math.min(availableWidth / stageWidth, availableHeight / stageHeight)
    if (Number.isFinite(nextFitScale) && nextFitScale > 0) {
      setFitScale(nextFitScale)
    }
  }, [stageHeight, stageWidth])

  useEffect(() => {
    recalculateFitScale()
    const onWindowResize = () => recalculateFitScale()
    window.addEventListener('resize', onWindowResize)
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', onWindowResize)
      }
    }

    const observer = new ResizeObserver(() => recalculateFitScale())
    observer.observe(container)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onWindowResize)
    }
  }, [recalculateFitScale])

  const handleStageClick = useCallback((event: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null } }) => {
    if (mode !== 'add') return
    const stage = event.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    const xRatio = pointer.x / stageWidth
    const yRatio = pointer.y / stageHeight
    if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) return
    setAddingPin({ x: xRatio, y: yRatio })
    setEditingIssue(null)
    setIssueModalOpen(true)
  }, [mode, stageHeight, stageWidth])

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      <DrawingToolbar
        drawings={drawings}
        currentDrawingId={currentDrawing?.id ?? ''}
        mode={mode}
        zoom={zoom}
        pageIndex={pageIndex}
        totalPages={totalPages}
        rotation={rotation}
        onBack={() => router.push(`/projects/${projectId}`)}
        onChangeDrawing={(value) => router.push(`/projects/${projectId}/drawings/${value}`)}
        onChangeMode={setMode}
        onZoomIn={() => setZoom(Math.min(2.5, zoom + 0.1))}
        onZoomOut={() => setZoom(Math.max(0.5, zoom - 0.1))}
        onPrevPage={() => setPageIndex((value) => Math.max(value - 1, 0))}
        onNextPage={() => setPageIndex((value) => Math.min(value + 1, totalPages - 1))}
        onRotate={() => setRotation((prev) => (prev + 90) % 360)}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen ? (
          <aside className="w-80 border-r bg-white">
            <Tabs
              value={sidebarTab}
              onValueChange={(value) => setSidebarTab(value as 'issues' | 'contractors')}
              className="flex h-full flex-col"
            >
              <TabsList className="mx-3 mt-3 grid h-10 grid-cols-2">
                <TabsTrigger value="issues">指摘一覧</TabsTrigger>
                <TabsTrigger value="contractors">業者表示</TabsTrigger>
              </TabsList>
              <TabsContent value="issues" className="mt-3 min-h-0 flex-1">
                <IssueListPanel
                  issues={pageIssues}
                  contractors={contractors}
                  floors={floors}
                  selectedIssueId={selectedIssueId}
                  filters={listFilters}
                  onFilterChange={(next) => setListFilters((prev) => ({ ...prev, ...next }))}
                  onSelectIssue={jumpToIssue}
                  onEditIssue={startEditIssue}
                />
              </TabsContent>
              <TabsContent value="contractors" className="mt-3 min-h-0 flex-1">
                <ContractorFilter
                  contractors={contractors}
                  visibleContractorIds={visibleContractorIds}
                  onToggle={(contractorId) => {
                    setVisibleContractorIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(contractorId)) {
                        next.delete(contractorId)
                      } else {
                        next.add(contractorId)
                      }
                      return next
                    })
                  }}
                  onShowAll={() =>
                    setVisibleContractorIds(
                      new Set([UNASSIGNED_CONTRACTOR_KEY, ...contractors.map((contractor) => contractor.id)]),
                    )
                  }
                  onShowOnly={(contractorId) => setVisibleContractorIds(new Set([contractorId]))}
                />
              </TabsContent>
            </Tabs>
          </aside>
        ) : null}

        <section className="relative flex-1 overflow-hidden" ref={containerRef}>
          <div className="absolute inset-0 overflow-auto bg-slate-200 p-4">
            {imageError ? (
              <div className="flex h-full items-center justify-center p-6">
                <Card className="max-w-md">
                  <CardHeader>
                    <CardTitle>PDF表示エラー</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{imageError}</CardContent>
                </Card>
              </div>
            ) : !pdfUrl ? (
              <div className="flex h-full items-center justify-center p-6">
                <Card className="max-w-md">
                  <CardHeader>
                    <CardTitle>PDF表示エラー</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    signed URLの取得に失敗しました
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="flex min-h-full items-center justify-center">
                <div
                  className="relative overflow-hidden bg-white p-2 shadow"
                  style={{ transform: `scale(${effectiveScale})`, transformOrigin: 'center center' }}
                >
                  <div className="relative" style={{ width: stageWidth, height: stageHeight }}>
                    <Document
                      file={pdfUrl}
                      onLoadSuccess={({ numPages }) => {
                        setPdfPageCount(numPages)
                        setImageError(null)
                      }}
                      onLoadError={() => {
                        setImageError('signed URLの取得に失敗しました')
                      }}
                      loading={<div className="p-6 text-sm text-muted-foreground">PDFを読み込み中...</div>}
                    >
                      <Page
                        pageNumber={Math.min(pageIndex + 1, totalPages)}
                        width={renderWidth}
                        rotate={rotation}
                        onLoadSuccess={(page) => {
                          const viewport = page.getViewport({ scale: 1 })
                          setPageSize({ width: viewport.width, height: viewport.height })
                        }}
                      />
                    </Document>
                    <Stage
                      width={stageWidth}
                      height={stageHeight}
                      className="absolute inset-0"
                      onClick={handleStageClick}
                    >
                      <Layer>
                        {pageIssues.map((issue) => {
                          if (!visibleContractorIds.has(getIssueContractorId(issue))) return null
                          return (
                            <IssuePin
                              key={issue.id}
                              issue={issue}
                              stageWidth={stageWidth}
                              stageHeight={stageHeight}
                              isSelected={selectedIssueId === issue.id}
                              canDragCallout={mode === 'edit'}
                              onSelect={(selectedIssue) => {
                                jumpToIssue(selectedIssue)
                                if (mode === 'edit') startEditIssue(selectedIssue)
                              }}
                              onDragCallout={updateCalloutPosition}
                            />
                          )
                        })}
                      </Layer>
                    </Stage>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="absolute bottom-4 right-4 flex flex-col gap-2">
            <Button className="h-12 bg-blue-600 hover:bg-blue-700" onClick={() => setMode('add')}>
              <MapPin className="mr-2 h-5 w-5" />
              ピン追加
            </Button>
            <Button
              variant="secondary"
              className="h-12"
              onClick={() => {
                setSidebarOpen(true)
                setSidebarTab('contractors')
              }}
            >
              <Filter className="mr-2 h-5 w-5" />
              業者フィルタ
            </Button>
            <Button className="h-12 bg-blue-600 hover:bg-blue-700" onClick={() => router.push(`/projects/${projectId}`)}>
              <Download className="mr-2 h-5 w-5" />
              PDF出力
            </Button>
            <Button
              variant="destructive"
              className="h-12"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={!selectedIssueId}
            >
              <Trash2 className="mr-2 h-5 w-5" />
              選択削除
            </Button>
          </div>
          <div className="absolute left-4 top-4 z-20">
            <Button variant="outline" size="sm" onClick={() => setSidebarOpen((prev) => !prev)}>
              {sidebarOpen ? 'サイドパネルを閉じる' : 'サイドパネルを開く'}
            </Button>
          </div>
        </section>
      </div>

      <IssueModal
        open={issueModalOpen}
        title={editingIssue ? '指摘を編集' : '指摘を追加'}
        contractors={contractors}
        floors={floors.length > 0 ? floors : [currentDrawing?.floor_label ?? '1F']}
        defaultValues={{
          floor_label: editingIssue?.floor_label ?? currentDrawing?.floor_label ?? '',
          issue_type: editingIssue?.issue_type ?? ISSUE_TYPES[0],
          issue_text: editingIssue?.issue_text ?? '',
          contractor_id: editingIssue?.contractor_id ?? '',
          status: editingIssue?.status ?? 'open',
        }}
        onClose={() => {
          setIssueModalOpen(false)
          setAddingPin(null)
          setEditingIssue(null)
        }}
        onSave={(values) => {
          if (editingIssue) {
            void updateIssue(editingIssue, values)
            return
          }
          void createIssue(values, false)
        }}
        onSaveAndNext={
          editingIssue
            ? undefined
            : (values) => {
                void createIssue(values, true)
              }
        }
        submitLabel={editingIssue ? '更新' : '保存'}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>指摘を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              選択した指摘を削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteIssue()}>削除する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
