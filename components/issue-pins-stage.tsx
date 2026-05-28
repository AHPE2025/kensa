'use client'

import { memo, useCallback, useMemo } from 'react'
import { Layer, Stage } from 'react-konva'
import type { Issue } from '@/lib/domain'
import { IssuePin } from '@/components/issue-pin'

type NumberedIssue = Issue & { no: number }

type IssuePinsStageProps = {
  pinsToRender: NumberedIssue[]
  stageWidth: number
  stageHeight: number
  mode: 'view' | 'add' | 'edit'
  selectedIssueId: string | null
  isExporting: boolean
  pdfExportMode?: boolean
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
  onDragPin: (issueId: string, pinX: number, pinY: number) => boolean | void | Promise<boolean | void>
  onDragCallout: (issueId: string, calloutX: number, calloutY: number) => boolean | void | Promise<boolean | void>
}

type IssuePinItemProps = {
  issue: NumberedIssue
  stageWidth: number
  stageHeight: number
  isSelected: boolean
  canDrag: boolean
  pdfExportMode: boolean
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onDeleteRequest: (issue: NumberedIssue) => void
  onDragPin: (issueId: string, pinX: number, pinY: number) => boolean | void | Promise<boolean | void>
  onDragCallout: (issueId: string, calloutX: number, calloutY: number) => boolean | void | Promise<boolean | void>
}

function IssuePinItemComponent({
  issue,
  stageWidth,
  stageHeight,
  isSelected,
  canDrag,
  pdfExportMode,
  onSelect,
  onEdit,
  onDeleteRequest,
  onDragPin,
  onDragCallout,
}: IssuePinItemProps) {
  return (
    <IssuePin
      issue={issue}
      stageWidth={stageWidth}
      stageHeight={stageHeight}
      isSelected={isSelected}
      canDrag={canDrag}
      pdfExportMode={pdfExportMode}
      onSelect={onSelect}
      onEdit={onEdit}
      onDeleteRequest={onDeleteRequest}
      onDragPin={onDragPin}
      onDragCallout={onDragCallout}
    />
  )
}

function areIssuePinItemPropsEqual(prev: IssuePinItemProps, next: IssuePinItemProps): boolean {
  if (prev.stageWidth !== next.stageWidth) return false
  if (prev.stageHeight !== next.stageHeight) return false
  if (prev.isSelected !== next.isSelected) return false
  if (prev.canDrag !== next.canDrag) return false
  if (prev.pdfExportMode !== next.pdfExportMode) return false
  if (prev.issue.id !== next.issue.id) return false
  if (prev.issue.no !== next.issue.no) return false
  if (prev.issue.pin_x !== next.issue.pin_x) return false
  if (prev.issue.pin_y !== next.issue.pin_y) return false
  if (prev.issue.callout_x !== next.issue.callout_x) return false
  if (prev.issue.callout_y !== next.issue.callout_y) return false
  if (prev.issue.status !== next.issue.status) return false
  if (prev.issue.issue_text !== next.issue.issue_text) return false
  if (prev.issue.issue_type !== next.issue.issue_type) return false
  if (prev.issue.issue_category !== next.issue.issue_category) return false
  if (prev.issue.contractor_id !== next.issue.contractor_id) return false
  if (prev.issue.contractor?.name !== next.issue.contractor?.name) return false
  if (prev.issue.before_photo_path !== next.issue.before_photo_path) return false
  if (prev.issue.after_photo_path !== next.issue.after_photo_path) return false
  if (prev.issue.before_photo_url !== next.issue.before_photo_url) return false
  if (prev.issue.after_photo_url !== next.issue.after_photo_url) return false
  return true
}

const IssuePinItem = memo(IssuePinItemComponent, areIssuePinItemPropsEqual)

function IssuePinsStageComponent({
  pinsToRender,
  stageWidth,
  stageHeight,
  mode,
  selectedIssueId,
  isExporting,
  pdfExportMode = false,
  visibleContractorIds,
  getIssueContractorId,
  onStageClick,
  onSelect,
  onEdit,
  onDeleteRequest,
  onDragPin,
  onDragCallout,
}: IssuePinsStageProps) {
  const canDrag = mode === 'edit'
  const exportMode = pdfExportMode || isExporting

  const visiblePins = useMemo(() => {
    if (isExporting) return pinsToRender
    return pinsToRender.filter((issue) => visibleContractorIds.has(getIssueContractorId(issue)))
  }, [getIssueContractorId, isExporting, pinsToRender, visibleContractorIds])

  const handleDragPin = useCallback(
    (issueId: string, pinX: number, pinY: number) => {
      void onDragPin(issueId, pinX, pinY)
    },
    [onDragPin],
  )

  const handleDragCallout = useCallback(
    (issueId: string, calloutX: number, calloutY: number) => {
      void onDragCallout(issueId, calloutX, calloutY)
    },
    [onDragCallout],
  )

  return (
    <Stage
      width={stageWidth}
      height={stageHeight}
      className="absolute inset-0 touch-none"
      style={{
        touchAction: 'none',
        cursor: mode === 'edit' ? 'grab' : undefined,
      }}
      onClick={onStageClick}
    >
      <Layer>
        {visiblePins.map((issue) => (
          <IssuePinItem
            key={issue.id}
            issue={issue}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            isSelected={selectedIssueId === issue.id}
            canDrag={canDrag}
            pdfExportMode={exportMode}
            onSelect={onSelect}
            onEdit={onEdit}
            onDeleteRequest={onDeleteRequest}
            onDragPin={handleDragPin}
            onDragCallout={handleDragCallout}
          />
        ))}
      </Layer>
    </Stage>
  )
}

export const IssuePinsStage = memo(IssuePinsStageComponent)
