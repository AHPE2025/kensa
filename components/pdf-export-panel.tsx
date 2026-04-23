'use client'

import { Download, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Contractor } from '@/lib/domain'

type PdfExportPanelProps = {
  contractors: Contractor[]
  floors: string[]
  contractorScope: 'all' | 'specific'
  floorScope: 'all' | 'selected'
  exportContent: 'list-and-drawing' | 'drawing-only'
  selectedContractorIds: string[]
  selectedFloors: string[]
  onChangeContractorScope: (value: 'all' | 'specific') => void
  onChangeFloorScope: (value: 'all' | 'selected') => void
  onChangeExportContent: (value: 'list-and-drawing' | 'drawing-only') => void
  onToggleContractor: (id: string) => void
  onToggleFloor: (floor: string) => void
  onPreview: () => void
  onExport: () => void
}

export function PdfExportPanel({
  contractors,
  floors,
  contractorScope,
  floorScope,
  exportContent,
  selectedContractorIds,
  selectedFloors,
  onChangeContractorScope,
  onChangeFloorScope,
  onChangeExportContent,
  onToggleContractor,
  onToggleFloor,
  onPreview,
  onExport,
}: PdfExportPanelProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PDF出力設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="font-medium">出力対象業者</Label>
            <RadioGroup value={contractorScope} onValueChange={(value) => onChangeContractorScope(value as 'all' | 'specific')}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="contractors-all" />
                <Label htmlFor="contractors-all">全業者</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="specific" id="contractors-specific" />
                <Label htmlFor="contractors-specific">特定業者</Label>
              </div>
            </RadioGroup>
            {contractorScope === 'specific' ? (
              <ScrollArea className="h-28 rounded-md border p-2">
                <div className="space-y-2">
                  {contractors.map((contractor) => (
                    <div key={contractor.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`contractor-${contractor.id}`}
                        checked={selectedContractorIds.includes(contractor.id)}
                        onCheckedChange={() => onToggleContractor(contractor.id)}
                      />
                      <Label htmlFor={`contractor-${contractor.id}`} className="cursor-pointer text-sm">
                        {contractor.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label className="font-medium">出力範囲</Label>
            <RadioGroup value={floorScope} onValueChange={(value) => onChangeFloorScope(value as 'all' | 'selected')}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="floors-all" />
                <Label htmlFor="floors-all">全階</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="selected" id="floors-selected" />
                <Label htmlFor="floors-selected">選択階</Label>
              </div>
            </RadioGroup>
            {floorScope === 'selected' ? (
              <div className="flex flex-wrap gap-2">
                {floors.map((floor) => (
                  <Button
                    key={floor}
                    size="sm"
                    variant={selectedFloors.includes(floor) ? 'default' : 'outline'}
                    onClick={() => onToggleFloor(floor)}
                  >
                    {floor}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label className="font-medium">出力内容</Label>
            <RadioGroup
              value={exportContent}
              onValueChange={(value) => onChangeExportContent(value as 'list-and-drawing' | 'drawing-only')}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="list-and-drawing" id="content-list" />
                <Label htmlFor="content-list">一覧＋図面</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="drawing-only" id="content-drawing" />
                <Label htmlFor="content-drawing">図面のみ</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11" onClick={onPreview}>
              <Eye className="mr-2 h-4 w-4" />
              PDFプレビュー
            </Button>
            <Button className="h-11 bg-blue-600 hover:bg-blue-700" onClick={onExport}>
              <Download className="mr-2 h-4 w-4" />
              PDF出力
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[360px]">
        <CardHeader>
          <CardTitle className="text-base">PDFプレビュー</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[320px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          ここにPDFプレビューを表示
        </CardContent>
      </Card>
    </div>
  )
}
