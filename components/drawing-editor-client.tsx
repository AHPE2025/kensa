'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Download, Filter, MapPin, Trash2 } from 'lucide-react'
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
import { resolvePhotoUploadTenantId } from '@/lib/issue-photo-paths'
import {
  attachIssuePhotoDisplayUrlsClient,
  deleteIssuePhotoViaApi,
  formatIssuePhotoUploadError,
  uploadIssuePhotosViaApi,
} from '@/lib/issue-photos-client'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useEditorStore } from '@/lib/stores/editor-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import { normalizeRotation, normalizeZoom, MAX_ZOOM } from '@/lib/drawing-view-settings'
import { ISSUE_TYPES, sortDrawingsByFloorLabel, type Contractor, type Drawing, type Issue, type IssueFormValues, type IssueTypeContractorMapping, type Project } from '@/lib/domain'
import { normalizeIssueStatus } from '@/lib/issue-status'
import { buildIssueSaveCategory, buildIssueTypeOptions } from '@/lib/issue-type-mapping'
import {
  buildInspectionReportPdf,
  captureElement,
  downloadPdfBlob,
  includesDrawingPages,
  includesListPages,
  normalizeExportContentType,
  splitIssuesForPdfExport,
  waitForElementImages,
  type PdfExportCondition,
} from '@/lib/pdf-export-client'
import { canvasToDataUrl, renderDrawingToCanvas } from '@/lib/drawing-render-export'
import { getDrawingWithSignedUrl } from '@/lib/drawing-export-url'
import { getTargetDrawings } from '@/lib/pdf-export-filters'
import { createPhotoSignedUrlsForExport, mergePhotoSignedUrls } from '@/lib/issue-photos-client'
import { PdfExportIssueTable } from '@/components/pdf-export-issue-table'
import { PdfExportPhotoDetailPage } from '@/components/pdf-export-photo-detail'
import { toast } from 'sonner'
import { DrawingToolbar } from '@/components/drawing-toolbar'
import { IssueListPanel, type IssueStatusFilter } from '@/components/issue-list-panel'
import { ContractorFilter } from '@/components/contractor-filter'
import { DrawingCanvas } from '@/components/drawing-canvas'
import { IssueModal } from '@/components/issue-modal'

type DrawingRow = Drawing & {
  signed_url: string | null
  issue_count: number
  file_name: string
  signed_page_urls?: Array<string | null>
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

const MIN_ZOOM = 0.5

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function resolveRouteParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value || undefined
  if (Array.isArray(value)) return value[0] || undefined
  return undefined
}

export default function DrawingEditorClient() {
  const params = useParams<{ id: string; drawingId: string }>()
  const routeProjectId = resolveRouteParam(params.id)
  const routeDrawingId = resolveRouteParam(params.drawingId)
  const projectId = routeProjectId ?? ''
  const drawingId = routeDrawingId ?? ''
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
  const [issueTypeMappings, setIssueTypeMappings] = useState<IssueTypeContractorMapping[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [imageError, setImageError] = useState<string | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [rotationSaving, setRotationSaving] = useState(false)
  const [zoomSaving, setZoomSaving] = useState(false)
  const [fitScale, setFitScale] = useState(1)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [addingPin, setAddingPin] = useState<{ x: number; y: number } | null>(null)
  const [issueModalOpen, setIssueModalOpen] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'issues' | 'contractors' | 'exports'>('issues')
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
    statusFilter: 'all' as IssueStatusFilter,
  })
  const [exportTarget, setExportTarget] = useState<'all' | 'unassigned' | 'contractor'>('all')
  const [exportContractorId, setExportContractorId] = useState<string>('all')
  const [exportContentType, setExportContentType] = useState<'list' | 'drawing_and_list'>('drawing_and_list')
  const [isExporting, setIsExporting] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [profileTenantId, setProfileTenantId] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const drawingExportRef = useRef<HTMLDivElement | null>(null)
  const photoDetailExportRef = useRef<HTMLDivElement | null>(null)
  const [photoExportIssues, setPhotoExportIssues] = useState<
    ReturnType<typeof mergePhotoSignedUrls>
  >([])
  const selectedTableExportRef = useRef<HTMLDivElement | null>(null)
  const commonTableExportRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!loadingAuth && !user) router.replace('/login')
  }, [loadingAuth, user, router])

  const parseApiResponse = useCallback(async <T,>(response: Response): Promise<T & { error?: string }> => {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return (await response.json()) as T & { error?: string }
    }
    return { error: await response.text() } as T & { error?: string }
  }, [])

  const refetchIssues = async () => {
    const issueRes = await authedFetch(`/api/drawings/${drawingId}/issues`)
    const issueData = await parseApiResponse<IssueResponse>(issueRes)
    if (!issueRes.ok) {
      console.error('create issue error:', issueData.error ?? '指摘再取得失敗')
      return false
    }
    setIssues(issueData.issues ?? [])
    return true
  }

  const loadData = async () => {
    try {
      if (user) {
        const supabase = getSupabaseBrowserClient()
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle()
        setProfileTenantId(profile?.tenant_id ?? null)
      }

      const [drawingListRes, contractorRes, issueRes, projectRes, mappingRes] = await Promise.all([
        authedFetch(`/api/projects/${projectId}/drawings`),
        authedFetch(`/api/projects/${projectId}/contractors`),
        authedFetch(`/api/drawings/${drawingId}/issues`),
        authedFetch(`/api/projects/${projectId}`),
        authedFetch(`/api/projects/${projectId}/issue-type-mappings`),
      ])

      const drawingListData = (await drawingListRes.json()) as { drawings?: DrawingRow[]; error?: string }
      const contractorData = (await contractorRes.json()) as { contractors?: Contractor[]; error?: string }
      const issueData = (await issueRes.json()) as { drawing?: DrawingRow; issues?: Issue[]; error?: string }
      const projectData = (await projectRes.json()) as { project?: Project; error?: string }
      const mappingData = (await mappingRes.json()) as {
        mappings?: IssueTypeContractorMapping[]
        error?: string
      }

      if (!drawingListRes.ok) {
        console.error('load project drawings error:', drawingListData.error ?? '図面取得失敗')
        return toast.error(drawingListData.error ?? '図面取得失敗')
      }
      if (!contractorRes.ok) return toast.error(contractorData.error ?? '業者取得失敗')
      if (!issueRes.ok) return toast.error(issueData.error ?? '指摘取得失敗')
      if (!mappingRes.ok) {
        console.error('load issue type mappings error:', mappingData.error)
      } else {
        console.log('issue type mappings:', mappingData.mappings)
        setIssueTypeMappings(mappingData.mappings ?? [])
      }
      if (projectRes.ok && projectData.project) {
        setProject(projectData.project)
      }

      const resolvedContractors = (contractorData.contractors ?? []).length > 0
        ? (contractorData.contractors ?? [])
        : FALLBACK_CONTRACTORS
      console.log('contractors:', resolvedContractors)

      const projectDrawings = drawingListData.drawings ?? []
      console.log('project drawings:', projectDrawings)
      setDrawings(projectDrawings)
      const drawingFromList = projectDrawings.find((item) => item.id === drawingId) ?? null
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
      console.error('load project drawings error:', error)
      toast.error('業者取得失敗')
    }
  }

  useEffect(() => {
    if (user) void loadData()
  }, [user, drawingId, projectId])

  const applyDrawingViewSettings = useCallback(
    (drawing: DrawingRow | null) => {
      if (!drawing || drawing.id !== drawingId) return
      const initialRotation = normalizeRotation(drawing.rotation ?? 0)
      const initialZoom = clampZoom(normalizeZoom(drawing.zoom ?? 1))
      console.log('current drawing view settings:', {
        drawingId: drawing.id,
        rotation: initialRotation,
        zoom: initialZoom,
      })
      setRotation(initialRotation)
      setZoom(initialZoom)
    },
    [drawingId, setZoom],
  )

  const patchDrawingViewSettings = useCallback(
    async (payload: { rotation?: number; zoom?: number }, targetDrawingId: string) => {
      const response = await authedFetch(`/api/drawings/${targetDrawingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as {
        drawing?: Pick<Drawing, 'id' | 'rotation' | 'zoom'>
        error?: string
      }
      if (!response.ok) {
        throw new Error(data.error ?? '表示設定の保存に失敗しました')
      }
      const saved = data.drawing
      const merged = {
        ...payload,
        ...(saved?.rotation !== undefined ? { rotation: saved.rotation } : {}),
        ...(saved?.zoom !== undefined ? { zoom: saved.zoom } : {}),
      }
      setDrawings((prev) =>
        prev.map((item) => (item.id === targetDrawingId ? { ...item, ...merged } : item)),
      )
      setCurrentDrawing((prev) =>
        prev && prev.id === targetDrawingId ? { ...prev, ...merged } : prev,
      )
      return merged
    },
    [],
  )

  const saveDrawingRotation = useCallback(
    async (nextRotation: number) => {
      if (rotationSaving) return
      setRotationSaving(true)
      console.log('save drawing rotation:', {
        drawingId,
        rotation: nextRotation,
      })
      try {
        await patchDrawingViewSettings({ rotation: nextRotation }, drawingId)
      } catch (error) {
        console.error('save drawing rotation error:', error)
        toast.error('回転設定の保存に失敗しました')
      } finally {
        setRotationSaving(false)
      }
    },
    [drawingId, patchDrawingViewSettings, rotationSaving],
  )

  const saveDrawingZoom = useCallback(
    async (nextZoom: number) => {
      if (zoomSaving) return
      setZoomSaving(true)
      console.log('save drawing zoom:', {
        drawingId,
        zoom: nextZoom,
      })
      try {
        await patchDrawingViewSettings({ zoom: nextZoom }, drawingId)
      } catch (error) {
        console.error('save drawing zoom error:', error)
        toast.error('ズーム設定の保存に失敗しました')
      } finally {
        setZoomSaving(false)
      }
    },
    [drawingId, patchDrawingViewSettings, zoomSaving],
  )

  useEffect(() => {
    const drawing =
      drawings.find((item) => item.id === drawingId) ??
      (currentDrawing?.id === drawingId ? currentDrawing : null)
    applyDrawingViewSettings(drawing)
  }, [drawingId, drawings, currentDrawing, applyDrawingViewSettings])

  useEffect(() => {
    setPan({ x: 0, y: 0 })
  }, [drawingId, setPan])

  useEffect(() => {
    if (!currentDrawing) return
    const totalPages = Math.max(pdfPageCount, currentDrawing.page_count ?? 0, 1)
    if (pageIndex < totalPages) return
    setPageIndex(Math.max(totalPages - 1, 0))
  }, [currentDrawing, pageIndex, pdfPageCount])

  const numberedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
    return sorted.map((issue, index) => ({ ...issue, no: index + 1 }))
  }, [issues])

  const issueTypeOptions = useMemo(
    () => buildIssueTypeOptions(issueTypeMappings, issues.map((issue) => issue.issue_type)),
    [issueTypeMappings, issues],
  )

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
      if (listFilters.statusFilter === 'pending' && normalizeIssueStatus(issue.status) !== '未対応') return false
      if (listFilters.statusFilter === 'completed' && normalizeIssueStatus(issue.status) !== '完了') return false
      if (!key) return true
      const contractorName =
        issue.issue_category === 'common' ? '共通指摘' : issue.contractor?.name ?? '業者未定'
      return `${issue.issue_text ?? ''}${issue.issue_type}${contractorName}${issue.floor_label}`.toLowerCase().includes(key)
    })
  }, [listFilters, numberedIssues, pageIndex, visibleContractorIds])

  const sortedDrawings = useMemo(() => sortDrawingsByFloorLabel(drawings), [drawings])

  const currentDrawingIndex = useMemo(
    () => sortedDrawings.findIndex((drawing) => drawing.id === drawingId),
    [sortedDrawings, drawingId],
  )

  const totalDrawings = sortedDrawings.length
  const prevDrawing = currentDrawingIndex > 0 ? sortedDrawings[currentDrawingIndex - 1] : null
  const nextDrawing =
    currentDrawingIndex >= 0 && currentDrawingIndex < sortedDrawings.length - 1
      ? sortedDrawings[currentDrawingIndex + 1]
      : null

  const floors = useMemo(() => sortedDrawings.map((drawing) => drawing.floor_label), [sortedDrawings])

  useEffect(() => {
    console.log('issues detail for pdf export', issues.map((issue) => ({
      id: issue.id,
      drawing_id: issue.drawing_id,
      drawingId: (issue as Issue & { drawingId?: string }).drawingId,
      floor: (issue as Issue & { floor?: string }).floor,
      floor_label: issue.floor_label,
      floorLabel: (issue as Issue & { floorLabel?: string }).floorLabel,
      contractor_id: issue.contractor_id,
      contractorId: (issue as Issue & { contractorId?: string }).contractorId,
      assigned_contractor_id: (issue as Issue & { assigned_contractor_id?: string }).assigned_contractor_id,
      assignedContractorId: (issue as Issue & { assignedContractorId?: string }).assignedContractorId,
    })))
    console.log('drawings detail for pdf export', sortedDrawings.map((drawing) => ({
      id: drawing.id,
      floor_label: drawing.floor_label,
      file_path: drawing.file_path,
      storage_path: (drawing as DrawingRow & { storage_path?: string | null }).storage_path,
      original_file_path: (drawing as DrawingRow & { original_file_path?: string | null }).original_file_path,
      signed_url: drawing.signed_url,
      signedUrl: (drawing as DrawingRow & { signedUrl?: string }).signedUrl,
      page_images: drawing.page_images,
      issue_count: drawing.issue_count,
    })))
    console.log('sorted drawings:', sortedDrawings)
    console.log('current drawing index:', currentDrawingIndex)
    console.log('current drawing id:', drawingId)
    console.log('next drawing:', nextDrawing)
    console.log('prev drawing:', prevDrawing)
    console.log('pdf export condition:', {
      exportTarget,
      exportContractorId,
      exportContentType,
    })
  }, [
    issues,
    sortedDrawings,
    currentDrawingIndex,
    drawingId,
    nextDrawing,
    prevDrawing,
    exportTarget,
    exportContractorId,
    exportContentType,
  ])

  const exportCondition = useMemo<PdfExportCondition>(
    () => ({
      exportTarget,
      exportContractorId,
      exportContentType,
    }),
    [exportTarget, exportContractorId, exportContentType],
  )

  const pdfExportSplit = useMemo(
    () => splitIssuesForPdfExport(numberedIssues, exportCondition, contractors),
    [numberedIssues, exportCondition, contractors],
  )

  const exportDrawingPageIssues = useMemo(
    () => pdfExportSplit.drawingIssues.filter((issue) => issue.page_index === pageIndex),
    [pdfExportSplit.drawingIssues, pageIndex],
  )

  const pinsToRender = isExporting ? exportDrawingPageIssues : pageIssues

  const exportDateLabel = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const inspectionDateLabel = useMemo(
    () => project?.inspection_date?.slice(0, 10) ?? exportDateLabel,
    [exportDateLabel, project?.inspection_date],
  )

  const selectedTableBadgeVariant = useMemo(() => {
    if (exportTarget === 'unassigned') return 'unassigned' as const
    if (exportTarget === 'all') return 'all' as const
    return 'contractor' as const
  }, [exportTarget])

  const loadDrawingPdfUrl = useCallback(async (targetDrawingId: string): Promise<string | null> => {
    const drawingWithUrl = await getDrawingWithSignedUrl({
      id: targetDrawingId,
      signed_url: null,
      pdf_signed_url: null,
    })
    return drawingWithUrl.signed_url
  }, [])

  const handleExportPdf = useCallback(async () => {
    console.log('PDF export clicked')

    try {
      setIsExporting(true)
      setExportError(null)

      const normalizedContent = normalizeExportContentType(exportContentType)

      console.log('PDF export condition', {
        exportTarget,
        exportContractorId,
        exportContentType,
      })

      if (exportTarget === 'contractor' && (exportContractorId === 'all' || !exportContractorId)) {
        setExportError('出力する業者を選択してください')
        return
      }

      const {
        commonIssues,
        drawingIssues,
        photoDetailIssues,
        exportContractorLabel,
      } = pdfExportSplit

      const filteredIssues = [...pdfExportSplit.selectedIssues, ...commonIssues]

      console.log('PDF export filtered issues', filteredIssues)

      if (!filteredIssues || filteredIssues.length === 0) {
        setExportError('選択条件に該当する指摘がありません。出力対象または業者を変更してください。')
        return
      }

      const targetDrawingsForExport = getTargetDrawings(sortedDrawings, filteredIssues, 'all')

      console.log('PDF export target drawings before signed url', targetDrawingsForExport)

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

      const selectedTableTarget = selectedTableExportRef.current
      if (
        includesListPages(exportContentType) &&
        pdfExportSplit.selectedIssues.length > 0 &&
        !selectedTableTarget
      ) {
        throw new Error('指摘一覧表の出力対象が見つかりません')
      }

      const selectedTableImage =
        includesListPages(exportContentType) && selectedTableTarget && pdfExportSplit.selectedIssues.length > 0
          ? await captureElement(selectedTableTarget)
          : null

      let commonTableImage: string | null = null
      if (includesListPages(exportContentType) && commonIssues.length > 0) {
        const commonTableTarget = commonTableExportRef.current
        if (!commonTableTarget) {
          throw new Error('共通指摘一覧表の出力対象が見つかりません')
        }
        commonTableImage = await captureElement(commonTableTarget)
      }

      let drawingImageDataList: string[] = []

      if (normalizedContent === 'list_only') {
        console.log('PDF export mode: list only')
      } else if (normalizedContent === 'list_and_drawing') {
        console.log('PDF export mode: drawing and list')

        if (!targetDrawingsForExport || targetDrawingsForExport.length === 0) {
          setExportError('出力対象の図面がありません。指摘と図面の紐付けを確認してください。')
          return
        }

        const drawingsWithSignedUrl = await Promise.all(
          targetDrawingsForExport.map((drawing) => getDrawingWithSignedUrl(drawing)),
        )

        console.log('PDF export drawings with signed url', drawingsWithSignedUrl)

        const invalidDrawings = drawingsWithSignedUrl.filter((drawing) => !drawing.signed_url)
        if (invalidDrawings.length > 0) {
          console.error('Drawings missing signed_url', invalidDrawings)
          setExportError('図面URLを取得できませんでした。再度読み込み直してからPDF出力してください。')
          return
        }

        for (const drawingWithSignedUrl of drawingsWithSignedUrl) {
          const issuesForDrawing = drawingIssues.filter((issue) => issue.drawing_id === drawingWithSignedUrl.id)
          try {
            const canvas = await renderDrawingToCanvas(drawingWithSignedUrl, issuesForDrawing, {
              pageIndex: pageIndex ?? 0,
              resolvePdfUrl: loadDrawingPdfUrl,
            })
            drawingImageDataList.push(canvasToDataUrl(canvas))
          } catch (error) {
            console.error('Drawing render failed', { drawingId: drawingWithSignedUrl.id, error })
            throw error
          }
        }
      } else {
        setExportError('不明な出力形式です。出力内容を選び直してください。')
        return
      }

      let photoDetailImages: string[] = []
      if (includesListPages(exportContentType) && photoDetailIssues.length > 0) {
        const photoSignedUrls = await createPhotoSignedUrlsForExport(photoDetailIssues)
        const mergedPhotoIssues = mergePhotoSignedUrls(photoDetailIssues, photoSignedUrls)
        setPhotoExportIssues(mergedPhotoIssues)
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })

        const photoDetailTarget = photoDetailExportRef.current
        if (photoDetailTarget) {
          const pageElements = photoDetailTarget.querySelectorAll('[data-photo-export-page]')
          for (const pageElement of pageElements) {
            await waitForElementImages(pageElement as HTMLElement)
            photoDetailImages.push(await captureElement(pageElement as HTMLElement))
          }
        }
      }

      const hasExportableList =
        pdfExportSplit.selectedIssues.length > 0 || commonIssues.length > 0

      if (normalizedContent === 'list_only' && !hasExportableList && photoDetailImages.length === 0) {
        setExportError('選択条件に該当する指摘がありません。出力対象または業者を変更してください。')
        return
      }

      const { blob, filename } = await buildInspectionReportPdf({
        selectedTableImage,
        commonTableImage,
        drawingImageDataList,
        photoDetailImages,
        includeLists: includesListPages(exportContentType) && hasExportableList,
        includeDrawing: includesDrawingPages(exportContentType) && drawingImageDataList.length > 0,
        includePhotoDetail: photoDetailImages.length > 0,
        hasCommonPage: commonIssues.length > 0,
        filenameLabel: exportContractorLabel,
      })

      downloadPdfBlob(blob, filename)
      console.log('PDF export completed')
      toast.success(`${exportContractorLabel}のPDFを出力しました`)
    } catch (error) {
      console.error('PDF export failed', error)
      setExportError('PDF出力に失敗しました。図面データまたは描画処理を確認してください。')
      toast.error('PDF出力に失敗しました')
    } finally {
      setPhotoExportIssues([])
      setIsExporting(false)
    }
  }, [
    exportContentType,
    exportContractorId,
    exportTarget,
    loadDrawingPdfUrl,
    pageIndex,
    pdfExportSplit,
    sortedDrawings,
  ])

  const getIssueContractorId = useCallback((issue: Issue) => issue.contractor_id ?? UNASSIGNED_CONTRACTOR_KEY, [])
  const isFallbackContractor = useCallback((contractorId: string) => contractorId.startsWith('fallback-'), [])

  const resolveIssuePhotoTenantId = useCallback(
    (drawingTenantId?: string | null) =>
      resolvePhotoUploadTenantId({
        drawingTenantId,
        projectTenantId: project?.tenant_id,
        profileTenantId,
        apiTenantId: profileTenantId,
      }),
    [profileTenantId, project?.tenant_id],
  )

  const createIssue = useCallback(
    async (values: IssueFormValues, continueMode: boolean) => {
      if (!addingPin || !currentDrawing) return
      try {
        const beforePhotoFile = values.beforePhotoFile
        const afterPhotoFile = values.afterPhotoFile
        console.log('before photo file:', beforePhotoFile)
        console.log('after photo file:', afterPhotoFile)

        const payload = {
          tenant_id:
            resolveIssuePhotoTenantId(currentDrawing.tenant_id) ?? currentDrawing.tenant_id,
          project_id: projectId,
          drawing_id: drawingId,
          page_index: pageIndex ?? 0,
          floor_label: currentDrawing.floor_label ?? '1F',
          issue_type: values.issue_type,
          issue_text: values.issue_text.trim() || null,
          issue_category: buildIssueSaveCategory(values),
          contractor_id:
            values.contractor_id && !isFallbackContractor(values.contractor_id)
              ? values.contractor_id
              : null,
          pin_x: addingPin.x,
          pin_y: addingPin.y,
          callout_x: Math.min(1, Math.max(0, addingPin.x + 0.05)),
          callout_y: Math.min(1, Math.max(0, addingPin.y - 0.05)),
          status: normalizeIssueStatus(values.status || '未対応'),
          before_photo_path: null,
          after_photo_path: null,
        }
        console.log('normalized issue status:', payload.status)
        console.log('issue payload with mapping:', payload)
        console.log('issue payload FULL:', JSON.stringify(payload, null, 2))
        console.log('auto floor_label:', currentDrawing?.floor_label)

        const response = await authedFetch(`/api/drawings/${drawingId}/issues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await parseApiResponse<IssueResponse>(response)
        if (!response.ok || !data.issue) {
          const errorMessage =
            data.error === '写真のアップロードに失敗しました'
              ? data.error
              : Array.isArray(data.missing) && data.missing.length > 0
                ? `${data.error ?? '保存失敗'}: ${data.missing.join(', ')}`
                : data.error ?? '保存失敗'
          console.error('create issue error:', data)
          toast.error(errorMessage)
          return
        }

        const issueId = data.issue.id
        const resolvedProjectId = data.issue.project_id || projectId

        if (beforePhotoFile || afterPhotoFile) {
          if (!resolvedProjectId) {
            toast.error('写真保存に必要な案件情報が不足しています')
            return
          }

          const uploadResult = await uploadIssuePhotosViaApi({
            projectId: resolvedProjectId,
            issueId,
            beforePhotoFile,
            afterPhotoFile,
          })

          if (!uploadResult.ok) {
            toast.error(formatIssuePhotoUploadError(uploadResult))
            await refetchIssues()
            setSelectedIssueId(issueId)
            return
          }

          const photoPayload: Record<string, string | null> = {}
          if (uploadResult.beforePhotoPath) {
            photoPayload.before_photo_path = uploadResult.beforePhotoPath
          }
          if (uploadResult.afterPhotoPath) {
            photoPayload.after_photo_path = uploadResult.afterPhotoPath
          }

          if (Object.keys(photoPayload).length > 0) {
            const patchResponse = await authedFetch(`/api/drawings/${drawingId}/issues/${issueId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(photoPayload),
            })
            const patchData = await parseApiResponse<{ issue?: Issue; error?: string }>(patchResponse)
            if (!patchResponse.ok || !patchData.issue) {
              console.error('issue photo path update error:', patchData)
              toast.error('指摘は保存しましたが、写真パスの更新に失敗しました')
            }
          }
        }

        await refetchIssues()
        setSelectedIssueId(issueId)
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
    [
      addingPin,
      currentDrawing,
      drawingId,
      isFallbackContractor,
      pageIndex,
      parseApiResponse,
      projectId,
      refetchIssues,
      resolveIssuePhotoTenantId,
      setMode,
    ],
  )

  const updateIssue = useCallback(
    async (targetIssue: Issue, values: IssueFormValues) => {
      try {
        const beforePhotoFile = values.beforePhotoFile
        const afterPhotoFile = values.afterPhotoFile
        console.log('before photo file:', beforePhotoFile)
        console.log('after photo file:', afterPhotoFile)

        const resolvedProjectId = targetIssue.project_id || projectId
        if (!resolvedProjectId) {
          toast.error('写真保存に必要な案件情報が不足しています')
          return
        }

        let beforePhotoPath = targetIssue.before_photo_path ?? null
        let afterPhotoPath = targetIssue.after_photo_path ?? null
        const oldBeforePath = beforePhotoPath
        const oldAfterPath = afterPhotoPath

        if (values.clearBeforePhoto) {
          if (oldBeforePath) {
            await deleteIssuePhotoViaApi(oldBeforePath)
          }
          beforePhotoPath = null
        }
        if (values.clearAfterPhoto) {
          if (oldAfterPath) {
            await deleteIssuePhotoViaApi(oldAfterPath)
          }
          afterPhotoPath = null
        }

        if (beforePhotoFile || afterPhotoFile) {
          const uploadResult = await uploadIssuePhotosViaApi({
            projectId: resolvedProjectId,
            issueId: targetIssue.id,
            beforePhotoFile,
            afterPhotoFile,
          })
          if (!uploadResult.ok) {
            toast.error(formatIssuePhotoUploadError(uploadResult))
            return
          }

          if (beforePhotoFile && uploadResult.beforePhotoPath) {
            if (oldBeforePath && oldBeforePath !== uploadResult.beforePhotoPath) {
              await deleteIssuePhotoViaApi(oldBeforePath)
            }
            beforePhotoPath = uploadResult.beforePhotoPath
          }
          if (afterPhotoFile && uploadResult.afterPhotoPath) {
            if (oldAfterPath && oldAfterPath !== uploadResult.afterPhotoPath) {
              await deleteIssuePhotoViaApi(oldAfterPath)
            }
            afterPhotoPath = uploadResult.afterPhotoPath
          }
        }

        const payload: Record<string, unknown> = {
          floor_label: currentDrawing?.floor_label ?? '1F',
          issue_type: values.issue_type,
          issue_text: values.issue_text.trim() || null,
          issue_category: buildIssueSaveCategory(values),
          contractor_id:
            values.contractor_id && !isFallbackContractor(values.contractor_id)
              ? values.contractor_id
              : null,
          status: normalizeIssueStatus(values.status || '未対応'),
        }
        console.log('normalized issue status:', payload.status)

        if (beforePhotoFile || values.clearBeforePhoto) {
          payload.before_photo_path = beforePhotoPath
        }
        if (afterPhotoFile || values.clearAfterPhoto) {
          payload.after_photo_path = afterPhotoPath
        }

        console.log('issue payload with mapping:', payload)
        console.log('issue payload FULL:', JSON.stringify(payload, null, 2))

        const response = await authedFetch(`/api/drawings/${drawingId}/issues/${targetIssue.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await parseApiResponse<{ issue?: Issue; error?: string; missing?: string[] }>(response)
        if (!response.ok || !data.issue) {
          const errorMessage =
            data.error === '写真のアップロードに失敗しました'
              ? data.error
              : Array.isArray(data.missing) && data.missing.length > 0
                ? `${data.error ?? '更新に失敗しました'}: ${data.missing.join(', ')}`
                : data.error ?? '更新に失敗しました'
          console.error('create issue error:', data)
          toast.error(errorMessage)
          return
        }
        await refetchIssues()
        setSelectedIssueId(targetIssue.id)
        setEditingIssue(null)
        setIssueModalOpen(false)
        toast.success('指摘を更新しました')
      } catch (error) {
        console.error('issue status update error:', error)
        toast.error('更新に失敗しました')
      }
    },
    [
      currentDrawing?.floor_label,
      drawingId,
      isFallbackContractor,
      parseApiResponse,
      projectId,
      refetchIssues,
    ],
  )

  const deleteIssue = async () => {
    if (!selectedIssueId) return
    try {
      console.log('delete issue:', selectedIssueId)
      const response = await authedFetch(`/api/drawings/${drawingId}/issues/${selectedIssueId}`, {
        method: 'DELETE',
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        console.error('delete issue error:', data.error ?? data)
        toast.error(data.error ?? '削除失敗')
        return
      }
      await refetchIssues()
      setSelectedIssueId(null)
      toast.success('指摘を削除しました')
    } catch (error) {
      console.error('delete issue error:', error)
      toast.error('削除失敗')
    } finally {
      setDeleteConfirmOpen(false)
    }
  }

  const startEditIssue = useCallback(async (issue: Issue) => {
    const issueWithPhotoUrls = await attachIssuePhotoDisplayUrlsClient(issue)
    setEditingIssue(issueWithPhotoUrls)
    setIssueModalOpen(true)
  }, [])

  const requestDeleteIssue = useCallback((issue: Issue) => {
    setSelectedIssueId(issue.id)
    setDeleteConfirmOpen(true)
  }, [])

  const updatePinPosition = useCallback(
    async (issueId: string, pinX: number, pinY: number): Promise<boolean> => {
      const toastId = `position-${issueId}-pin`
      toast.loading('位置を保存中...', { id: toastId })
      const updatedAt = new Date().toISOString()
      try {
        const response = await authedFetch(`/api/drawings/${drawingId}/issues/${issueId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin_x: pinX, pin_y: pinY, updated_at: updatedAt }),
        })
        const data = (await response.json()) as { error?: string }
        if (!response.ok) {
          console.error('update issue position error:', data.error ?? data)
          toast.error('位置の保存に失敗しました', { id: toastId })
          return false
        }
        const currentIssues = useEditorStore.getState().issues
        setIssues(
          currentIssues.map((issue) =>
            issue.id === issueId ? { ...issue, pin_x: pinX, pin_y: pinY, updated_at: updatedAt } : issue,
          ),
        )
        toast.success('保存しました', { id: toastId })
        return true
      } catch (error) {
        console.error('update issue position error:', error)
        toast.error('位置の保存に失敗しました', { id: toastId })
        return false
      }
    },
    [drawingId, setIssues],
  )

  const updateCalloutPosition = useCallback(
    async (issueId: string, calloutX: number, calloutY: number): Promise<boolean> => {
      const toastId = `position-${issueId}-callout`
      toast.loading('位置を保存中...', { id: toastId })
      const updatedAt = new Date().toISOString()
      try {
        const response = await authedFetch(`/api/drawings/${drawingId}/issues/${issueId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callout_x: calloutX, callout_y: calloutY, updated_at: updatedAt }),
        })
        const data = (await response.json()) as { error?: string }
        if (!response.ok) {
          console.error('update issue position error:', data.error ?? data)
          toast.error('位置の保存に失敗しました', { id: toastId })
          return false
        }
        const currentIssues = useEditorStore.getState().issues
        setIssues(
          currentIssues.map((issue) =>
            issue.id === issueId
              ? { ...issue, callout_x: calloutX, callout_y: calloutY, updated_at: updatedAt }
              : issue,
          ),
        )
        toast.success('保存しました', { id: toastId })
        return true
      } catch (error) {
        console.error('update issue position error:', error)
        toast.error('位置の保存に失敗しました', { id: toastId })
        return false
      }
    },
    [drawingId, setIssues],
  )

  const jumpToIssue = useCallback((issue: Issue) => {
    setSelectedIssueId(issue.id)
    console.log('issue selected:', issue.id)
  }, [])

  const handleIssueSelect = useCallback(
    (selectedIssue: Issue & { no: number }) => {
      jumpToIssue(selectedIssue)
    },
    [jumpToIssue],
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

  const handleStageClick = useCallback((event: { target: { getStage: () => unknown; getPointerPosition?: () => { x: number; y: number } | null } }) => {
    const stage = event.target.getStage()
    const clickedOnEmpty = event.target === stage
    if (mode === 'edit') {
      if (clickedOnEmpty) {
        setSelectedIssueId(null)
      }
      return
    }
    if (mode !== 'add' || !clickedOnEmpty) return
    const pointer = (stage as { getPointerPosition: () => { x: number; y: number } | null } | null)?.getPointerPosition()
    if (!pointer) return
    const xRatio = pointer.x / stageWidth
    const yRatio = pointer.y / stageHeight
    if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) return
    setAddingPin({ x: xRatio, y: yRatio })
    setEditingIssue(null)
    setIssueModalOpen(true)
  }, [mode, stageHeight, stageWidth])

  const handlePdfLoadSuccess = useCallback((numPages: number) => {
    setPdfPageCount(numPages)
    setImageError(null)
  }, [])

  const handlePdfLoadError = useCallback(() => {
    setImageError('signed URLの取得に失敗しました')
  }, [])

  const handlePageLoadSuccess = useCallback((width: number, height: number) => {
    setPageSize({ width, height })
  }, [])

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      <DrawingToolbar
        drawings={sortedDrawings}
        currentFloorLabel={currentDrawing?.floor_label ?? ''}
        currentDrawingIndex={currentDrawingIndex}
        totalDrawings={totalDrawings}
        mode={mode}
        zoom={zoom}
        rotation={rotation}
        rotationSaving={rotationSaving}
        zoomSaving={zoomSaving}
        onBack={() => router.push(`/projects/${projectId}`)}
        onChangeDrawing={(floorLabel) => {
          const drawing = sortedDrawings.find((item) => item.floor_label === floorLabel)
          if (drawing) {
            router.push(`/projects/${projectId}/drawings/${drawing.id}`)
            return
          }
          toast.error('この階の図面は登録されていません')
        }}
        onChangeMode={setMode}
        onZoomIn={() => {
          const nextZoom = clampZoom(zoom + 0.1)
          setZoom(nextZoom)
          void saveDrawingZoom(nextZoom)
        }}
        onZoomOut={() => {
          const nextZoom = clampZoom(zoom - 0.1)
          setZoom(nextZoom)
          void saveDrawingZoom(nextZoom)
        }}
        onPrevDrawing={() => {
          if (prevDrawing) {
            router.push(`/projects/${projectId}/drawings/${prevDrawing.id}`)
          }
        }}
        onNextDrawing={() => {
          if (nextDrawing) {
            router.push(`/projects/${projectId}/drawings/${nextDrawing.id}`)
          }
        }}
        onRotate={() => {
          const nextRotation = (rotation + 90) % 360
          setRotation(nextRotation)
          void saveDrawingRotation(nextRotation)
        }}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen ? (
          <aside className="w-80 border-r bg-white">
            <Tabs
              value={sidebarTab}
              onValueChange={(value) => setSidebarTab(value as 'issues' | 'contractors' | 'exports')}
              className="flex h-full flex-col"
            >
              <TabsList className="mx-3 mt-3 grid h-10 grid-cols-3">
                <TabsTrigger value="issues">指摘一覧</TabsTrigger>
                <TabsTrigger value="contractors">業者表示</TabsTrigger>
                <TabsTrigger value="exports">出力</TabsTrigger>
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
              <TabsContent value="exports" className="mt-3 min-h-0 flex-1">
                <div className="space-y-3 px-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">業者ごとの指摘一覧出力</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <p className="text-xs font-medium">出力対象</p>
                        <Tabs value={exportTarget} onValueChange={(v) => setExportTarget(v as typeof exportTarget)}>
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="all">全業者</TabsTrigger>
                            <TabsTrigger value="contractor">特定業者</TabsTrigger>
                            <TabsTrigger value="unassigned">業者未定</TabsTrigger>
                          </TabsList>
                        </Tabs>
                        {exportTarget === 'contractor' ? (
                          <select
                            className="h-9 w-full rounded-md border px-2 text-sm"
                            value={exportContractorId}
                            onChange={(event) => setExportContractorId(event.target.value)}
                          >
                            <option value="all">業者を選択</option>
                            {contractors.map((contractor) => (
                              <option key={contractor.id} value={contractor.id}>
                                {contractor.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium">出力内容</p>
                        <Tabs
                          value={exportContentType}
                          onValueChange={(v) =>
                            setExportContentType(v as typeof exportContentType)
                          }
                        >
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="list">指摘一覧のみ</TabsTrigger>
                            <TabsTrigger value="drawing_and_list">図面＋指摘一覧</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                      {exportError ? (
                        <p className="text-red-600 text-sm mt-2">{exportError}</p>
                      ) : null}
                      <Button
                        type="button"
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        disabled={isExporting}
                        onClick={handleExportPdf}
                      >
                        {isExporting ? 'PDF生成中...' : 'PDF出力'}
                      </Button>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">出力プレビュー</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="overflow-hidden rounded border bg-slate-50">
                        <div className="origin-top-left scale-[0.22]" style={{ width: 1122 }}>
                          <PdfExportIssueTable
                            title="検査指摘一覧表"
                            projectName={project?.name ?? '物件名未設定'}
                            address={project?.address ?? '-'}
                            inspectionDate={inspectionDateLabel}
                            exportDate={exportDateLabel}
                            floorLabel={currentDrawing?.floor_label ?? '1F'}
                            badgeLabel={pdfExportSplit.exportContractorLabel}
                            badgeVariant={selectedTableBadgeVariant}
                            issues={pdfExportSplit.selectedIssues}
                          />
                        </div>
                      </div>
                      {pdfExportSplit.commonIssues.length > 0 ? (
                        <div className="overflow-hidden rounded border bg-slate-50">
                          <div className="origin-top-left scale-[0.22]" style={{ width: 1122 }}>
                            <PdfExportIssueTable
                              title="共通指摘一覧表"
                              projectName={project?.name ?? '物件名未設定'}
                              address={project?.address ?? '-'}
                              inspectionDate={inspectionDateLabel}
                              exportDate={exportDateLabel}
                              floorLabel={currentDrawing?.floor_label ?? '1F'}
                              badgeLabel="共通"
                              badgeVariant="common"
                              issues={pdfExportSplit.commonIssues}
                            />
                          </div>
                        </div>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        図面ページ：選択業者＋共通指摘のピン（{exportDrawingPageIssues.length}件 / 現在ページ）
                      </p>
                    </CardContent>
                  </Card>
                </div>
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
              <DrawingCanvas
                pdfUrl={pdfUrl}
                pageIndex={pageIndex}
                totalPages={totalPages}
                renderWidth={renderWidth}
                rotation={rotation}
                stageWidth={stageWidth}
                stageHeight={stageHeight}
                effectiveScale={effectiveScale}
                pinsToRender={pinsToRender}
                mode={mode}
                selectedIssueId={selectedIssueId}
                isExporting={isExporting}
                visibleContractorIds={visibleContractorIds}
                getIssueContractorId={getIssueContractorId}
                onPdfLoadSuccess={handlePdfLoadSuccess}
                onPdfLoadError={handlePdfLoadError}
                onPageLoadSuccess={handlePageLoadSuccess}
                onStageClick={handleStageClick}
                onSelect={handleIssueSelect}
                onEdit={startEditIssue}
                onDeleteRequest={requestDeleteIssue}
                onDragPin={updatePinPosition}
                onDragCallout={updateCalloutPosition}
                canvasRef={drawingExportRef}
              />
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
            <Button
              type="button"
              className="h-12 bg-blue-600 hover:bg-blue-700"
              disabled={isExporting}
              onClick={handleExportPdf}
            >
              <Download className="mr-2 h-5 w-5" />
              {isExporting ? 'PDF生成中...' : 'PDF出力'}
            </Button>
            <Button
              variant="destructive"
              className="h-12"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={mode !== 'edit' || !selectedIssueId}
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
        issueTypeOptions={issueTypeOptions}
        issueTypeMappings={issueTypeMappings}
        isEditMode={Boolean(editingIssue)}
        defaultValues={{
          issue_type: editingIssue?.issue_type ?? issueTypeOptions[0] ?? ISSUE_TYPES[0],
          issue_text: editingIssue?.issue_text ?? '',
          contractor_id: editingIssue?.contractor_id ?? '',
          issue_category: editingIssue?.issue_category ?? '',
          status: normalizeIssueStatus(editingIssue?.status ?? '未対応'),
        }}
        defaultBeforePhotoUrl={editingIssue?.before_photo_url ?? null}
        defaultAfterPhotoUrl={editingIssue?.after_photo_url ?? null}
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

      <div className="pointer-events-none fixed left-[-12000px] top-0 z-[-1]" aria-hidden>
        <div ref={selectedTableExportRef}>
          <PdfExportIssueTable
            title="検査指摘一覧表"
            projectName={project?.name ?? '物件名未設定'}
            address={project?.address ?? '-'}
            inspectionDate={inspectionDateLabel}
            exportDate={exportDateLabel}
            floorLabel={currentDrawing?.floor_label ?? '1F'}
            badgeLabel={pdfExportSplit.exportContractorLabel}
            badgeVariant={selectedTableBadgeVariant}
            issues={pdfExportSplit.selectedIssues}
          />
        </div>
        {pdfExportSplit.commonIssues.length > 0 ? (
          <div ref={commonTableExportRef}>
            <PdfExportIssueTable
              title="共通指摘一覧表"
              projectName={project?.name ?? '物件名未設定'}
              address={project?.address ?? '-'}
              inspectionDate={inspectionDateLabel}
              exportDate={exportDateLabel}
              floorLabel={currentDrawing?.floor_label ?? '1F'}
              badgeLabel="共通"
              badgeVariant="common"
              issues={pdfExportSplit.commonIssues}
            />
          </div>
        ) : null}
        {photoExportIssues.length > 0 ? (
          <div ref={photoDetailExportRef}>
            {photoExportIssues.map((issue) => (
              <div key={issue.id} data-photo-export-page>
                <PdfExportPhotoDetailPage issue={issue} />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この指摘を削除しますか？</AlertDialogTitle>
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
