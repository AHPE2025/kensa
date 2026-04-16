'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CONTRACTORS } from '@/lib/mock-data'

interface ContractorFilterProps {
  visibleContractors: Set<string>
  onToggle: (contractorId: string) => void
  onShowAll: () => void
  onShowOnly: (contractorId: string) => void
}

export function ContractorFilter({
  visibleContractors,
  onToggle,
  onShowAll,
  onShowOnly,
}: ContractorFilterProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 border-b border-border p-3">
        <Button
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={onShowAll}
        >
          全表示
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-3">
          {CONTRACTORS.map((c) => {
            const isVisible = visibleContractors.has(c.id)
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50"
              >
                <Checkbox
                  id={`vis-${c.id}`}
                  checked={isVisible}
                  onCheckedChange={() => onToggle(c.id)}
                />
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <Label htmlFor={`vis-${c.id}`} className="flex-1 text-sm cursor-pointer">
                  {c.name}
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-muted-foreground"
                  onClick={() => onShowOnly(c.id)}
                >
                  のみ
                </Button>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
