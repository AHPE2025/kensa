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
  captureElement,
  delay,
  downloadPdfBlob,
  DOWNLOAD_INTERVAL_MS,
  includesDrawingPages,
  includesListPages,
  listBulkExportTargets,
  normalizeExportContentType,
  waitForDomUpdate,
  waitForElementImages,
  type ExportIssue,
  type PdfExportCondition,
  type PdfExportSplit,
} from '@/lib/pdf-export-client'
import {
  getDrawingWithSignedUrl,
  normalizeDrawingPdfUrl,
  pickPdfSignedUrl,
} from '@/lib/drawing-export-url'
import { exportInspectionPdf } from '@/lib/inspection-pdf-export'
import { InspectionListPreview } from '@/components/inspection-list-preview'
import { PdfExportPhotoDetailPage, type PhotoDetailIssue } from '@/components/pdf-export-photo-detail'
import { PdfExportPhotoPreviewSection } from '@/components/pdf-export-photo-preview'
import { PdfExportPreview } from '@/components/pdf-export-preview'
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
type ExportContentMode = 'list' | 'drawing_and_list'
type ExportRunOverride = {
  exportTarget: 'contractor' | 'unassigned'
  exportContractorId: string
} | null

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
  const normalized = normalizeExportContentType(value)
  return normalized === 'list_only' ? 'list' : 'drawing_and_list'
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

function exportTargetLabel(target: ExportTargetMode): string {
  if (target === 'all') return '全業者'
  if (target === 'contractor') return '特定業者'
  return '業者未定'
}

function exportContentLabel(content: ExportContentMode): string {
  return content === 'list' ? '指摘一覧のみ' : '図面＋指摘一覧'
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
  const urlExportTarget =
    searchParams.get('exportTarget') ?? searchParams.get('target')
  const urlExportContractorId =
    searchParams.get('exportContractorId') ?? searchParams.get('contractorId')
  const urlExportContentType =
    searchParams.get('exportContentType') ?? searchParams.get('contentType')

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
  const [previewDrawings, setPreviewDrawings] = useState<DrawingRow[]>([])
  const [loadingPreviewDrawings, setLoadingPreviewDrawings] = useState(false)

  const [selectedExportTarget, setSelectedExportTarget] = useState<ExportTargetMode>('all')
  const [selectedContractorId, setSelectedContractorId] = useState<string>('')
  const [selectedFloor, setSelectedFloor] = useState<'all' | string>('all')
  const [exportContent, setExportContent] = useState<ExportContentMode>('drawing_and_list')
  const [exportRunOverride, setExportRunOverride] = useState<ExportRunOverride>(null)

  const selectedTableExportRef = useRef<HTMLDivElement | null>(null)
  const commonTableExportRef = useRef<HTMLDivElement | null>(null)
  const photoDetailExportRefs = useRef<(HTMLDivElement | null)[]>([])
  const pdfExportSplitRef = useRef<PdfExportSplit | null>(null)
  const targetDrawingsRef = useRef<DrawingRow[]>([])
  const bulkExportStartedRef = useRef(false)

  useEffect(() => {
    if (!loadingAuth && !user) router.replace('/login')
  }, [loadingAuth, user, router])

  const loadDrawingPdfUrl = useCallback(async (targetDrawingId: string): Promise<string | null> => {
    const res = await authedFetch(`/api/drawings/${targetDrawingId}`)
    const data = (await res.json()) as {
      signedUrl?: string | null
      signed_url?: string | null
      pdf_signed_url?: string | null
      error?: string
    }
    if (!res.ok) {
      console.error('drawing pdf url load error:', data.error ?? targetDrawingId)
      return null
    }
    return pickPdfSignedUrl(data)
  }, [])

  const resolveDrawingsWithSignedUrl = useCallback(
    async (drawingsToResolve: DrawingRow[]) => {
      return Promise.all(drawingsToResolve.map((drawing) => getDrawingWithSignedUrl(drawing)))
    },
    [],
  )

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
      const sortedDrawingsList = sortDrawingsByFloorLabel(drawingListData.drawings ?? []).map((drawing) => {
        const imageSignedUrl = drawing.image_signed_url ?? drawing.signed_url ?? null
        const pdfSignedUrl = drawing.pdf_signed_url ?? pickPdfSignedUrl(drawing)
        return normalizeDrawingPdfUrl({
          ...drawing,
          image_signed_url: imageSignedUrl,
          pdf_signed_url: pdfSignedUrl,
        })
      })

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

      console.log('issues drawing ids', allIssues.map((issue) => ({
        id: issue.id,
        drawing_id: issue.drawing_id,
        drawingId: (issue as Issue & { drawingId?: string }).drawingId,
        floor: (issue as Issue & { floor?: string }).floor,
        floor_label: issue.floor_label,
        contractor_id: issue.contractor_id,
        contractorId: (issue as Issue & { contractorId?: string }).contractorId,
      })))
      console.log('drawings ids', sortedDrawingsList.map((drawing) => ({
        id: drawing.id,
        floor_label: drawing.floor_label,
        issue_count: drawing.issue_count,
        signed_url: drawing.signed_url,
        signedUrl: (drawing as DrawingRow & { signedUrl?: string }).signedUrl,
        pdf_signed_url: drawing.pdf_signed_url,
      })))

      const initialFloor =
        urlDrawingId != null
          ? (sortedDrawingsList.find((drawing) => drawing.id === urlDrawingId)?.floor_label ?? 'all')
          : 'all'

      console.log('contractors:', resolvedContractors)
      console.log('issues:', allIssues)
      console.log('project drawings:', sortedDrawingsList)
      console.log('sorted drawings:', sortDrawingsByFloorLabel(sortedDrawingsList))
      if (urlDrawingId) {
        const currentDrawingIndex = sortedDrawingsList.findIndex((drawing) => drawing.id === urlDrawingId)
        console.log('current drawing index:', currentDrawingIndex)
        console.log('current drawing id:', urlDrawingId)
        console.log(
          'next drawing:',
          currentDrawingIndex >= 0 && currentDrawingIndex < sortedDrawingsList.length - 1
            ? sortedDrawingsList[currentDrawingIndex + 1]
            : null,
        )
        console.log(
          'prev drawing:',
          currentDrawingIndex > 0 ? sortedDrawingsList[currentDrawingIndex - 1] : null,
        )
      }

      setProject(projectData.project)
      setDrawings(sortedDrawingsList)
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
  }, [projectId, urlDrawingId, urlExportContentType, urlExportContractorId, urlExportTarget])

  useEffect(() => {
    if (user) void loadData()
  }, [user, loadData])

  const sortedDrawings = useMemo(() => sortDrawingsByFloorLabel(drawings), [drawings])

  const exportDateLabel = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const inspectionDateLabel = useMemo(
    () => project?.inspection_date?.slice(0, 10) ?? exportDateLabel,
    [exportDateLabel, project?.inspection_date],
  )

  const effectiveExportTarget = exportRunOverride?.exportTarget ?? selectedExportTarget
  const effectiveContractorId = exportRunOverride?.exportContractorId ?? selectedContractorId

  const exportCondition = useMemo<PdfExportCondition>(
    () => ({
      exportTarget: effectiveExportTarget,
      exportContractorId:
        effectiveExportTarget === 'contractor' ? effectiveContractorId || 'all' : 'all',
      exportContentType: exportContent,
    }),
    [exportContent, effectiveContractorId, effectiveExportTarget],
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

  useEffect(() => {
    pdfExportSplitRef.current = pdfExportSplit
  }, [pdfExportSplit])

  useEffect(() => {
    targetDrawingsRef.current = targetDrawings
  }, [targetDrawings])

  useEffect(() => {
    if (!includesDrawingPages(exportContent) || targetDrawings.length === 0) {
      setPreviewDrawings([])
      return
    }

    let cancelled = false
    const loadPreviewDrawings = async () => {
      setLoadingPreviewDrawings(true)
      try {
        const withUrls = await resolveDrawingsWithSignedUrl(targetDrawings)
        if (!cancelled) setPreviewDrawings(withUrls)
      } catch (error) {
        console.error('preview drawing signed url error:', error)
        if (!cancelled) setPreviewDrawings(targetDrawings)
      } finally {
        if (!cancelled) setLoadingPreviewDrawings(false)
      }
    }

    void loadPreviewDrawings()
    return () => {
      cancelled = true
    }
  }, [exportContent, resolveDrawingsWithSignedUrl, targetDrawings])

  const getDrawingIssues = useCallback(
    (drawingId: string) => getIssuesByDrawingId(filteredIssues, drawingId),
    [filteredIssues],
  )

  const selectedFloorLabel =
    selectedFloor === 'all' ? '全階' : sortedDrawings.find((d) => d.floor_label === selectedFloor)?.floor_label ?? selectedFloor

  const selectedTableBadgeVariant = useMemo(() => {
    if (effectiveExportTarget === 'unassigned') return 'unassigned' as const
    if (effectiveExportTarget === 'all') return 'all' as const
    return 'contractor' as const
  }, [effectiveExportTarget])

  const selectedVendorStats = useMemo(
    () => countStatusStats(pdfExportSplit.selectedIssues),
    [pdfExportSplit.selectedIssues],
  )

  const photoDetailIssuesForPreview = useMemo(() => {
    if (!includesListPages(exportContent)) return []
    return filteredIssues.filter((issue) => issue.before_photo_path || issue.after_photo_path)
  }, [exportContent, filteredIssues])

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
  }, [issues, sortedDrawings])

  useEffect(() => {
    if (loading || !project) return

    console.log('Export preview page loaded')
    console.log('Export preview condition', {
      projectId,
      exportTarget: effectiveExportTarget,
      exportContractorId:
        effectiveExportTarget === 'contractor' ? effectiveContractorId || 'all' : 'all',
      exportContentType: exportContent,
    })
    console.log('Export preview filtered issues', filteredIssues)
    console.log('Export preview target drawings', targetDrawings)
  }, [
    effectiveContractorId,
    effectiveExportTarget,
    exportContent,
    filteredIssues,
    loading,
    project,
    projectId,
    targetDrawings,
  ])

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

  const runPdfExport = useCallback(
    async (
      drawingsForExport: DrawingRow[],
      options?: { filenameLabel?: string; skipEmpty?: boolean },
    ): Promise<boolean> => {
      const split = pdfExportSplitRef.current
      if (!split) return false

      const { photoDetailIssues } = split
      const includePhotoDetail = includesListPages(exportContent) && photoDetailIssues.length > 0

      let photoDetailIssuesWithUrls: PhotoDetailIssue[] = []
      if (includePhotoDetail) {
        const signedUrls = await createPhotoSignedUrlsForExport(photoDetailIssues)
        photoDetailIssuesWithUrls = mergePhotoSignedUrls(photoDetailIssues, signedUrls)
        setPhotoDetailExportData(photoDetailIssuesWithUrls)
        await waitForDomUpdate()
      } else {
        setPhotoDetailExportData([])
      }

      const photoDetailImages: string[] = []
      if (includePhotoDetail && photoDetailIssuesWithUrls.length > 0) {
        await waitForDomUpdate()
        for (let index = 0; index < photoDetailIssuesWithUrls.length; index += 1) {
          const target = photoDetailExportRefs.current[index]
          if (!target) continue
          await waitForElementImages(target)
          photoDetailImages.push(await captureElement(target))
        }
      }

      const result = await exportInspectionPdf({
        exportContent,
        split,
        targetDrawings: drawingsForExport,
        getDrawingIssues,
        resolveDrawingPdfUrl: loadDrawingPdfUrl,
        getSelectedTableElement: () => selectedTableExportRef.current,
        getCommonTableElement: () => commonTableExportRef.current,
        photoDetailImages,
        includePhotoDetail,
        filenameLabel: options?.filenameLabel,
        skipEmpty: options?.skipEmpty,
      })

      if (!result.exported || !result.blob || !result.filename) {
        return false
      }

      downloadPdfBlob(result.blob, result.filename)
      return true
    },
    [exportContent, getDrawingIssues, loadDrawingPdfUrl],
  )

  const handleBulkExport = useCallback(async () => {
    if (contractors.length === 0) {
      toast.error('業者が登録されていません')
      return
    }

    const targets = listBulkExportTargets(contractors, issues)
    if (targets.length === 0) {
      toast.error('出力対象の業者がありません')
      return
    }

    try {
      setIsExporting(true)
      setExportError(null)

      let successCount = 0
      let skippedCount = 0
      const toastId = toast.loading(`PDF出力中... (0/${targets.length})`)

      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index]
        toast.loading(`PDF出力中... (${index + 1}/${targets.length}) ${target.label}`, { id: toastId })

        photoDetailExportRefs.current = []
        setExportRunOverride({
          exportTarget: target.exportTarget,
          exportContractorId: target.exportContractorId,
        })
        await waitForDomUpdate()
        await delay(100)

        try {
          const bulkCondition: PdfExportCondition = {
            exportTarget: target.exportTarget,
            exportContractorId: target.exportContractorId,
            exportContentType: exportContent,
          }
          const bulkFiltered = getFilteredIssues(
            numberedIssues,
            bulkCondition,
            contractors,
            selectedFloor,
            sortedDrawings,
          )
          if (bulkFiltered.length === 0) {
            skippedCount += 1
            continue
          }

          const bulkDrawingIds = new Set(
            bulkFiltered
              .map((issue) => issue.drawing_id ?? (issue as ExportIssue & { drawingId?: string }).drawingId)
              .filter(Boolean),
          )
          const bulkTargetDrawings = sortedDrawings.filter((drawing) => bulkDrawingIds.has(drawing.id))
          const bulkDrawingsWithSignedUrl = await resolveDrawingsWithSignedUrl(bulkTargetDrawings)

          if (
            includesDrawingPages(exportContent) &&
            bulkDrawingsWithSignedUrl.some((drawing) => !drawing.signed_url)
          ) {
            console.error('Drawings missing signed_url (bulk)', bulkDrawingsWithSignedUrl)
            throw new Error('図面URLを取得できませんでした')
          }

          const exported = await runPdfExport(bulkDrawingsWithSignedUrl, {
            filenameLabel: target.label,
            skipEmpty: true,
          })
          if (exported) {
            successCount += 1
          } else {
            skippedCount += 1
          }
        } catch (error) {
          console.error(`PDF export failed for ${target.label}:`, error)
          toast.error(`${target.label}のPDF出力に失敗しました`)
        }

        if (index < targets.length - 1) {
          await delay(DOWNLOAD_INTERVAL_MS)
        }
      }

      setExportRunOverride(null)
      setPhotoDetailExportData([])

      if (successCount === 0) {
        toast.error('出力対象の指摘がありません', { id: toastId })
        return
      }

      const skippedMessage =
        skippedCount > 0 ? `（${skippedCount}件は指摘なしのためスキップ）` : ''
      toast.success(`${successCount}件の業者別PDFを出力しました${skippedMessage}`, { id: toastId })
    } catch (error) {
      console.error('bulk PDF export failed', error)
      setExportError('一括PDF出力に失敗しました。')
      toast.error('一括PDF出力に失敗しました')
    } finally {
      setExportRunOverride(null)
      setPhotoDetailExportData([])
      setIsExporting(false)
    }
  }, [
    contractors,
    exportContent,
    numberedIssues,
    resolveDrawingsWithSignedUrl,
    runPdfExport,
    selectedFloor,
    sortedDrawings,
  ])

  const handleExportPdf = useCallback(async () => {
    console.log('PDF download clicked')

    try {
      setIsExporting(true)
      setExportError(null)

      const normalizedContent = normalizeExportContentType(exportContent)

      console.log('PDF export condition', {
        exportTarget: effectiveExportTarget,
        exportContractorId: effectiveContractorId,
        exportContentType: exportContent,
      })

      if (selectedExportTarget === 'contractor' && (!selectedContractorId || selectedContractorId === 'all')) {
        setExportError('出力する業者を選択してください')
        return
      }

      console.log('PDF export filtered issues', filteredIssues)

      if (filteredIssues.length === 0) {
        setExportError('選択条件に該当する指摘がありません。出力対象または業者を変更してください。')
        return
      }

      const exportTargetDrawingIds = new Set(
        filteredIssues
          .map((issue) => issue.drawing_id ?? (issue as ExportIssue & { drawingId?: string }).drawingId)
          .filter(Boolean),
      )
      const drawingsForExport = sortedDrawings.filter((drawing) => exportTargetDrawingIds.has(drawing.id))

      console.log('PDF export target drawings before signed url', drawingsForExport)

      if (normalizedContent === 'list_only') {
        console.log('PDF export mode: list only')
        targetDrawingsRef.current = []
        const exported = await runPdfExport([])
        if (!exported) {
          setExportError('選択条件に該当する指摘がありません。出力対象または業者を変更してください。')
          return
        }
        console.log('PDF export completed')
        toast.success(`${pdfExportSplit.exportContractorLabel}のPDFを出力しました`)
        return
      }

      if (normalizedContent === 'list_and_drawing') {
        console.log('PDF export mode: drawing and list')

        if (drawingsForExport.length === 0) {
          setExportError('出力対象の図面がありません。指摘と図面の紐付けを確認してください。')
          return
        }

        const drawingsWithSignedUrl = await resolveDrawingsWithSignedUrl(drawingsForExport)
        console.log('PDF export drawings with signed url', drawingsWithSignedUrl)

        const invalidDrawings = drawingsWithSignedUrl.filter((drawing) => !drawing.signed_url)
        if (invalidDrawings.length > 0) {
          console.error('Drawings missing signed_url', invalidDrawings)
          setExportError('図面URLを取得できませんでした。再度読み込み直してからPDF出力してください。')
          return
        }

        targetDrawingsRef.current = drawingsWithSignedUrl

        const exported = await runPdfExport(drawingsWithSignedUrl)
        if (!exported) {
          setExportError('選択条件に該当する指摘がありません。出力対象または業者を変更してください。')
          return
        }

        console.log('PDF export completed')
        toast.success(`${pdfExportSplit.exportContractorLabel}のPDFを出力しました`)
        return
      }

      setExportError('不明な出力形式です。出力内容を選び直してください。')
    } catch (error) {
      console.error('PDF export failed', error)
      const message =
        error instanceof Error && error.message.includes('図面URL')
          ? '図面URLを取得できませんでした。再度読み込み直してからPDF出力してください。'
          : 'PDF出力に失敗しました。図面データまたは描画処理を確認してください。'
      setExportError(message)
      toast.error(message)
    } finally {
      setPhotoDetailExportData([])
      setIsExporting(false)
    }
  }, [
    effectiveContractorId,
    effectiveExportTarget,
    exportContent,
    filteredIssues,
    pdfExportSplit.exportContractorLabel,
    resolveDrawingsWithSignedUrl,
    runPdfExport,
    selectedContractorId,
    selectedExportTarget,
    sortedDrawings,
  ])

  useEffect(() => {
    if (loading || bulkExportStartedRef.current) return
    if (searchParams.get('bulk') !== '1') return
    if (contractors.length === 0) return

    bulkExportStartedRef.current = true
    void handleBulkExport()
  }, [loading, contractors.length, handleBulkExport, searchParams])

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
              <h1 className="text-lg font-bold text-slate-900 md:text-xl">PDF出力</h1>
              <p className="mt-1 text-sm text-slate-600">{project.name}</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {exportError ? <p className="text-sm text-red-600">{exportError}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 bg-white px-3 md:h-11 md:px-4"
                disabled={isExporting || contractors.length === 0}
                onClick={() => void handleBulkExport()}
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">全業者一括出力</span>
                <span className="sm:hidden">一括出力</span>
              </Button>
              <Button
                type="button"
                className="h-10 gap-2 bg-blue-600 px-3 hover:bg-blue-700 md:h-11 md:px-4"
                disabled={isExporting}
                onClick={handleExportPdf}
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'PDF生成中...' : 'PDFをダウンロード'}
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
                        <RadioGroupItem value="list" id="pdf-list-only" />
                        <Label htmlFor="pdf-list-only" className="text-sm">
                          指摘一覧のみ
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="drawing_and_list" id="pdf-drawing-and-list" />
                        <Label htmlFor="pdf-drawing-and-list" className="text-sm">
                          図面＋指摘一覧
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {exportError ? (
                    <p className="text-red-600 text-sm mt-2">{exportError}</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">出力条件</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-slate-500">出力対象</dt>
                      <dd className="font-medium text-slate-900">
                        {exportTargetLabel(effectiveExportTarget)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">対象業者</dt>
                      <dd className="font-medium text-slate-900">
                        {hasContractors ? pdfExportSplit.exportContractorLabel : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">出力内容</dt>
                      <dd className="font-medium text-slate-900">{exportContentLabel(exportContent)}</dd>
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
              targetDrawings={
                showDrawingPreview && previewDrawings.length > 0 ? previewDrawings : targetDrawings
              }
              filteredIssues={filteredIssues}
              getDrawingIssues={getDrawingIssues}
              contractors={contractors}
            />

            {loadingPreviewDrawings && showDrawingPreview && targetDrawings.length > 0 ? (
              <p className="text-center text-sm text-slate-500">図面URLを読み込み中...</p>
            ) : null}

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
