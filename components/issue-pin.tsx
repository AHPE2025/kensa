'use client'

import { useCallback, useRef, useState } from 'react'
import type { Issue } from '@/lib/types'
import { CONTRACTORS } from '@/lib/mock-data'

interface IssuePinProps {
  issue: Issue
  isSelected: boolean
  isFiltered: boolean
  onSelect: (issue: Issue) => void
  onLabelDrag: (issueId: string, labelX: number, labelY: number) => void
}

export function IssuePin({
  issue,
  isSelected,
  isFiltered,
  onSelect,
  onLabelDrag,
}: IssuePinProps) {
  const contractor = CONTRACTORS.find((c) => c.id === issue.contractorId)
  const pinColor = contractor?.color ?? '#2563eb'
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; lx: number; ly: number } | null>(null)

  const handleLabelMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setIsDragging(true)
      const parentRect = (e.currentTarget as HTMLElement).closest('.drawing-canvas')?.getBoundingClientRect()
      if (!parentRect) return
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        lx: issue.labelX,
        ly: issue.labelY,
      }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragStartRef.current || !parentRect) return
        const dx = ((ev.clientX - dragStartRef.current.x) / parentRect.width) * 100
        const dy = ((ev.clientY - dragStartRef.current.y) / parentRect.height) * 100
        const newLX = Math.max(0, Math.min(95, dragStartRef.current.lx + dx))
        const newLY = Math.max(0, Math.min(95, dragStartRef.current.ly + dy))
        onLabelDrag(issue.id, newLX, newLY)
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        dragStartRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [issue.id, issue.labelX, issue.labelY, onLabelDrag]
  )

  if (!isFiltered) return null

  return (
    <>
      {/* Line from pin to label */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ zIndex: 10 }}
      >
        <line
          x1={`${issue.x}%`}
          y1={`${issue.y}%`}
          x2={`${issue.labelX}%`}
          y2={`${issue.labelY}%`}
          stroke={pinColor}
          strokeWidth="1.5"
          strokeDasharray="4 2"
          opacity={isSelected ? 1 : 0.6}
        />
      </svg>

      {/* Pin marker */}
      <button
        type="button"
        className="absolute z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold text-card shadow-md transition-transform hover:scale-110"
        style={{
          left: `${issue.x}%`,
          top: `${issue.y}%`,
          backgroundColor: pinColor,
          transform: `translate(-50%, -50%) ${isSelected ? 'scale(1.2)' : 'scale(1)'}`,
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(issue)
        }}
        aria-label={`指摘 ${issue.number}`}
      >
        {issue.number}
      </button>

      {/* Label / callout */}
      <div
        className="absolute z-20 cursor-move rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm transition-shadow"
        style={{
          left: `${issue.labelX}%`,
          top: `${issue.labelY}%`,
          borderLeftColor: pinColor,
          borderLeftWidth: 3,
          boxShadow: isSelected ? `0 0 0 2px ${pinColor}40` : undefined,
          opacity: isDragging ? 0.8 : 1,
        }}
        onMouseDown={handleLabelMouseDown}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(issue)
        }}
      >
        <div className="font-semibold text-foreground" style={{ color: pinColor }}>
          #{issue.number} {issue.category}
        </div>
        <div className="max-w-[140px] truncate text-muted-foreground">{issue.content}</div>
        <div className="text-muted-foreground">{issue.contractorName}</div>
      </div>
    </>
  )
}
