'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_ISSUE_TYPE_OPTIONS,
  type AssignmentType,
  type Contractor,
  type IssueTypeContractorMapping,
} from '@/lib/domain'

const CUSTOM_ISSUE_TYPE_VALUE = '__custom__'

type MappingFormState = {
  issue_type: string
  assignment_type: AssignmentType
  contractor_id: string
  sort_order: string
  is_active: boolean
}

type IssueTypeMappingModalProps = {
  open: boolean
  contractors: Contractor[]
  mapping: IssueTypeContractorMapping | null
  onClose: () => void
  onSave: (values: {
    issue_type: string
    assignment_type: AssignmentType
    contractor_id: string | null
    sort_order: number
    is_active: boolean
  }) => Promise<void>
}

function buildInitialForm(mapping: IssueTypeContractorMapping | null): MappingFormState {
  if (!mapping) {
    return {
      issue_type: DEFAULT_ISSUE_TYPE_OPTIONS[0],
      assignment_type: 'contractor',
      contractor_id: '',
      sort_order: '0',
      is_active: true,
    }
  }
  return {
    issue_type: mapping.issue_type,
    assignment_type: mapping.assignment_type,
    contractor_id: mapping.contractor_id ?? '',
    sort_order: String(mapping.sort_order ?? 0),
    is_active: mapping.is_active,
  }
}

export function IssueTypeMappingModal({
  open,
  contractors,
  mapping,
  onClose,
  onSave,
}: IssueTypeMappingModalProps) {
  const [form, setForm] = useState<MappingFormState>(() => buildInitialForm(mapping))
  const [customIssueType, setCustomIssueType] = useState('')
  const [saving, setSaving] = useState(false)

  const issueTypeOptions = useMemo(() => [...DEFAULT_ISSUE_TYPE_OPTIONS], [])

  const isCustomIssueType = form.issue_type === CUSTOM_ISSUE_TYPE_VALUE

  useEffect(() => {
    if (!open) return
    const initial = buildInitialForm(mapping)
    const isPreset = issueTypeOptions.includes(initial.issue_type as (typeof DEFAULT_ISSUE_TYPE_OPTIONS)[number])
    if (!isPreset && initial.issue_type) {
      setCustomIssueType(initial.issue_type)
      setForm({ ...initial, issue_type: CUSTOM_ISSUE_TYPE_VALUE })
      return
    }
    setCustomIssueType('')
    setForm(initial)
  }, [open, mapping, issueTypeOptions])

  const resolvedIssueType = isCustomIssueType ? customIssueType.trim() : form.issue_type.trim()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!resolvedIssueType) return
    if (form.assignment_type === 'contractor' && !form.contractor_id) return

    setSaving(true)
    try {
      await onSave({
        issue_type: resolvedIssueType,
        assignment_type: form.assignment_type,
        contractor_id: form.assignment_type === 'contractor' ? form.contractor_id : null,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mapping ? '紐付けを編集' : '紐付けを追加'}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>指摘区分</Label>
            <Select
              value={form.issue_type}
              onValueChange={(value) => setForm((prev) => ({ ...prev, issue_type: value }))}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {issueTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_ISSUE_TYPE_VALUE}>自由入力</SelectItem>
              </SelectContent>
            </Select>
            {isCustomIssueType ? (
              <Input
                placeholder="指摘区分を入力"
                value={customIssueType}
                onChange={(event) => setCustomIssueType(event.target.value)}
                required
              />
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>種別</Label>
            <Select
              value={form.assignment_type}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  assignment_type: value as AssignmentType,
                  contractor_id: value === 'contractor' ? prev.contractor_id : '',
                }))
              }
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contractor">業者</SelectItem>
                <SelectItem value="common">共通</SelectItem>
                <SelectItem value="unassigned">業者未定</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.assignment_type === 'contractor' ? (
            <div className="space-y-2">
              <Label>自動設定する担当業者</Label>
              <Select
                value={form.contractor_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, contractor_id: value }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="担当業者を選択" />
                </SelectTrigger>
                <SelectContent>
                  {contractors.map((contractor) => (
                    <SelectItem key={contractor.id} value={contractor.id}>
                      {contractor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>表示順</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(event) => setForm((prev) => ({ ...prev, sort_order: event.target.value }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="mapping-active">有効</Label>
            <Switch
              id="mapping-active"
              checked={form.is_active}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
