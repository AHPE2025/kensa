'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Upload,
  Plus,
  Pencil,
  Trash2,
  FileText,
  Users,
  Download,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useApp } from '@/lib/app-store'
import { CONTRACTORS } from '@/lib/mock-data'

interface ProjectDetailPageProps {
  projectId: string
}

export function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const { projects, navigate } = useApp()
  const project = projects.find((p) => p.id === projectId)

  if (!project) return null

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ type: 'projects' })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">{project.name}</h1>
            <p className="text-xs text-muted-foreground">{project.address}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              指摘 {project.totalIssues}件
            </Badge>
            {project.unresolvedIssues > 0 && (
              <Badge variant="destructive" className="text-xs">
                未対応 {project.unresolvedIssues}件
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
        <Tabs defaultValue="drawings">
          <TabsList className="mb-6 h-11">
            <TabsTrigger value="drawings" className="gap-2 px-4">
              <FileText className="h-4 w-4" />
              図面
            </TabsTrigger>
            <TabsTrigger value="contractors" className="gap-2 px-4">
              <Users className="h-4 w-4" />
              業者
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2 px-4">
              <Download className="h-4 w-4" />
              出力
            </TabsTrigger>
          </TabsList>

          {/* Drawings Tab */}
          <TabsContent value="drawings">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">図面一覧</h2>
              <Button className="h-11">
                <Upload className="mr-2 h-4 w-4" />
                図面アップロード
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">階</TableHead>
                      <TableHead>ファイル名</TableHead>
                      <TableHead className="w-28 text-center">指摘数</TableHead>
                      <TableHead className="w-32">更新日</TableHead>
                      <TableHead className="w-24 text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.drawings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                          図面がまだアップロードされていません
                        </TableCell>
                      </TableRow>
                    ) : (
                      project.drawings.map((drawing) => (
                        <TableRow key={drawing.id}>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">
                              {drawing.floor}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{drawing.fileName}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={drawing.issueCount > 0 ? 'default' : 'secondary'}>
                              {drawing.issueCount}件
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {drawing.updatedAt}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              onClick={() =>
                                navigate({
                                  type: 'drawing-editor',
                                  projectId: project.id,
                                  drawingId: drawing.id,
                                })
                              }
                            >
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />
                              編集
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contractors Tab */}
          <TabsContent value="contractors">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">業者一覧</h2>
              <Button className="h-11">
                <Plus className="mr-2 h-4 w-4" />
                業者追加
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>業者名</TableHead>
                      <TableHead className="w-32">担当区分</TableHead>
                      <TableHead className="w-40">連絡先</TableHead>
                      <TableHead className="w-32 text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CONTRACTORS.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: c.color }}
                            />
                            <span className="font-medium">{c.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{c.category}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {c.contact}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Export Tab */}
          <TabsContent value="export">
            <ExportPanel projectId={projectId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

function ExportPanel({ projectId }: { projectId: string }) {
  const { projects, navigate } = useApp()
  const project = projects.find((p) => p.id === projectId)
  const [contractorScope, setContractorScope] = useState('all')
  const [floorScope, setFloorScope] = useState('all')
  const [exportContent, setExportContent] = useState('list-and-drawing')
  const [selectedContractors, setSelectedContractors] = useState<string[]>([])

  if (!project) return null

  const toggleContractor = (id: string) => {
    setSelectedContractors((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PDF出力設定</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Contractor Scope */}
          <div className="flex flex-col gap-3">
            <Label className="font-medium">出力対象業者</Label>
            <RadioGroup value={contractorScope} onValueChange={setContractorScope}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="all-contractors" />
                <Label htmlFor="all-contractors">全業者</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="specific" id="specific-contractors" />
                <Label htmlFor="specific-contractors">特定業者</Label>
              </div>
            </RadioGroup>
            {contractorScope === 'specific' && (
              <div className="ml-6 flex flex-col gap-2">
                {CONTRACTORS.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`export-${c.id}`}
                      checked={selectedContractors.includes(c.id)}
                      onCheckedChange={() => toggleContractor(c.id)}
                    />
                    <Label htmlFor={`export-${c.id}`} className="text-sm">
                      {c.name}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Floor Scope */}
          <div className="flex flex-col gap-3">
            <Label className="font-medium">出力範囲</Label>
            <RadioGroup value={floorScope} onValueChange={setFloorScope}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="all-floors" />
                <Label htmlFor="all-floors">全階</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="selected" id="selected-floors" />
                <Label htmlFor="selected-floors">選択階</Label>
              </div>
            </RadioGroup>
            {floorScope === 'selected' && (
              <div className="ml-6">
                <Select>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="階を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {project.drawings.map((d) => (
                      <SelectItem key={d.id} value={d.floor}>
                        {d.floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Export Content */}
          <div className="flex flex-col gap-3">
            <Label className="font-medium">出力内容</Label>
            <RadioGroup value={exportContent} onValueChange={setExportContent}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="list-and-drawing" id="list-and-drawing" />
                <Label htmlFor="list-and-drawing">一覧＋図面</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="drawing-only" id="drawing-only" />
                <Label htmlFor="drawing-only">図面のみ</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="h-11 flex-1"
              onClick={() => navigate({ type: 'pdf-export', projectId })}
            >
              PDFプレビュー
            </Button>
            <Button className="h-11 flex-1">
              <Download className="mr-2 h-4 w-4" />
              PDF出力
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview placeholder */}
      <Card className="flex items-center justify-center">
        <CardContent className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Building2 className="h-12 w-12" />
          <p className="text-sm">設定を選択してプレビューを表示</p>
        </CardContent>
      </Card>
    </div>
  )
}
