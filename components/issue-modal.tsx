'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ISSUE_PHOTO_ACCEPT } from '@/lib/issue-photos'
import {
  applyIssueTypeMapping,
  findActiveMappingForIssueType,
} from '@/lib/issue-type-mapping'
import type { Contractor, IssueFormValues, IssueTypeContractorMapping } from '@/lib/domain'
import { normalizeIssueStatus } from '@/lib/issue-status'
import { Search, X } from 'lucide-react'

const CUSTOM_ISSUE_TYPE_VALUE = '__custom__'

type IssueModalProps = {
  open: boolean
  title: string
  contractors: Contractor[]
  issueTypeOptions: string[]
  issueTypeMappings: IssueTypeContractorMapping[]
  isEditMode: boolean
  defaultValues: Omit<IssueFormValues, 'beforePhotoFile' | 'afterPhotoFile' | 'clearBeforePhoto' | 'clearAfterPhoto'>
  defaultBeforePhotoUrl?: string | null
  defaultAfterPhotoUrl?: string | null
  onClose: () => void
  onSave: (values: IssueFormValues) => void
  onSaveAndNext?: (values: IssueFormValues) => void
  submitLabel?: string
}

function PhotoSlot({
  label,
  placeholder,
  previewUrl,
  onSelectFile,
  onClear,
}: {
  label: string
  placeholder: string
  previewUrl: string | null
  onSelectFile: (file: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="rounded-md border border-dashed p-3">
      <Label className="mb-2 block font-medium">{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept={ISSUE_PHOTO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onSelectFile(file)
          event.target.value = ''
        }}
      />
      <button
        type="button"
        className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded bg-muted text-xs text-muted-foreground transition-colors hover:bg-muted/80"
        onClick={() => inputRef.current?.click()}
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
            <span
              role="button"
              tabIndex={0}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              onClick={(event) => {
                event.stopPropagation()
                onClear()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  onClear()
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          </>
        ) : (
          <span className="px-2 text-center">{placeholder}</span>
        )}
      </button>
    </div>
  )
}

export function IssueModal({
  open,
  title,
  contractors,
  issueTypeOptions,
  issueTypeMappings,
  isEditMode,
  defaultValues,
  defaultBeforePhotoUrl,
  defaultAfterPhotoUrl,
  onClose,
  onSave,
  onSaveAndNext,
  submitLabel = '保存',
}: IssueModalProps) {
  const [form, setForm] = useState(defaultValues)
  const [contractorSearch, setContractorSearch] = useState('')
  const [beforePhotoFile, setBeforePhotoFile] = useState<File | null>(null)
  const [afterPhotoFile, setAfterPhotoFile] = useState<File | null>(null)
  const [clearBeforePhoto, setClearBeforePhoto] = useState(false)
  const [clearAfterPhoto, setClearAfterPhoto] = useState(false)
  const [beforePreviewUrl, setBeforePreviewUrl] = useState<string | null>(null)
  const [afterPreviewUrl, setAfterPreviewUrl] = useState<string | null>(null)
  const [customIssueType, setCustomIssueType] = useState('')
  const [autoMessage, setAutoMessage] = useState<string | null>(null)

  const isCustomIssueType = form.issue_type === CUSTOM_ISSUE_TYPE_VALUE

  useEffect(() => {
    if (!open) return
    const preset = issueTypeOptions.includes(defaultValues.issue_type)
    const normalizedDefaults = {
      ...defaultValues,
      status: normalizeIssueStatus(defaultValues.status),
    }
    setForm(
      preset
        ? normalizedDefaults
        : { ...normalizedDefaults, issue_type: CUSTOM_ISSUE_TYPE_VALUE },
    )
    setCustomIssueType(preset ? '' : defaultValues.issue_type)
    setContractorSearch('')
    setBeforePhotoFile(null)
    setAfterPhotoFile(null)
    setClearBeforePhoto(false)
    setClearAfterPhoto(false)
    setBeforePreviewUrl(defaultBeforePhotoUrl ?? null)
    setAfterPreviewUrl(defaultAfterPhotoUrl ?? null)
    setAutoMessage(null)
  }, [open, defaultValues, defaultBeforePhotoUrl, defaultAfterPhotoUrl, issueTypeOptions])

  useEffect(() => {
    if (!beforePhotoFile) return
    const objectUrl = URL.createObjectURL(beforePhotoFile)
    setBeforePreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [beforePhotoFile])

  useEffect(() => {
    if (!afterPhotoFile) return
    const objectUrl = URL.createObjectURL(afterPhotoFile)
    setAfterPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [afterPhotoFile])

  const filteredContractors = useMemo(() => {
    const key = contractorSearch.trim().toLowerCase()
    if (!key) return contractors
    return contractors.filter((contractor) => contractor.name.toLowerCase().includes(key))
  }, [contractors, contractorSearch])

  const applyMappingForIssueType = (issueType: string) => {
    console.log('selected issue type:', issueType)
    try {
      const mapping = findActiveMappingForIssueType(issueTypeMappings, issueType)
      if (!mapping) {
        console.log('no contractor mapping found:', issueType)
      } else {
        console.log('auto contractor mapping applied:', {
          issueType,
          mapping,
          contractorId: mapping.contractor_id,
          assignmentType: mapping.assignment_type,
        })
      }
      const result = applyIssueTypeMapping(mapping, issueType)
      setForm((prev) => ({
        ...prev,
        contractor_id: result.contractor_id,
        issue_category: result.issue_category,
      }))
      setAutoMessage(result.message)
    } catch (error) {
      console.error('apply issue type mapping error:', error)
    }
  }

  const handleIssueTypeChange = (value: string) => {
    setForm((prev) => ({ ...prev, issue_type: value }))
    if (value === CUSTOM_ISSUE_TYPE_VALUE) return
    applyMappingForIssueType(value)
  }

  const handleCustomIssueTypeChange = (value: string) => {
    setCustomIssueType(value)
    const trimmed = value.trim()
    if (!trimmed) return
    applyMappingForIssueType(trimmed)
  }

  const buildFormValues = (): IssueFormValues => {
    const resolvedIssueType = isCustomIssueType ? customIssueType.trim() : form.issue_type
    const normalizedStatus = normalizeIssueStatus(form.status)
    console.log('normalized issue status:', normalizedStatus)
    return {
      ...form,
      issue_type: resolvedIssueType || form.issue_type,
      status: normalizedStatus,
      beforePhotoFile,
      afterPhotoFile,
      clearBeforePhoto,
      clearAfterPhoto,
    }
  }

  const handleSave = () => {
    onSave(buildFormValues())
  }

  const handleSaveAndNext = () => {
    if (!onSaveAndNext) return
    onSaveAndNext(buildFormValues())
  }

  const selectedContractorValue =
    form.issue_category === 'common' ? '__common__' : form.contractor_id || '__unassigned__'

  const contractorDisplayName = useMemo(() => {
    if (form.issue_category === 'common') return '共通'
    if (!form.contractor_id) return '業者未定'
    return contractors.find((contractor) => contractor.id === form.contractor_id)?.name ?? '業者未定'
  }, [contractors, form.contractor_id, form.issue_category])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            指摘内容、担当業者、状態、写真を入力して保存する画面です。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-2">
            <Label className="font-medium">指摘区分</Label>
            <Select value={form.issue_type} onValueChange={handleIssueTypeChange}>
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
                onChange={(event) => handleCustomIssueTypeChange(event.target.value)}
              />
            ) : null}
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
            {autoMessage ? (
              <p className="text-xs text-muted-foreground">{autoMessage}</p>
            ) : isEditMode ? null : (
              <p className="text-xs text-muted-foreground">現在: {contractorDisplayName}</p>
            )}
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
              value={selectedContractorValue}
              onValueChange={(value) => {
                if (value === '__unassigned__') {
                  setForm((prev) => ({ ...prev, contractor_id: '', issue_category: '' }))
                  setAutoMessage('担当業者を手動変更しました。')
                  console.log('manual contractor override:', { contractorId: null, contractorName: '業者未定' })
                  return
                }
                if (value === '__common__') {
                  setForm((prev) => ({ ...prev, contractor_id: '', issue_category: 'common' }))
                  setAutoMessage('担当業者を手動変更しました。')
                  console.log('manual contractor override:', { contractorId: null, contractorName: '共通' })
                  return
                }
                const contractorName =
                  contractors.find((contractor) => contractor.id === value)?.name ?? value
                setForm((prev) => ({ ...prev, contractor_id: value, issue_category: '' }))
                setAutoMessage('担当業者を手動変更しました。')
                console.log('manual contractor override:', { contractorId: value, contractorName })
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="担当業者を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">業者未定</SelectItem>
                <SelectItem value="__common__">共通</SelectItem>
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

          <div className="flex flex-col gap-2">
            <Label className="font-medium">状態</Label>
            <Select
              value={normalizeIssueStatus(form.status)}
              onValueChange={(value) => {
                const normalized = normalizeIssueStatus(value)
                console.log('issue status selected:', normalized)
                setForm((prev) => ({ ...prev, status: normalized }))
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="未対応">未対応</SelectItem>
                <SelectItem value="完了">完了</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PhotoSlot
              label="ビフォー写真"
              placeholder="クリックしてビフォー写真を追加"
              previewUrl={beforePreviewUrl}
              onSelectFile={(file) => {
                setBeforePhotoFile(file)
                setClearBeforePhoto(false)
              }}
              onClear={() => {
                setBeforePhotoFile(null)
                setBeforePreviewUrl(null)
                setClearBeforePhoto(true)
              }}
            />
            <PhotoSlot
              label="アフター写真"
              placeholder="クリックしてアフター写真を追加"
              previewUrl={afterPreviewUrl}
              onSelectFile={(file) => {
                setAfterPhotoFile(file)
                setClearAfterPhoto(false)
              }}
              onClear={() => {
                setAfterPhotoFile(null)
                setAfterPreviewUrl(null)
                setClearAfterPhoto(true)
              }}
            />
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
              className="h-11"
            >
              保存して次を追加
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={handleSave}
            className="h-11 bg-blue-600 hover:bg-blue-700"
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
