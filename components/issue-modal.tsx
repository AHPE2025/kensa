'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Checkbox } from '@/components/ui/checkbox'
import { ISSUE_TYPES, type Contractor } from '@/lib/domain'
import { Search } from 'lucide-react'

type IssueFormValues = {
  floor_label: string
  issue_type: string
  issue_text: string
  contractor_id: string
  status: string
}

type IssueModalProps = {
  open: boolean
  title: string
  contractors: Contractor[]
  floors: string[]
  defaultValues: IssueFormValues
  onClose: () => void
  onSave: (values: IssueFormValues) => void
  onSaveAndNext?: (values: IssueFormValues) => void
  submitLabel?: string
}

export function IssueModal({
  open,
  title,
  contractors,
  floors,
  defaultValues,
  onClose,
  onSave,
  onSaveAndNext,
  submitLabel = '保存',
}: IssueModalProps) {
  const [form, setForm] = useState<IssueFormValues>(defaultValues)
  const [contractorSearch, setContractorSearch] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(defaultValues)
    setContractorSearch('')
  }, [open, defaultValues])

  const filteredContractors = useMemo(() => {
    const key = contractorSearch.trim().toLowerCase()
    if (!key) return contractors
    return contractors.filter((contractor) => contractor.name.toLowerCase().includes(key))
  }, [contractors, contractorSearch])

  const handleSave = () => {
    onSave(form)
  }

  const handleSaveAndNext = () => {
    if (!onSaveAndNext) return
    onSaveAndNext(form)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-2">
            <Label className="font-medium">階</Label>
            <Select
              value={form.floor_label}
              onValueChange={(value) => setForm((prev) => ({ ...prev, floor_label: value }))}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="階を選択" />
              </SelectTrigger>
              <SelectContent>
                {floors.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="font-medium">指摘区分</Label>
            <Select
              value={form.issue_type}
              onValueChange={(value) => setForm((prev) => ({ ...prev, issue_type: value }))}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="font-medium">指摘内容</Label>
            <Textarea
              placeholder="指摘内容を入力してください"
              value={form.issue_text}
              onChange={(event) => setForm((prev) => ({ ...prev, issue_text: event.target.value }))}
              className="min-h-[80px] resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="font-medium">担当業者（検索付き）</Label>
            <div className="relative mb-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="業者を検索"
                value={contractorSearch}
                onChange={(event) => setContractorSearch(event.target.value)}
                className="h-10 pl-9"
              />
            </div>
            <Select
              value={form.contractor_id || '__none__'}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, contractor_id: value === '__none__' ? '' : value }))
              }
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="担当業者を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">未選択</SelectItem>
                {filteredContractors.map((contractor) => (
                  <SelectItem key={contractor.id} value={contractor.id}>
                    {contractor.name}
                  </SelectItem>
                ))}
                {filteredContractors.length === 0 ? (
                  <SelectItem value="__no_match__" disabled>
                    該当業者なし
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 rounded-md border p-3">
            <Checkbox
              id="issue-done"
              checked={form.status === 'done'}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, status: checked ? 'done' : 'open' }))
              }
            />
            <Label htmlFor="issue-done" className="cursor-pointer">
              完了状態（任意）
            </Label>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose} className="h-11">
            キャンセル
          </Button>
          {onSaveAndNext ? (
            <Button
              type="button"
              variant="secondary"
              onClick={handleSaveAndNext}
              disabled={!form.issue_text.trim() || !form.floor_label}
              className="h-11"
            >
              保存して次を追加
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={handleSave}
            disabled={!form.issue_text.trim() || !form.floor_label}
            className="h-11 bg-blue-600 hover:bg-blue-700"
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
