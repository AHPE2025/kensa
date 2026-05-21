'use client'

import { Circle, Label, Line, Tag, Text as KonvaText } from 'react-konva'
import type { Issue } from '@/lib/domain'

type NumberedIssue = Issue & { no: number }

type IssuePinProps = {
  issue: NumberedIssue
  stageWidth: number
  stageHeight: number
  isSelected: boolean
  canDragCallout: boolean
  onSelect: (issue: NumberedIssue) => void
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
  canDragCallout,
  onSelect,
  onDragCallout,
}: IssuePinProps) {
  const pinX = issue.pin_x * stageWidth
  const pinY = issue.pin_y * stageHeight
  const calloutX = issue.callout_x * stageWidth
  const calloutY = issue.callout_y * stageHeight
  const isDone = issue.status === '完了' || issue.status === 'done'
  const isInProgress = issue.status === '対応中'
  const basePinColor = isDone ? '#16a34a' : isInProgress ? '#d97706' : '#2563eb'
  const pinColor = isSelected ? '#dc2626' : basePinColor
  const calloutBg = isSelected ? '#fee2e2' : isDone ? '#f0fdf4' : isInProgress ? '#fffbeb' : '#eff6ff'
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

  return (
    <>
      <Line
        points={[pinX, pinY, calloutX, calloutY]}
        stroke={pinColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        dash={[6, 4]}
      />
      <Circle
        x={pinX}
        y={pinY}
        radius={13}
        fill={pinColor}
        stroke="#ffffff"
        strokeWidth={2}
        onClick={(event) => {
          event.cancelBubble = true
          onSelect(issue)
        }}
      />
      <KonvaText
        x={pinX - 8}
        y={pinY - 9}
        width={16}
        height={16}
        align="center"
        verticalAlign="middle"
        fontSize={10}
        fontStyle="bold"
        fill="#ffffff"
        text={String(issue.no)}
        onClick={(event) => {
          event.cancelBubble = true
          onSelect(issue)
        }}
      />
      <Label
        x={calloutX}
        y={calloutY}
        draggable={canDragCallout}
        onClick={(event) => {
          event.cancelBubble = true
          onSelect(issue)
        }}
        onDragEnd={(event) => {
          if (!canDragCallout) return
          const nextX = clampRatio(event.target.x() / stageWidth)
          const nextY = clampRatio(event.target.y() / stageHeight)
          onDragCallout(issue.id, nextX, nextY)
        }}
      >
        <Tag
          fill={calloutBg}
          stroke={pinColor}
          strokeWidth={1}
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
      </Label>
    </>
  )
}
