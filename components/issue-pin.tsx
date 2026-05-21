'use client'

import { useState } from 'react'
import { Circle, Group, Label, Line, Tag, Text as KonvaText } from 'react-konva'
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

export function IssuePin({
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
  const [dragPinPos, setDragPinPos] = useState<{ x: number; y: number } | null>(null)
  const [dragCalloutPos, setDragCalloutPos] = useState<{ x: number; y: number } | null>(null)

  const pinRatioX = dragPinPos?.x ?? issue.pin_x
  const pinRatioY = dragPinPos?.y ?? issue.pin_y
  const calloutRatioX = dragCalloutPos?.x ?? issue.callout_x
  const calloutRatioY = dragCalloutPos?.y ?? issue.callout_y

  const pinX = pinRatioX * stageWidth
  const pinY = pinRatioY * stageHeight
  const calloutX = calloutRatioX * stageWidth
  const calloutY = calloutRatioY * stageHeight

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
    <>
      <Line
        points={[pinX, pinY, calloutX, calloutY]}
        stroke={isSelected ? '#2563eb' : pinColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        dash={[6, 4]}
      />
      <Group
        x={pinX}
        y={pinY}
        draggable={canDrag}
        onClick={handleSelect}
        onTap={handleSelect}
        onDblClick={handleEdit}
        onDblTap={handleEdit}
        onDragMove={(event) => {
          if (!canDrag) return
          setDragPinPos({
            x: event.target.x() / stageWidth,
            y: event.target.y() / stageHeight,
          })
        }}
        onDragEnd={(event) => {
          if (!canDrag) return
          const nextX = clampRatio(event.target.x() / stageWidth)
          const nextY = clampRatio(event.target.y() / stageHeight)
          event.target.position({ x: nextX * stageWidth, y: nextY * stageHeight })
          setDragPinPos(null)
          onDragPin(issue.id, nextX, nextY)
        }}
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
      <Label
        x={calloutX}
        y={calloutY}
        draggable={canDrag}
        onClick={handleSelect}
        onTap={handleSelect}
        onDblClick={handleEdit}
        onDblTap={handleEdit}
        onDragMove={(event) => {
          if (!canDrag) return
          setDragCalloutPos({
            x: event.target.x() / stageWidth,
            y: event.target.y() / stageHeight,
          })
        }}
        onDragEnd={(event) => {
          if (!canDrag) return
          const nextX = clampRatio(event.target.x() / stageWidth)
          const nextY = clampRatio(event.target.y() / stageHeight)
          event.target.position({ x: nextX * stageWidth, y: nextY * stageHeight })
          setDragCalloutPos(null)
          onDragCallout(issue.id, nextX, nextY)
        }}
      >
        <Tag
          fill={calloutBg}
          stroke={calloutStroke}
          strokeWidth={calloutStrokeWidth}
          cornerRadius={6}
          shadowBlur={isSelected ? 8 : 0}
          shadowOpacity={0.2}
        />
        <KonvaText
          padding={8}
          fontSize={11}
          lineHeight={1.3}
          fill="#0f172a"
          text={calloutText}
        />
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
    </>
  )
}
