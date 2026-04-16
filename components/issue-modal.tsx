'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ISSUE_CATEGORIES, FLOORS, type IssueCategory } from '@/lib/types'
import { CONTRACTORS } from '@/lib/mock-data'
import { Search } from 'lucide-react'

interface IssueModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: {
    floor: string
    category: IssueCategory
    content: string
    contractorId: string
  }) => void
  onSaveAndNext: (data: {
    floor: string
    category: IssueCategory
    content: string
    contractorId: string
  }) => void
  defaultFloor?: string
}

export function IssueModal({
  open,
  onClose,
  onSave,
  onSaveAndNext,
  defaultFloor,
}: IssueModalProps) {
  const [floor, setFloor] = useState(defaultFloor ?? '1F')
  const [category, setCategory] = useState<IssueCategory>('傷')
  const [content, setContent] = useState('')
  const [contractorId, setContractorId] = useState('')
  const [contractorSearch, setContractorSearch] = useState('')

  const filteredContractors = CONTRACTORS.filter((c) =>
    c.name.includes(contractorSearch)
  )

  const getData = () => ({
    floor,
    category,
    content,
    contractorId,
  })

  const resetForm = () => {
    setContent('')
    setContractorId('')
    setContractorSearch('')
  }

  const handleSave = () => {
    onSave(getData())
    resetForm()
  }

  const handleSaveAndNext = () => {
    onSaveAndNext(getData())
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">指摘を追加</DialogTitle>
          <DialogDescription>図面上の指摘事項を入力してください</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Floor */}
          <div className="flex flex-col gap-2">
            <Label className="font-medium">階</Label>
            <Select value={floor} onValueChange={setFloor}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLOORS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-2">
            <Label className="font-medium">指摘区分</Label>
            <div className="flex flex-wrap gap-2">
              {ISSUE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    category === cat
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-accent'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-col gap-2">
            <Label className="font-medium">指摘内容</Label>
            <Textarea
              placeholder="指摘内容を入力してください"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>

          {/* Contractor */}
          <div className="flex flex-col gap-2">
            <Label className="font-medium">担当業者</Label>
            <div className="relative mb-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="業者を検索"
                value={contractorSearch}
                onChange={(e) => setContractorSearch(e.target.value)}
                className="h-10 pl-9"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              {filteredContractors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setContractorId(c.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                    contractorId === c.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-accent text-foreground'
                  }`}
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                  <span className="ml-auto text-xs text-muted-foreground">{c.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onClose} className="h-11">
            キャンセル
          </Button>
          <Button
            variant="secondary"
            onClick={handleSaveAndNext}
            disabled={!content || !contractorId}
            className="h-11"
          >
            保存して次を追加
          </Button>
          <Button
            onClick={handleSave}
            disabled={!content || !contractorId}
            className="h-11"
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
