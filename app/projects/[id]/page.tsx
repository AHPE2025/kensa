'use client'

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, FileUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { authedFetch } from '@/lib/authed-fetch'
import { useAuthStore } from '@/lib/stores/auth-store'
import type { Contractor, Drawing, Project } from '@/lib/domain'
import { toast } from 'sonner'

type DrawingRow = Drawing & { issue_count: number; file_name: string; signed_url: string | null }

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const loadingAuth = useAuthStore((s) => s.loading)

  const [project, setProject] = useState<Project | null>(null)
  const [drawings, setDrawings] = useState<DrawingRow[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [floorLabel, setFloorLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [contractorDialog, setContractorDialog] = useState(false)
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null)
  const [contractorForm, setContractorForm] = useState({ name: '', category: '', phone: '' })
  const [exportContractorId, setExportContractorId] = useState('')
  const [exportFloors, setExportFloors] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const [exportUrl, setExportUrl] = useState('')

  const floors = useMemo(() => [...new Set(drawings.map((d) => d.floor_label))], [drawings])

  useEffect(() => {
    if (!loadingAuth && !user) router.replace('/login')
  }, [loadingAuth, user, router])

  const loadAll = async () => {
    const [projectRes, drawingRes, contractorRes] = await Promise.all([
      authedFetch(`/api/projects/${projectId}`),
      authedFetch(`/api/projects/${projectId}/drawings`),
      authedFetch(`/api/projects/${projectId}/contractors`),
    ])

    const projectData = (await projectRes.json()) as { project?: Project; error?: string }
    const drawingData = (await drawingRes.json()) as { drawings?: DrawingRow[]; error?: string }
    const contractorData = (await contractorRes.json()) as { contractors?: Contractor[]; error?: string }

    if (!projectRes.ok) return toast.error(projectData.error ?? '案件取得失敗')
    if (!drawingRes.ok) return toast.error(drawingData.error ?? '図面取得失敗')
    if (!contractorRes.ok) return toast.error(contractorData.error ?? '業者取得失敗')

    setProject(projectData.project ?? null)
    setDrawings(drawingData.drawings ?? [])
    setContractors(contractorData.contractors ?? [])
    setExportContractorId((prev) => prev || contractorData.contractors?.[0]?.id || '')
  }

  useEffect(() => {
    if (user) void loadAll()
  }, [user, projectId])

  const getPdfPageCount = async (target: File) => {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    const bytes = await target.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: bytes }).promise
    return doc.numPages
  }

  const onUpload = async (event: FormEvent) => {
    event.preventDefault()
    if (!file || !floorLabel.trim()) return
    setUploading(true)

    const pageCount = await getPdfPageCount(file)
    const form = new FormData()
    form.set('floorLabel', floorLabel.trim())
    form.set('pageCount', String(pageCount))
    form.set('file', file)

    const response = await authedFetch(`/api/projects/${projectId}/drawings`, {
      method: 'POST',
      body: form,
    })
    const data = (await response.json()) as { error?: string }
    if (!response.ok) {
      toast.error(data.error ?? 'アップロード失敗')
      setUploading(false)
      return
    }
    toast.success('図面をアップロードしました')
    setFloorLabel('')
    setFile(null)
    setUploading(false)
    await loadAll()
  }

  const onOpenContractorDialog = (contractor?: Contractor) => {
    if (contractor) {
      setEditingContractor(contractor)
      setContractorForm({
        name: contractor.name,
        category: contractor.category ?? '',
        phone: contractor.phone ?? '',
      })
    } else {
      setEditingContractor(null)
      setContractorForm({ name: '', category: '', phone: '' })
    }
    setContractorDialog(true)
  }

  const onSaveContractor = async (event: FormEvent) => {
    event.preventDefault()
    const url = editingContractor
      ? `/api/contractors/${editingContractor.id}`
      : `/api/projects/${projectId}/contractors`
    const method = editingContractor ? 'PATCH' : 'POST'
    const response = await authedFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contractorForm),
    })
    const data = (await response.json()) as { error?: string }
    if (!response.ok) {
      toast.error(data.error ?? '業者保存失敗')
      return
    }
    toast.success('業者を保存しました')
    setContractorDialog(false)
    await loadAll()
  }

  const onDeleteContractor = async (contractorId: string) => {
    const response = await authedFetch(`/api/contractors/${contractorId}`, { method: 'DELETE' })
    const data = (await response.json()) as { error?: string }
    if (!response.ok) return toast.error(data.error ?? '削除失敗')
    toast.success('業者を削除しました')
    await loadAll()
  }

  const onToggleFloor = (floor: string) => {
    setExportFloors((prev) => (prev.includes(floor) ? prev.filter((f) => f !== floor) : [...prev, floor]))
  }

  const onExport = async () => {
    if (!exportContractorId) {
      toast.error('業者を選択してください')
      return
    }
    setExporting(true)
    const response = await authedFetch('/api/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        vendorId: exportContractorId,
        floors: exportFloors.length ? exportFloors : undefined,
      }),
    })
    const data = (await response.json()) as { error?: string; url?: string }
    if (!response.ok) {
      toast.error(data.error ?? 'PDF出力失敗')
      setExporting(false)
      return
    }
    setExportUrl(data.url ?? '')
    toast.success('PDFを生成しました')
    setExporting(false)
  }

  if (!project) {
    return <main className="p-6 text-sm text-muted-foreground">読み込み中...</main>
  }

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => router.push('/projects')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">{project.address}</p>
          </div>
        </div>
      </header>

      <Tabs defaultValue="drawings">
        <TabsList>
          <TabsTrigger value="drawings">図面</TabsTrigger>
          <TabsTrigger value="contractors">業者</TabsTrigger>
          <TabsTrigger value="exports">出力</TabsTrigger>
        </TabsList>

        <TabsContent value="drawings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>図面アップロード</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-4" onSubmit={onUpload}>
                <div className="space-y-1">
                  <Label>階表示</Label>
                  <Input value={floorLabel} onChange={(event) => setFloorLabel(event.target.value)} required />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>PDF</Label>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                    required
                  />
                </div>
                <Button className="mt-6 h-11 bg-blue-600 hover:bg-blue-700" disabled={uploading}>
                  <FileUp className="mr-2 h-4 w-4" />
                  {uploading ? 'アップロード中...' : 'アップロード'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>図面一覧</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>階</TableHead>
                    <TableHead>ファイル名</TableHead>
                    <TableHead>ページ数</TableHead>
                    <TableHead>指摘数</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drawings.map((drawing) => (
                    <TableRow key={drawing.id}>
                      <TableCell>{drawing.floor_label}</TableCell>
                      <TableCell>{drawing.file_name}</TableCell>
                      <TableCell>{drawing.page_count}</TableCell>
                      <TableCell>{drawing.issue_count}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/projects/${projectId}/drawings/${drawing.id}`}>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            編集
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contractors" className="space-y-4">
          <div className="flex justify-end">
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => onOpenContractorDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              業者追加
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>業者名</TableHead>
                    <TableHead>区分</TableHead>
                    <TableHead>電話</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractors.map((contractor) => (
                    <TableRow key={contractor.id}>
                      <TableCell>{contractor.name}</TableCell>
                      <TableCell>{contractor.category ?? '-'}</TableCell>
                      <TableCell>{contractor.phone ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => onOpenContractorDialog(contractor)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => onDeleteContractor(contractor.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exports">
          <Card>
            <CardHeader>
              <CardTitle>業者別PDF出力</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>業者選択</Label>
                  <select
                    className="h-11 w-full rounded-md border px-3"
                    value={exportContractorId}
                    onChange={(event) => setExportContractorId(event.target.value)}
                  >
                    {contractors.map((contractor) => (
                      <option key={contractor.id} value={contractor.id}>
                        {contractor.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>階選択</Label>
                  <div className="flex flex-wrap gap-2">
                    {floors.map((floor) => (
                      <Button
                        key={floor}
                        variant={exportFloors.includes(floor) ? 'default' : 'outline'}
                        onClick={() => onToggleFloor(floor)}
                        className="h-9"
                      >
                        {floor}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <Button className="h-12 bg-blue-600 hover:bg-blue-700" onClick={onExport} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? '生成中...' : 'PDF出力'}
              </Button>
              {exportUrl ? (
                <a href={exportUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
                  生成済みPDFをダウンロード
                </a>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={contractorDialog} onOpenChange={setContractorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingContractor ? '業者編集' : '業者追加'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSaveContractor}>
            <div className="space-y-2">
              <Label>業者名</Label>
              <Input
                required
                value={contractorForm.name}
                onChange={(event) => setContractorForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>区分</Label>
              <Input
                value={contractorForm.category}
                onChange={(event) => setContractorForm((prev) => ({ ...prev, category: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>電話</Label>
              <Input
                value={contractorForm.phone}
                onChange={(event) => setContractorForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button className="bg-blue-600 hover:bg-blue-700">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}
