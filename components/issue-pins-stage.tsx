'use client'

import { memo, useCallback, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type { Issue } from '@/lib/domain'
import { IssuePin, type DragOverride } from '@/components/issue-pin'

type NumberedIssue = Issue & { no: number }

type DraggingPositions = Record<string, DragOverride>

type IssuePinsStageProps = {
  pinsToRender: NumberedIssue[]
  stageWidth: number
  stageHeight: number
  mode: 'view' | 'add' | 'edit'
  selectedIssueId: string | null
  isExporting: boolean
  visibleContractorIds: Set<string>
  getIssueContractorId: (issue: Issue) => string
  onStageClick: (event: {
    target: {
      getStage: () => unknown
      getPointerPosition?: () => { x: number; y: number } | null
    }
  }) => void
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onDeleteRequest: (issue: NumberedIssue) => void
  onDragPin: (issueId: string, pinX: number, pinY: number) => void | Promise<void>
  onDragCallout: (issueId: string, calloutX: number, calloutY: number) => void | Promise<void>
}

function IssuePinsStageComponent({
  pinsToRender,
  stageWidth,
  stageHeight,
  mode,
  selectedIssueId,
  isExporting,
  visibleContractorIds,
  getIssueContractorId,
  onStageClick,
  onSelect,
  onEdit,
  onDeleteRequest,
  onDragPin,
  onDragCallout,
}: IssuePinsStageProps) {
  const [draggingPositions, setDraggingPositions] = useState<DraggingPositions>({})
  const dragMoveRafRef = useRef<number | null>(null)
  const pendingDragMoveRef = useRef<{
    issueId: string
    target: 'pin' | 'callout'
    x: number
    y: number
  } | null>(null)

  const handleDragMove = useCallback((issueId: string, target: 'pin' | 'callout', x: number, y: number) => {
    pendingDragMoveRef.current = { issueId, target, x, y }
    if (dragMoveRafRef.current !== null) return
    dragMoveRafRef.current = requestAnimationFrame(() => {
      dragMoveRafRef.current = null
      const pending = pendingDragMoveRef.current
      if (!pending) return
      setDraggingPositions((prev) => ({
        ...prev,
        [pending.issueId]: {
          ...prev[pending.issueId],
          ...(pending.target === 'pin'
            ? { pin_x: pending.x, pin_y: pending.y }
            : { callout_x: pending.x, callout_y: pending.y }),
        },
      }))
    })
  }, [])

  const clearDragPosition = useCallback((issueId: string, target: 'pin' | 'callout') => {
    setDraggingPositions((prev) => {
      const current = prev[issueId]
      if (!current) return prev
      const next: DragOverride = { ...current }
      if (target === 'pin') {
        delete next.pin_x
        delete next.pin_y
      } else {
        delete next.callout_x
        delete next.callout_y
      }
      if (Object.keys(next).length === 0) {
        const { [issueId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [issueId]: next }
    })
  }, [])

  const handleDragPinEnd = useCallback(
    async (issueId: string, pinX: number, pinY: number) => {
      clearDragPosition(issueId, 'pin')
      await onDragPin(issueId, pinX, pinY)
    },
    [clearDragPosition, onDragPin],
  )

  const handleDragCalloutEnd = useCallback(
    async (issueId: string, calloutX: number, calloutY: number) => {
      clearDragPosition(issueId, 'callout')
      await onDragCallout(issueId, calloutX, calloutY)
    },
    [clearDragPosition, onDragCallout],
  )

  return (
    <Stage
      width={stageWidth}
      height={stageHeight}
      className="absolute inset-0"
      style={mode === 'edit' ? { cursor: 'grab' } : undefined}
      onClick={onStageClick}
    >
      <Layer>
        {pinsToRender.map((issue) => {
          if (!isExporting && !visibleContractorIds.has(getIssueContractorId(issue))) return null
          return (
            <IssuePin
              key={issue.id}
              issue={issue}
              stageWidth={stageWidth}
              stageHeight={stageHeight}
              isSelected={selectedIssueId === issue.id}
              canDrag={mode === 'edit'}
              dragOverride={draggingPositions[issue.id] ?? null}
              onDragMove={handleDragMove}
              onSelect={onSelect}
              onEdit={onEdit}
              onDeleteRequest={onDeleteRequest}
              onDragPin={handleDragPinEnd}
              onDragCallout={handleDragCalloutEnd}
            />
          )
        })}
      </Layer>
    </Stage>
  )
}

export const IssuePinsStage = memo(IssuePinsStageComponent)
