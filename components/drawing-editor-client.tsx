'use client'

import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, Filter, MapPin, Move, Pencil, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { authedFetch } from '@/lib/authed-fetch'
import { useEditorStore } from '@/lib/stores/editor-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import { ISSUE_TYPES, type Contractor, type Drawing, type Issue } from '@/lib/domain'
import { toast } from 'sonner'

type DrawingRow = Drawing & {
  signed_url: string | null
  issue_count: number
  file_name: string
  signed_page_urls?: Array<string | null>
}

type IssueForm = {
  floor_label: string
  issue_type: string
  issue_text: string
  contractor_id: string
}

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
  const contractorFilter = useEditorStore((s) => s.contractorFilter)
  const searchText = useEditorStore((s) => s.searchText)
  const setIssues = useEditorStore((s) => s.setIssues)
  const setMode = useEditorStore((s) => s.setMode)
  const setZoom = useEditorStore((s) => s.setZoom)
  const setPan = useEditorStore((s) => s.setPan)
  const setContractorFilter = useEditorStore((s) => s.setContractorFilter)
  const setSearchText = useEditorStore((s) => s.setSearchText)

  const [drawings, setDrawings] = useState<DrawingRow[]>([])
  const [currentDrawing, setCurrentDrawing] = useState<DrawingRow | null>(null)
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [imageError, setImageError] = useState<string | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [addingPin, setAddingPin] = useState<{ x: number; y: number } | null>(null)
  const [issueModalOpen, setIssueModalOpen] = useState(false)
  const [saveAndContinue, setSaveAndContinue] = useState(false)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [form, setForm] = useState<IssueForm>({
    floor_label: '',
    issue_type: ISSUE_TYPES[0],
    issue_text: '',
    contractor_id: '',
  })

  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!loadingAuth && !user) router.replace('/login')
  }, [loadingAuth, user, router])

  const loadData = async () => {
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
    setContractors(contractorData.contractors ?? [])
    setIssues(issueData.issues ?? [])
    setPageIndex(0)
    if (drawing) {
      setForm((prev) => ({ ...prev, floor_label: drawing.floor_label }))
    }
    if (!form.contractor_id && contractorData.contractors?.length) {
      setForm((prev) => ({ ...prev, contractor_id: contractorData.contractors![0].id }))
    }
  }

  useEffect(() => {
    if (user) void loadData()
  }, [user, drawingId, projectId])

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [drawingId, setZoom, setPan])

  useEffect(() => {
    if (!currentDrawing) return
    const totalPages = Math.max(pdfPageCount, currentDrawing.page_count ?? 0, 1)
    if (pageIndex < totalPages) return
    setPageIndex(Math.max(totalPages - 1, 0))
  }, [currentDrawing, pageIndex, pdfPageCount])

  const filteredIssues = useMemo(() => {
    const key = searchText.trim().toLowerCase()
    return issues.filter((issue) => {
      if (issue.page_index !== pageIndex) return false
      if (contractorFilter !== 'all' && issue.contractor_id !== contractorFilter) return false
      if (!key) return true
      const contractorName = issue.contractor?.name ?? ''
      return `${issue.issue_text}${issue.issue_type}${contractorName}`.toLowerCase().includes(key)
    })
  }, [issues, contractorFilter, searchText, pageIndex])

  const numberedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
    return sorted.map((issue, index) => ({ ...issue, no: index + 1 }))
  }, [issues])

  const pageIssues = filteredIssues.map((issue) => ({
    ...issue,
    no: numberedIssues.find((x) => x.id === issue.id)?.no ?? 0,
  }))

  const onSaveIssue = async (event: FormEvent) => {
    event.preventDefault()
    if (!addingPin) return
    const payload = {
      page_index: pageIndex,
      floor_label: form.floor_label,
      issue_type: form.issue_type,
      issue_text: form.issue_text,
      contractor_id: form.contractor_id,
      x_ratio: addingPin.x,
      y_ratio: addingPin.y,
      callout_x_ratio: Math.min(addingPin.x + 0.08, 0.92),
      callout_y_ratio: Math.max(addingPin.y - 0.06, 0.08),
    }

    const response = await authedFetch(`/api/drawings/${drawingId}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await response.json()) as { issue?: Issue; error?: string }
    if (!response.ok || !data.issue) {
      toast.error(data.error ?? '保存失敗')
      return
    }
    setIssues([...issues, data.issue])
    setForm((prev) => ({ ...prev, issue_text: '' }))
    setAddingPin(null)
    setIssueModalOpen(false)
    toast.success('指摘を保存しました')
    if (saveAndContinue) {
      setMode('add')
    }
  }

  const deleteIssue = async () => {
    if (!selectedIssueId) return
    const response = await authedFetch(`/api/issues/${selectedIssueId}`, { method: 'DELETE' })
    const data = (await response.json()) as { error?: string }
    if (!response.ok) return toast.error(data.error ?? '削除失敗')
    setIssues(issues.filter((issue) => issue.id !== selectedIssueId))
    setSelectedIssueId(null)
  }

  const jumpToIssue = (issue: Issue) => {
    setSelectedIssueId(issue.id)
    console.log('issue selected:', issue.id)
  }

  const issueContractorName = (issue: Issue) => issue.contractor?.name ?? contractors.find((c) => c.id === issue.contractor_id)?.name ?? ''
  const pdfUrl = currentDrawing?.signed_url ?? null
  const totalPages = Math.max(pdfPageCount, currentDrawing?.page_count ?? 0, 1)

  const handleDrawingClick = (event: MouseEvent<HTMLDivElement>) => {
    if (mode !== 'add') return
    const rect = event.currentTarget.getBoundingClientRect()
    const xRatio = (event.clientX - rect.left) / rect.width
    const yRatio = (event.clientY - rect.top) / rect.height
    if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) return
    setAddingPin({ x: xRatio, y: yRatio })
    setIssueModalOpen(true)
  }

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      <header className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2">
        <Button variant="outline" size="icon" onClick={() => router.push(`/projects/${projectId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <select
          className="h-10 rounded-md border px-3"
          value={currentDrawing?.id ?? ''}
          onChange={(event) => router.push(`/projects/${projectId}/drawings/${event.target.value}`)}
        >
          {drawings.map((drawing) => (
            <option key={drawing.id} value={drawing.id}>
              {drawing.floor_label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 rounded-md border p-1">
          <Button size="sm" variant={mode === 'move' ? 'default' : 'ghost'} onClick={() => setMode('move')}>
            <Move className="mr-1 h-4 w-4" />
            移動
          </Button>
          <Button size="sm" variant={mode === 'add' ? 'default' : 'ghost'} onClick={() => setMode('add')}>
            <MapPin className="mr-1 h-4 w-4" />
            追加
          </Button>
          <Button size="sm" variant={mode === 'edit' ? 'default' : 'ghost'} onClick={() => setMode('edit')}>
            <Pencil className="mr-1 h-4 w-4" />
            編集
          </Button>
        </div>
        <Button variant="outline" size="icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => setZoom(Math.min(2.5, zoom + 0.1))}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            disabled={pageIndex <= 0}
            onClick={() => setPageIndex((v) => Math.max(v - 1, 0))}
          >
            前ページ
          </Button>
          <span className="text-sm">
            {pageIndex + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={!currentDrawing || pageIndex >= totalPages - 1}
            onClick={() =>
              setPageIndex((v) => Math.min(v + 1, totalPages - 1))
            }
          >
            次ページ
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 border-r bg-white p-3">
          <div className="space-y-2">
            <Label>業者フィルタ</Label>
            <select
              className="h-10 w-full rounded-md border px-3"
              value={contractorFilter}
              onChange={(event) => setContractorFilter(event.target.value)}
            >
              <option value="all">全業者</option>
              {contractors.map((contractor) => (
                <option key={contractor.id} value={contractor.id}>
                  {contractor.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 space-y-2">
            <Label>検索</Label>
            <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} />
          </div>
          <div className="mt-3">
            <h3 className="mb-2 text-sm font-semibold">指摘一覧</h3>
            <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-auto">
              {pageIssues.map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => jumpToIssue(issue)}
                  className={`w-full rounded-md border p-2 text-left text-sm ${selectedIssueId === issue.id ? 'border-blue-500 bg-blue-50' : ''}`}
                >
                  <div className="font-medium">
                    No.{issue.no} {issue.issue_type}
                  </div>
                  <div className="truncate text-muted-foreground">{issue.issue_text}</div>
                  <div className="text-xs text-muted-foreground">{issueContractorName(issue)}</div>
                </button>
              ))}
              {pageIssues.length === 0 ? <p className="text-sm text-muted-foreground">指摘がありません</p> : null}
            </div>
          </div>
        </aside>

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
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                  onClick={handleDrawingClick}
                >
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
                    <Page pageNumber={Math.min(pageIndex + 1, totalPages)} width={1100} />
                  </Document>
                  <div className="pointer-events-none absolute inset-0">
                    {pageIssues.map((issue) => (
                      <button
                        key={issue.id}
                        type="button"
                        className={`pointer-events-auto absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white text-xs font-bold text-white ${
                          selectedIssueId === issue.id ? 'bg-red-600 ring-2 ring-red-300' : 'bg-blue-600'
                        }`}
                        style={{ left: `${issue.pin_x * 100}%`, top: `${issue.pin_y * 100}%` }}
                        onClick={(event) => {
                          event.stopPropagation()
                          jumpToIssue(issue)
                        }}
                      >
                        {issue.no}
                      </button>
                    ))}
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
            <Button variant="secondary" className="h-12" onClick={() => router.push(`/projects/${projectId}`)}>
              <Filter className="mr-2 h-5 w-5" />
              業者フィルタ
            </Button>
            <Button className="h-12 bg-blue-600 hover:bg-blue-700" onClick={() => router.push(`/projects/${projectId}`)}>
              <Download className="mr-2 h-5 w-5" />
              PDF出力
            </Button>
            <Button variant="destructive" className="h-12" onClick={deleteIssue} disabled={!selectedIssueId}>
              <Trash2 className="mr-2 h-5 w-5" />
              選択削除
            </Button>
          </div>
        </section>
      </div>

      <Dialog open={issueModalOpen} onOpenChange={setIssueModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>指摘入力</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSaveIssue}>
            <div className="space-y-1">
              <Label>階数</Label>
              <Input
                required
                value={form.floor_label}
                onChange={(event) => setForm((prev) => ({ ...prev, floor_label: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>指摘区分</Label>
              <select
                className="h-10 w-full rounded-md border px-3"
                value={form.issue_type}
                onChange={(event) => setForm((prev) => ({ ...prev, issue_type: event.target.value }))}
              >
                {ISSUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>指摘内容</Label>
              <Input
                required
                value={form.issue_text}
                onChange={(event) => setForm((prev) => ({ ...prev, issue_text: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>担当業者</Label>
              <Input
                placeholder="業者名で検索"
                onChange={(event) => {
                  const key = event.target.value.toLowerCase()
                  const found = contractors.find((contractor) => contractor.name.toLowerCase().includes(key))
                  if (found) setForm((prev) => ({ ...prev, contractor_id: found.id }))
                }}
              />
              <select
                className="h-10 w-full rounded-md border px-3"
                value={form.contractor_id}
                onChange={(event) => setForm((prev) => ({ ...prev, contractor_id: event.target.value }))}
              >
                {contractors.map((contractor) => (
                  <option key={contractor.id} value={contractor.id}>
                    {contractor.name}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIssueModalOpen(false)
                  setAddingPin(null)
                }}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                variant="secondary"
                onClick={() => setSaveAndContinue(false)}
              >
                保存
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setSaveAndContinue(true)}
              >
                保存して次を追加
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}
