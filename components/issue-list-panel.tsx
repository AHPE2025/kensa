'use client'

import { Search, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Contractor, Issue } from '@/lib/domain'
import { ISSUE_TYPES } from '@/lib/domain'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'

type NumberedIssue = Issue & { no: number }

type IssueListFilter = {
  searchText: string
  contractorId: string
  issueType: string
  floorLabel: string
}

type IssueListPanelProps = {
  issues: NumberedIssue[]
  contractors: Contractor[]
  floors: string[]
  selectedIssueId: string | null
  filters: IssueListFilter
  onFilterChange: (next: Partial<IssueListFilter>) => void
  onSelectIssue: (issue: NumberedIssue) => void
  onEditIssue: (issue: NumberedIssue) => void
}

export function IssueListPanel({
  issues,
  contractors,
  floors,
  selectedIssueId,
  filters,
  onFilterChange,
  onSelectIssue,
  onEditIssue,
}: IssueListPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="指摘を検索"
            value={filters.searchText}
            onChange={(event) => onFilterChange({ searchText: event.target.value })}
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-border p-3">
        <Select
          value={filters.contractorId}
          onValueChange={(value) => onFilterChange({ contractorId: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="業者" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全業者</SelectItem>
            {contractors.map((contractor) => (
              <SelectItem key={contractor.id} value={contractor.id}>
                {contractor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.issueType}
          onValueChange={(value) => onFilterChange({ issueType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="区分" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全区分</SelectItem>
            {ISSUE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.floorLabel}
          onValueChange={(value) => onFilterChange({ floorLabel: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="階" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全階</SelectItem>
            {floors.map((floor) => (
              <SelectItem key={floor} value={floor}>
                {floor}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">{issues.length}件の指摘</span>
        <Filter className="h-3 w-3 text-muted-foreground" />
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {issues.map((issue) => {
            const contractorName =
              issue.contractor?.name ?? contractors.find((c) => c.id === issue.contractor_id)?.name ?? '未選択'
            return (
              <button
                key={issue.id}
                type="button"
                onClick={() => onSelectIssue(issue)}
                className={`flex flex-col gap-1 border-b border-border px-3 py-3 text-left transition-colors ${
                  selectedIssueId === issue.id
                    ? 'bg-primary/5 border-l-2 border-l-primary'
                    : 'hover:bg-accent/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                    {issue.no}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {issue.floor_label}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {issue.issue_type}
                  </Badge>
                  {issue.status === 'done' ? (
                    <Badge variant="default" className="ml-auto bg-green-600 px-1.5 py-0 text-[10px] text-white">
                      完了
                    </Badge>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-foreground">
                  {issue.issue_text}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">{contractorName}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={(event) => {
                      event.stopPropagation()
                      onEditIssue(issue)
                    }}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    編集
                  </Button>
                </div>
              </button>
            )
          })}
          {issues.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <p className="text-sm">指摘がありません</p>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
