'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Contractor } from '@/lib/domain'

interface ContractorFilterProps {
  contractors: Contractor[]
  visibleContractorIds: Set<string>
  onToggle: (contractorId: string) => void
  onShowAll: () => void
  onShowOnly: (contractorId: string) => void
}

export function ContractorFilter({
  contractors,
  visibleContractorIds,
  onToggle,
  onShowAll,
  onShowOnly,
}: ContractorFilterProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 border-b border-border p-3">
        <Button variant="outline" size="sm" className="h-8 flex-1 text-xs" onClick={onShowAll}>
          全表示
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => {
            if (contractors[0]) onShowOnly(contractors[0].id)
          }}
          disabled={contractors.length === 0}
        >
          この業者のみ表示
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-3">
          {contractors.map((contractor) => {
            const isVisible = visibleContractorIds.has(contractor.id)
            return (
              <div
                key={contractor.id}
                className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50"
              >
                <Checkbox
                  id={`vis-${contractor.id}`}
                  checked={isVisible}
                  onCheckedChange={() => onToggle(contractor.id)}
                />
                <Label htmlFor={`vis-${contractor.id}`} className="flex-1 cursor-pointer text-sm">
                  {contractor.name}
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-muted-foreground"
                  onClick={() => onShowOnly(contractor.id)}
                >
                  のみ
                </Button>
              </div>
            )
          })}
          {contractors.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">業者データがありません</p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
