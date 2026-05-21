'use client'

import { memo, useCallback, useRef } from 'react'
import { Circle, Group, Label, Line, Tag, Text as KonvaText } from 'react-konva'
import type Konva from 'konva'
import type { Issue } from '@/lib/domain'

type NumberedIssue = Issue & { no: number }

type IssuePinProps = {
  issue: NumberedIssue
  stageWidth: number
  stageHeight: number
  isSelected: boolean
  canDrag: boolean
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onDeleteRequest: (issue: NumberedIssue) => void
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
  lineRef,
}: {
  pinX: number
  pinY: number
  calloutX: number
  calloutY: number
  stroke: string
  strokeWidth: number
  lineRef: React.RefObject<Konva.Line | null>
}) {
  return (
    <Line
      ref={lineRef}
      points={[pinX, pinY, calloutX, calloutY]}
      stroke={stroke}
      strokeWidth={strokeWidth}
      dash={[6, 4]}
      listening={false}
    />
  )
}

const MemoIssueConnectorLine = memo(IssueConnectorLine)

function IssuePinMarker({
  issue,
  pinX,
  pinY,
  pinColor,
  isSelected,
  canDrag,
  onSelect,
  onEdit,
  onPinDragMove,
  onPinDragStart,
  onPinDragEnd,
}: {
  issue: NumberedIssue
  pinX: number
  pinY: number
  pinColor: string
  isSelected: boolean
  canDrag: boolean
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onPinDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void
  onPinDragStart: (event: Konva.KonvaEventObject<DragEvent>) => void
  onPinDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void
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
    >
      <Circle
        x={0}
        y={0}
        radius={13}
        fill={pinColor}
        stroke="#ffffff"
        strokeWidth={isSelected ? 4 : 2}
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
        text={String(issue.no)}
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
  canDrag,
  onSelect,
  onEdit,
  onDeleteRequest,
  onCalloutDragMove,
  onCalloutDragStart,
  onCalloutDragEnd,
}: {
  issue: NumberedIssue
  calloutX: number
  calloutY: number
  calloutBg: string
  calloutStroke: string
  calloutStrokeWidth: number
  calloutText: string
  isSelected: boolean
  canDrag: boolean
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onDeleteRequest: (issue: NumberedIssue) => void
  onCalloutDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void
  onCalloutDragStart: (event: Konva.KonvaEventObject<DragEvent>) => void
  onCalloutDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void
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
    >
      <Tag
        fill={calloutBg}
        stroke={calloutStroke}
        strokeWidth={calloutStrokeWidth}
        cornerRadius={6}
        shadowBlur={isSelected ? 8 : 0}
        shadowOpacity={0.2}
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
  onSelect,
  onEdit,
  onDeleteRequest,
  onDragPin,
  onDragCallout,
}: IssuePinProps) {
  const lineRef = useRef<Konva.Line>(null)
  const pinDragRafRef = useRef<number | null>(null)
  const calloutDragRafRef = useRef<number | null>(null)
  const pendingPinLineRef = useRef<{ x: number; y: number } | null>(null)
  const pendingCalloutLineRef = useRef<{ x: number; y: number } | null>(null)

  const pinX = issue.pin_x * stageWidth
  const pinY = issue.pin_y * stageHeight
  const calloutX = issue.callout_x * stageWidth
  const calloutY = issue.callout_y * stageHeight

  const isDone = issue.status === '完了' || issue.status === 'done'
  const isInProgress = issue.status === '対応中'
  const basePinColor = isDone ? '#16a34a' : isInProgress ? '#d97706' : '#2563eb'
  const pinColor = isSelected ? '#dc2626' : basePinColor
  const calloutBg = isSelected ? '#eff6ff' : isDone ? '#f0fdf4' : isInProgress ? '#fffbeb' : '#eff6ff'
  const calloutStroke = isSelected ? '#2563eb' : pinColor
  const calloutStrokeWidth = isSelected ? 2.5 : 1
  const contractorLabel = issue.issue_category === 'common' ? '共通指摘' : issue.contractor?.name ?? '業者未定'
  const photoLines = [
    issue.before_photo_path || issue.before_photo_url ? 'ビフォー写真あり' : '',
    issue.after_photo_path || issue.after_photo_url ? 'アフター写真あり' : '',
  ]
    .filter(Boolean)
    .join('\n')
  const calloutText = [
    `#${issue.no} ${issue.issue_type}`,
    issue.issue_text?.trim() ? issue.issue_text.slice(0, 30) : '未入力',
    contractorLabel,
    photoLines,
  ]
    .filter(Boolean)
    .join('\n')

  const updateLinePoints = useCallback((px: number, py: number, cx: number, cy: number) => {
    const line = lineRef.current
    if (!line) return
    line.points([px, py, cx, cy])
    line.getLayer()?.batchDraw()
  }, [])

  const setDragCursor = useCallback((grabbing: boolean) => {
    if (!canDrag) return
    document.body.style.cursor = grabbing ? 'grabbing' : 'grab'
  }, [canDrag])

  const handlePinDragStart = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      event.target.opacity(0.85)
      setDragCursor(true)
    },
    [canDrag, setDragCursor],
  )

  const handlePinDragMove = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      const group = event.target
      pendingPinLineRef.current = { x: group.x(), y: group.y() }
      if (pinDragRafRef.current !== null) return
      pinDragRafRef.current = requestAnimationFrame(() => {
        pinDragRafRef.current = null
        const pending = pendingPinLineRef.current
        if (!pending) return
        updateLinePoints(pending.x, pending.y, calloutX, calloutY)
      })
    },
    [canDrag, calloutX, calloutY, updateLinePoints],
  )

  const handlePinDragEnd = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      if (pinDragRafRef.current !== null) {
        cancelAnimationFrame(pinDragRafRef.current)
        pinDragRafRef.current = null
      }
      const group = event.target
      group.opacity(1)
      setDragCursor(false)
      const nextX = clampRatio(group.x() / stageWidth)
      const nextY = clampRatio(group.y() / stageHeight)
      const nextPinX = nextX * stageWidth
      const nextPinY = nextY * stageHeight
      group.position({ x: nextPinX, y: nextPinY })
      updateLinePoints(nextPinX, nextPinY, calloutX, calloutY)
      onDragPin(issue.id, nextX, nextY)
    },
    [canDrag, calloutX, calloutY, issue.id, onDragPin, setDragCursor, stageHeight, stageWidth, updateLinePoints],
  )

  const handleCalloutDragStart = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      event.target.opacity(0.85)
      setDragCursor(true)
    },
    [canDrag, setDragCursor],
  )

  const handleCalloutDragMove = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      const label = event.target
      pendingCalloutLineRef.current = { x: label.x(), y: label.y() }
      if (calloutDragRafRef.current !== null) return
      calloutDragRafRef.current = requestAnimationFrame(() => {
        calloutDragRafRef.current = null
        const pending = pendingCalloutLineRef.current
        if (!pending) return
        updateLinePoints(pinX, pinY, pending.x, pending.y)
      })
    },
    [canDrag, pinX, pinY, updateLinePoints],
  )

  const handleCalloutDragEnd = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      if (calloutDragRafRef.current !== null) {
        cancelAnimationFrame(calloutDragRafRef.current)
        calloutDragRafRef.current = null
      }
      const label = event.target
      label.opacity(1)
      setDragCursor(false)
      const nextX = clampRatio(label.x() / stageWidth)
      const nextY = clampRatio(label.y() / stageHeight)
      const nextCalloutX = nextX * stageWidth
      const nextCalloutY = nextY * stageHeight
      label.position({ x: nextCalloutX, y: nextCalloutY })
      updateLinePoints(pinX, pinY, nextCalloutX, nextCalloutY)
      onDragCallout(issue.id, nextX, nextY)
    },
    [canDrag, issue.id, onDragCallout, pinX, pinY, setDragCursor, stageHeight, stageWidth, updateLinePoints],
  )

  return (
    <>
      <MemoIssueConnectorLine
        pinX={pinX}
        pinY={pinY}
        calloutX={calloutX}
        calloutY={calloutY}
        stroke={isSelected ? '#2563eb' : pinColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        lineRef={lineRef}
      />
      <MemoIssuePinMarker
        issue={issue}
        pinX={pinX}
        pinY={pinY}
        pinColor={pinColor}
        isSelected={isSelected}
        canDrag={canDrag}
        onSelect={onSelect}
        onEdit={onEdit}
        onPinDragMove={handlePinDragMove}
        onPinDragStart={handlePinDragStart}
        onPinDragEnd={handlePinDragEnd}
      />
      <MemoIssueCalloutLabel
        issue={issue}
        calloutX={calloutX}
        calloutY={calloutY}
        calloutBg={calloutBg}
        calloutStroke={calloutStroke}
        calloutStrokeWidth={calloutStrokeWidth}
        calloutText={calloutText}
        isSelected={isSelected}
        canDrag={canDrag}
        onSelect={onSelect}
        onEdit={onEdit}
        onDeleteRequest={onDeleteRequest}
        onCalloutDragMove={handleCalloutDragMove}
        onCalloutDragStart={handleCalloutDragStart}
        onCalloutDragEnd={handleCalloutDragEnd}
      />
    </>
  )
}

export const IssuePin = memo(IssuePinComponent)
