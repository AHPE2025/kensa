'use client'

import { useState, useMemo } from 'react'
import {
  ArrowLeft,
  Download,
  FileText,
  Printer,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useApp } from '@/lib/app-store'
import { CONTRACTORS } from '@/lib/mock-data'
import { toast } from 'sonner'

interface PdfExportPageProps {
  projectId: string
}

export function PdfExportPage({ projectId }: PdfExportPageProps) {
  const { projects, navigate } = useApp()
  const project = projects.find((p) => p.id === projectId)

  const [selectedContractorId, setSelectedContractorId] = useState('all')
  const [selectedFloor, setSelectedFloor] = useState('all')
  const [exportContent, setExportContent] = useState('list-and-drawing')

  const allIssues = useMemo(() => {
    if (!project) return []
    return project.drawings.flatMap((d) => d.issues)
  }, [project])

  const filteredIssues = useMemo(() => {
    return allIssues.filter((issue) => {
      if (selectedContractorId !== 'all' && issue.contractorId !== selectedContractorId) return false
      if (selectedFloor !== 'all' && issue.floor !== selectedFloor) return false
      return true
    })
  }, [allIssues, selectedContractorId, selectedFloor])

  const selectedContractor =
    selectedContractorId === 'all'
      ? null
      : CONTRACTORS.find((c) => c.id === selectedContractorId)

  if (!project) return null

  const floors = [...new Set(project.drawings.map((d) => d.floor))]

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ type: 'project-detail', projectId })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-foreground">PDF出力</h1>
          <p className="text-xs text-muted-foreground">{project.name}</p>
        </div>
        <Button
          variant="outline"
          className="h-10 gap-2"
          onClick={() => {
            toast.success('全業者一括PDF出力を開始しました')
          }}
        >
          <Printer className="h-4 w-4" />
          全業者一括出力
        </Button>
        <Button
          className="h-10 gap-2"
          onClick={() => {
            toast.success('PDFを出力しました')
          }}
        >
          <Download className="h-4 w-4" />
          PDF出力
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Settings panel */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card lg:w-80">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">出力設定</h2>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-6 p-4">
              {/* Contractor selection */}
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">業者選択</Label>
                <Select
                  value={selectedContractorId}
                  onValueChange={setSelectedContractorId}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="業者を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全業者</SelectItem>
                    {CONTRACTORS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          {c.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Floor selection */}
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">階選択</Label>
                <Select value={selectedFloor} onValueChange={setSelectedFloor}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全階</SelectItem>
                    {floors.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Export content */}
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">出力内容</Label>
                <RadioGroup value={exportContent} onValueChange={setExportContent}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="list-and-drawing" id="pdf-list-and-drawing" />
                    <Label htmlFor="pdf-list-and-drawing" className="text-sm">
                      一覧＋図面
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="drawing-only" id="pdf-drawing-only" />
                    <Label htmlFor="pdf-drawing-only" className="text-sm">
                      図面のみ
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Separator />

              {/* Summary */}
              <Card className="bg-accent/50">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">対象業者</span>
                      <span className="font-medium text-foreground">
                        {selectedContractor?.name ?? '全業者'}
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
                      <span className="font-bold text-foreground">{filteredIssues.length}件</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </aside>

        {/* Preview area */}
        <div className="flex-1 overflow-auto bg-muted/30 p-6">
          <div className="mx-auto max-w-4xl">
            {/* PDF Preview */}
            <Card className="shadow-lg">
              <CardContent className="p-8">
                {/* Header */}
                <div className="mb-6 border-b-2 border-foreground pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">検査指摘一覧表</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{project.name}</p>
                      <p className="text-sm text-muted-foreground">{project.address}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        検査日: {project.inspectionDate}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        出力日: {new Date().toISOString().split('T')[0]}
                      </p>
                      {selectedContractor && (
                        <Badge
                          className="mt-2 text-card"
                          style={{ backgroundColor: selectedContractor.color }}
                        >
                          {selectedContractor.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Issue table */}
                {filteredIssues.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">No.</TableHead>
                        <TableHead className="w-14">階</TableHead>
                        <TableHead className="w-16">区分</TableHead>
                        <TableHead>指摘内容</TableHead>
                        <TableHead className="w-36">担当業者</TableHead>
                        <TableHead className="w-16 text-center">状態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredIssues.map((issue) => (
                        <TableRow key={issue.id}>
                          <TableCell className="font-mono text-sm">{issue.number}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {issue.floor}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{issue.category}</TableCell>
                          <TableCell className="text-sm">{issue.content}</TableCell>
                          <TableCell className="text-sm">{issue.contractorName}</TableCell>
                          <TableCell className="text-center">
                            {issue.resolved ? (
                              <CheckCircle2 className="mx-auto h-4 w-4 text-green-600" />
                            ) : (
                              <AlertCircle className="mx-auto h-4 w-4 text-destructive" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center py-16 text-muted-foreground">
                    <FileText className="mb-3 h-10 w-10" />
                    <p className="text-sm">該当する指摘がありません</p>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-8 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span>合計: {filteredIssues.length}件</span>
                  <span>
                    未対応: {filteredIssues.filter((i) => !i.resolved).length}件 / 対応済:{' '}
                    {filteredIssues.filter((i) => i.resolved).length}件
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Drawing preview placeholder */}
            {exportContent === 'list-and-drawing' && filteredIssues.length > 0 && (
              <Card className="mt-6 shadow-lg">
                <CardContent className="flex items-center justify-center p-16">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <FileText className="h-12 w-12" />
                    <p className="text-sm font-medium">図面プレビュー</p>
                    <p className="text-xs">
                      指摘ピン付き図面がここに表示されます
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
