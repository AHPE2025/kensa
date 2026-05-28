'use client'

import { memo, useCallback, useState } from 'react'
import { Circle, Group, Label, Line, Tag, Text as KonvaText } from 'react-konva'
import type Konva from 'konva'
import type { Issue } from '@/lib/domain'
import { normalizeIssueStatus } from '@/lib/issue-status'

type NumberedIssue = Issue & { no: number; exportNo?: number | string }

export type DragOverride = {
  pin_x?: number
  pin_y?: number
  callout_x?: number
  callout_y?: number
}

type IssuePinProps = {
  issue: NumberedIssue
  stageWidth: number
  stageHeight: number
  isSelected: boolean
  canDrag: boolean
  pdfExportMode?: boolean
  dragOverride?: DragOverride | null
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onDeleteRequest: (issue: NumberedIssue) => void
  onDragMove?: (issueId: string, target: 'pin' | 'callout', x: number, y: number) => void
  onDragPin: (issueId: string, pinX: number, pinY: number) => void
  onDragCallout: (issueId: string, calloutX: number, calloutY: number) => void
}

function clampRatio(value: number) {
  return Math.max(0.03, Math.min(0.97, value))
}

function IssueConnectorLine({
  pinX,
  pinY,
  calloutX,
  calloutY,
  stroke,
  strokeWidth,
}: {
  pinX: number
  pinY: number
  calloutX: number
  calloutY: number
  stroke: string
  strokeWidth: number
}) {
  return (
    <Line
      points={[pinX, pinY, calloutX, calloutY]}
      stroke={stroke}
      strokeWidth={strokeWidth}
      dash={[6, 4]}
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}

const MemoIssueConnectorLine = memo(IssueConnectorLine)

function IssuePinMarker({
  issue,
  pinX,
  pinY,
  pinColor,
  displayNo,
  isSelected,
  isDragging,
  canDrag,
  onSelect,
  onEdit,
  onPinDragMove,
  onPinDragStart,
  onPinDragEnd,
  onPinMouseEnter,
  onPinMouseLeave,
}: {
  issue: NumberedIssue
  pinX: number
  pinY: number
  pinColor: string
  displayNo: number | string
  isSelected: boolean
  isDragging: boolean
  canDrag: boolean
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onPinDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void
  onPinDragStart: (event: Konva.KonvaEventObject<DragEvent>) => void
  onPinDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void
  onPinMouseEnter: () => void
  onPinMouseLeave: () => void
}) {
  const stopBubble = (event: { cancelBubble: boolean }) => {
    event.cancelBubble = true
  }

  const handleSelect = (event: { cancelBubble: boolean }) => {
    stopBubble(event)
    onSelect(issue)
  }

  const handleEdit = (event: { cancelBubble: boolean }) => {
    stopBubble(event)
    onEdit(issue)
  }

  return (
    <Group
      x={pinX}
      y={pinY}
      draggable={canDrag}
      onClick={handleSelect}
      onTap={handleSelect}
      onDblClick={handleEdit}
      onDblTap={handleEdit}
      onDragStart={onPinDragStart}
      onDragMove={onPinDragMove}
      onDragEnd={onPinDragEnd}
      onMouseEnter={onPinMouseEnter}
      onMouseLeave={onPinMouseLeave}
    >
      <Circle
        x={0}
        y={0}
        radius={13}
        fill={pinColor}
        stroke="#ffffff"
        strokeWidth={isSelected ? 4 : 2}
        shadowBlur={isDragging ? 14 : isSelected ? 6 : 0}
        shadowOpacity={isDragging ? 0.4 : 0.25}
        shadowColor="#000000"
      />
      <KonvaText
        x={-8}
        y={-9}
        width={16}
        height={16}
        align="center"
        verticalAlign="middle"
        fontSize={10}
        fontStyle="bold"
        fill="#ffffff"
        text={String(displayNo)}
        listening={false}
      />
    </Group>
  )
}

const MemoIssuePinMarker = memo(IssuePinMarker)

function IssueCalloutLabel({
  issue,
  calloutX,
  calloutY,
  calloutBg,
  calloutStroke,
  calloutStrokeWidth,
  calloutText,
  isSelected,
  isDragging,
  canDrag,
  onSelect,
  onEdit,
  onDeleteRequest,
  onCalloutDragMove,
  onCalloutDragStart,
  onCalloutDragEnd,
  onCalloutMouseEnter,
  onCalloutMouseLeave,
}: {
  issue: NumberedIssue
  calloutX: number
  calloutY: number
  calloutBg: string
  calloutStroke: string
  calloutStrokeWidth: number
  calloutText: string
  isSelected: boolean
  isDragging: boolean
  canDrag: boolean
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onDeleteRequest: (issue: NumberedIssue) => void
  onCalloutDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void
  onCalloutDragStart: (event: Konva.KonvaEventObject<DragEvent>) => void
  onCalloutDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void
  onCalloutMouseEnter: () => void
  onCalloutMouseLeave: () => void
}) {
  const stopBubble = (event: { cancelBubble: boolean }) => {
    event.cancelBubble = true
  }

  const handleSelect = (event: { cancelBubble: boolean }) => {
    stopBubble(event)
    onSelect(issue)
  }

  const handleEdit = (event: { cancelBubble: boolean }) => {
    stopBubble(event)
    onEdit(issue)
  }

  const handleDelete = (event: { cancelBubble: boolean }) => {
    stopBubble(event)
    onDeleteRequest(issue)
  }

  return (
    <Label
      x={calloutX}
      y={calloutY}
      draggable={canDrag}
      onClick={handleSelect}
      onTap={handleSelect}
      onDblClick={handleEdit}
      onDblTap={handleEdit}
      onDragStart={onCalloutDragStart}
      onDragMove={onCalloutDragMove}
      onDragEnd={onCalloutDragEnd}
      onMouseEnter={onCalloutMouseEnter}
      onMouseLeave={onCalloutMouseLeave}
    >
      <Tag
        fill={calloutBg}
        stroke={calloutStroke}
        strokeWidth={calloutStrokeWidth}
        cornerRadius={6}
        shadowBlur={isDragging ? 14 : isSelected ? 8 : 0}
        shadowOpacity={isDragging ? 0.35 : 0.2}
        shadowColor="#000000"
      />
      <KonvaText padding={8} fontSize={11} lineHeight={1.3} fill="#0f172a" text={calloutText} />
      {canDrag && isSelected ? (
        <KonvaText
          padding={8}
          fontSize={11}
          fill="#2563eb"
          text="編集"
          onClick={handleEdit}
          onTap={handleEdit}
        />
      ) : null}
      {canDrag && isSelected ? (
        <KonvaText
          padding={8}
          fontSize={11}
          fill="#dc2626"
          text="削除"
          onClick={handleDelete}
          onTap={handleDelete}
        />
      ) : null}
    </Label>
  )
}

const MemoIssueCalloutLabel = memo(IssueCalloutLabel)

function IssuePinComponent({
  issue,
  stageWidth,
  stageHeight,
  isSelected,
  canDrag,
  pdfExportMode = false,
  dragOverride,
  onSelect,
  onEdit,
  onDeleteRequest,
  onDragMove,
  onDragPin,
  onDragCallout,
}: IssuePinProps) {
  const [isDraggingPin, setIsDraggingPin] = useState(false)
  const [isDraggingCallout, setIsDraggingCallout] = useState(false)

  const displayPinX = (dragOverride?.pin_x ?? issue.pin_x) * stageWidth
  const displayPinY = (dragOverride?.pin_y ?? issue.pin_y) * stageHeight
  const displayCalloutX = (dragOverride?.callout_x ?? issue.callout_x) * stageWidth
  const displayCalloutY = (dragOverride?.callout_y ?? issue.callout_y) * stageHeight

  const isDone = normalizeIssueStatus(issue.status) === '完了'
  const basePinColor = isDone ? '#16a34a' : '#ea580c'
  const pinColor = isSelected ? '#dc2626' : basePinColor
  const calloutBg = isSelected ? '#eff6ff' : isDone ? '#f0fdf4' : '#fff7ed'
  const calloutStroke = isSelected ? '#2563eb' : pinColor
  const calloutStrokeWidth = isSelected ? 2.5 : 1
  const pinNo = pdfExportMode ? (issue.exportNo ?? issue.no) : issue.no
  const shortText = issue.issue_text?.trim() ? issue.issue_text.slice(0, 24) : '未入力'
  const calloutText = pdfExportMode
    ? [`#${pinNo} ${issue.issue_type}`, shortText].filter(Boolean).join('\n')
    : (() => {
        const contractorLabel =
          issue.issue_category === 'common' ? '共通指摘' : issue.contractor?.name ?? '業者未定'
        const photoLines = [
          issue.before_photo_path || issue.before_photo_url ? 'ビフォー写真あり' : '',
          issue.after_photo_path || issue.after_photo_url ? 'アフター写真あり' : '',
        ]
          .filter(Boolean)
          .join('\n')
        return [
          `#${issue.no} ${issue.issue_type}`,
          issue.issue_text?.trim() ? issue.issue_text.slice(0, 30) : '未入力',
          contractorLabel,
          photoLines,
        ]
          .filter(Boolean)
          .join('\n')
      })()

  const setDragCursor = useCallback(
    (grabbing: boolean) => {
      if (!canDrag) return
      document.body.style.cursor = grabbing ? 'grabbing' : 'grab'
    },
    [canDrag],
  )

  const handlePinMouseEnter = useCallback(() => {
    if (canDrag && !isDraggingPin) setDragCursor(false)
  }, [canDrag, isDraggingPin, setDragCursor])

  const handlePinMouseLeave = useCallback(() => {
    if (canDrag && !isDraggingPin && !isDraggingCallout) {
      document.body.style.cursor = ''
    }
  }, [canDrag, isDraggingPin, isDraggingCallout])

  const handleCalloutMouseEnter = useCallback(() => {
    if (canDrag && !isDraggingCallout) setDragCursor(false)
  }, [canDrag, isDraggingCallout, setDragCursor])

  const handleCalloutMouseLeave = useCallback(() => {
    if (canDrag && !isDraggingPin && !isDraggingCallout) {
      document.body.style.cursor = ''
    }
  }, [canDrag, isDraggingPin, isDraggingCallout])

  const handlePinDragStart = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      console.log('issue drag start:', { issueId: issue.id, target: 'pin' })
      setIsDraggingPin(true)
      event.target.opacity(0.85)
      setDragCursor(true)
    },
    [canDrag, issue.id, setDragCursor],
  )

  const handlePinDragMove = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      const group = event.target
      onDragMove?.(issue.id, 'pin', group.x() / stageWidth, group.y() / stageHeight)
    },
    [canDrag, issue.id, onDragMove, stageHeight, stageWidth],
  )

  const handlePinDragEnd = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      const group = event.target
      group.opacity(1)
      setIsDraggingPin(false)
      setDragCursor(false)
      const nextX = clampRatio(group.x() / stageWidth)
      const nextY = clampRatio(group.y() / stageHeight)
      const nextPinX = nextX * stageWidth
      const nextPinY = nextY * stageHeight
      group.position({ x: nextPinX, y: nextPinY })
      onDragPin(issue.id, nextX, nextY)
    },
    [canDrag, issue.id, onDragPin, setDragCursor, stageHeight, stageWidth],
  )

  const handleCalloutDragStart = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      console.log('issue drag start:', { issueId: issue.id, target: 'callout' })
      setIsDraggingCallout(true)
      event.target.opacity(0.85)
      setDragCursor(true)
    },
    [canDrag, issue.id, setDragCursor],
  )

  const handleCalloutDragMove = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      const label = event.target
      onDragMove?.(issue.id, 'callout', label.x() / stageWidth, label.y() / stageHeight)
    },
    [canDrag, issue.id, onDragMove, stageHeight, stageWidth],
  )

  const handleCalloutDragEnd = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      const label = event.target
      label.opacity(1)
      setIsDraggingCallout(false)
      setDragCursor(false)
      const nextX = clampRatio(label.x() / stageWidth)
      const nextY = clampRatio(label.y() / stageHeight)
      const nextCalloutX = nextX * stageWidth
      const nextCalloutY = nextY * stageHeight
      label.position({ x: nextCalloutX, y: nextCalloutY })
      onDragCallout(issue.id, nextX, nextY)
    },
    [canDrag, issue.id, onDragCallout, setDragCursor, stageHeight, stageWidth],
  )

  return (
    <>
      <MemoIssueConnectorLine
        pinX={displayPinX}
        pinY={displayPinY}
        calloutX={displayCalloutX}
        calloutY={displayCalloutY}
        stroke={isSelected ? '#2563eb' : pinColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
      />
      <MemoIssuePinMarker
        issue={issue}
        pinX={displayPinX}
        pinY={displayPinY}
        pinColor={pinColor}
        displayNo={pinNo}
        isSelected={isSelected}
        isDragging={isDraggingPin}
        canDrag={canDrag}
        onSelect={onSelect}
        onEdit={onEdit}
        onPinDragMove={handlePinDragMove}
        onPinDragStart={handlePinDragStart}
        onPinDragEnd={handlePinDragEnd}
        onPinMouseEnter={handlePinMouseEnter}
        onPinMouseLeave={handlePinMouseLeave}
      />
      <MemoIssueCalloutLabel
        issue={issue}
        calloutX={displayCalloutX}
        calloutY={displayCalloutY}
        calloutBg={calloutBg}
        calloutStroke={calloutStroke}
        calloutStrokeWidth={calloutStrokeWidth}
        calloutText={calloutText}
        isSelected={isSelected}
        isDragging={isDraggingCallout}
        canDrag={canDrag}
        onSelect={onSelect}
        onEdit={onEdit}
        onDeleteRequest={onDeleteRequest}
        onCalloutDragMove={handleCalloutDragMove}
        onCalloutDragStart={handleCalloutDragStart}
        onCalloutDragEnd={handleCalloutDragEnd}
        onCalloutMouseEnter={handleCalloutMouseEnter}
        onCalloutMouseLeave={handleCalloutMouseLeave}
      />
    </>
  )
}

function areIssuePinPropsEqual(prev: IssuePinProps, next: IssuePinProps): boolean {
  if (prev.stageWidth !== next.stageWidth) return false
  if (prev.stageHeight !== next.stageHeight) return false
  if (prev.isSelected !== next.isSelected) return false
  if (prev.canDrag !== next.canDrag) return false
  if (prev.issue.id !== next.issue.id) return false
  if (prev.issue.no !== next.issue.no) return false
  if (prev.issue.exportNo !== next.issue.exportNo) return false
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

  const prevDrag = prev.dragOverride
  const nextDrag = next.dragOverride
  if (prevDrag?.pin_x !== nextDrag?.pin_x) return false
  if (prevDrag?.pin_y !== nextDrag?.pin_y) return false
  if (prevDrag?.callout_x !== nextDrag?.callout_x) return false
  if (prevDrag?.callout_y !== nextDrag?.callout_y) return false

  return true
}

export const IssuePin = memo(IssuePinComponent, areIssuePinPropsEqual)
