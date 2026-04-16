'use client'

import { useState } from 'react'
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
import type { Issue } from '@/lib/types'
import { ISSUE_CATEGORIES } from '@/lib/types'
import { CONTRACTORS } from '@/lib/mock-data'

interface IssueListPanelProps {
  issues: Issue[]
  selectedIssue: Issue | null
  onSelectIssue: (issue: Issue) => void
}

export function IssueListPanel({ issues, selectedIssue, onSelectIssue }: IssueListPanelProps) {
  const [search, setSearch] = useState('')
  const [filterContractor, setFilterContractor] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')

  const filtered = issues.filter((issue) => {
    if (search && !issue.content.includes(search) && !String(issue.number).includes(search)) return false
    if (filterContractor !== 'all' && issue.contractorId !== filterContractor) return false
    if (filterCategory !== 'all' && issue.category !== filterCategory) return false
    return true
  })

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="指摘を検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 border-b border-border p-3">
        <Select value={filterContractor} onValueChange={setFilterContractor}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue placeholder="業者" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全業者</SelectItem>
            {CONTRACTORS.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 w-24 text-xs">
            <SelectValue placeholder="区分" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全区分</SelectItem>
            {ISSUE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Count */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">{filtered.length}件の指摘</span>
        <Filter className="h-3 w-3 text-muted-foreground" />
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {filtered.map((issue) => {
            const contractor = CONTRACTORS.find((c) => c.id === issue.contractorId)
            return (
              <button
                key={issue.id}
                type="button"
                onClick={() => onSelectIssue(issue)}
                className={`flex flex-col gap-1 border-b border-border px-3 py-3 text-left transition-colors ${
                  selectedIssue?.id === issue.id
                    ? 'bg-primary/5 border-l-2 border-l-primary'
                    : 'hover:bg-accent/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-card"
                    style={{ backgroundColor: contractor?.color ?? '#2563eb' }}
                  >
                    {issue.number}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {issue.floor}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {issue.category}
                  </Badge>
                  {issue.resolved && (
                    <Badge variant="default" className="ml-auto text-[10px] px-1.5 py-0 bg-green-600 text-card">
                      完了
                    </Badge>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-foreground line-clamp-2">
                  {issue.content}
                </p>
                <p className="text-[10px] text-muted-foreground">{issue.contractorName}</p>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <p className="text-sm">指摘がありません</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
