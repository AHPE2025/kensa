'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
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
  onSelect: (issue: NumberedIssue) => void
  onEdit: (issue: NumberedIssue) => void
  onDeleteRequest: (issue: NumberedIssue) => void
  onDragPin: (issueId: string, pinX: number, pinY: number) => boolean | void | Promise<boolean | void>
  onDragCallout: (issueId: string, calloutX: number, calloutY: number) => boolean | void | Promise<boolean | void>
}

const CLICK_THRESHOLD_PX = 5

function clampRatio(value: number) {
  return Math.max(0.03, Math.min(0.97, value))
}

function toStageCoords(ratioX: number, ratioY: number, stageWidth: number, stageHeight: number) {
  return { x: ratioX * stageWidth, y: ratioY * stageHeight }
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

type PointerSession = {
  clientX: number
  clientY: number
  didDrag: boolean
}

function usePointerClickDrag({
  canDrag,
  onTap,
  onDragStart,
}: {
  canDrag: boolean
  onTap: () => void
  onDragStart: () => void
}) {
  const sessionRef = useRef<PointerSession | null>(null)

  const handlePointerDown = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent>) => {
      if (!canDrag) return
      const nativeEvent = event.evt
      sessionRef.current = {
        clientX: nativeEvent.clientX,
        clientY: nativeEvent.clientY,
        didDrag: false,
      }
      const captureTarget = nativeEvent.currentTarget as Element | null
      if (captureTarget?.setPointerCapture) {
        captureTarget.setPointerCapture(nativeEvent.pointerId)
      }
      nativeEvent.preventDefault()
    },
    [canDrag],
  )

  const handlePointerUp = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent>) => {
      const session = sessionRef.current
      sessionRef.current = null
      if (!canDrag || !session) return

      const nativeEvent = event.evt
      const captureTarget = nativeEvent.currentTarget as Element | null
      if (captureTarget?.releasePointerCapture) {
        try {
          captureTarget.releasePointerCapture(nativeEvent.pointerId)
        } catch {
          // pointer may already be released
        }
      }

      if (session.didDrag) return

      const dx = nativeEvent.clientX - session.clientX
      const dy = nativeEvent.clientY - session.clientY
      if (Math.hypot(dx, dy) < CLICK_THRESHOLD_PX) {
        onTap()
      }
    },
    [canDrag, onTap],
  )

  const handleDragStart = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.didDrag = true
    }
    onDragStart()
  }, [onDragStart])

  return { handlePointerDown, handlePointerUp, handleDragStart }
}

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
  onPointerDown,
  onPointerUp,
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
  onPointerDown: (event: Konva.KonvaEventObject<PointerEvent>) => void
  onPointerUp: (event: Konva.KonvaEventObject<PointerEvent>) => void
}) {
  const groupRef = useRef<Konva.Group>(null)

  useEffect(() => {
    if (isDragging || !groupRef.current) return
    groupRef.current.position({ x: pinX, y: pinY })
  }, [pinX, pinY, isDragging])

  const stopBubble = (event: { cancelBubble: boolean }) => {
    event.cancelBubble = true
  }

  const handleSelect = (event: { cancelBubble: boolean }) => {
    stopBubble(event)
    onSelect(issue)
  }

  return (
    <Group
      ref={groupRef}
      x={pinX}
      y={pinY}
      draggable={canDrag}
      onClick={canDrag ? undefined : handleSelect}
      onTap={canDrag ? undefined : handleSelect}
      onDblClick={canDrag ? undefined : () => onEdit(issue)}
      onDblTap={canDrag ? undefined : () => onEdit(issue)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
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
  onPointerDown,
  onPointerUp,
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
  onPointerDown: (event: Konva.KonvaEventObject<PointerEvent>) => void
  onPointerUp: (event: Konva.KonvaEventObject<PointerEvent>) => void
}) {
  const labelRef = useRef<Konva.Label>(null)

  useEffect(() => {
    if (isDragging || !labelRef.current) return
    labelRef.current.position({ x: calloutX, y: calloutY })
  }, [calloutX, calloutY, isDragging])

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
      ref={labelRef}
      x={calloutX}
      y={calloutY}
      draggable={canDrag}
      onClick={canDrag ? undefined : handleSelect}
      onTap={canDrag ? undefined : handleSelect}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
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
  onSelect,
  onEdit,
  onDeleteRequest,
  onDragPin,
  onDragCallout,
}: IssuePinProps) {
  const [isDraggingPin, setIsDraggingPin] = useState(false)
  const [isDraggingCallout, setIsDraggingCallout] = useState(false)
  const [linePin, setLinePin] = useState(() =>
    toStageCoords(issue.pin_x, issue.pin_y, stageWidth, stageHeight),
  )
  const [lineCallout, setLineCallout] = useState(() =>
    toStageCoords(issue.callout_x, issue.callout_y, stageWidth, stageHeight),
  )

  const lineRafRef = useRef<number | null>(null)
  const pendingLineRef = useRef<{ pin?: { x: number; y: number }; callout?: { x: number; y: number } }>(
    {},
  )

  const basePin = toStageCoords(issue.pin_x, issue.pin_y, stageWidth, stageHeight)
  const baseCallout = toStageCoords(issue.callout_x, issue.callout_y, stageWidth, stageHeight)

  useEffect(() => {
    if (isDraggingPin || isDraggingCallout) return
    const nextPin = toStageCoords(issue.pin_x, issue.pin_y, stageWidth, stageHeight)
    const nextCallout = toStageCoords(issue.callout_x, issue.callout_y, stageWidth, stageHeight)
    setLinePin(nextPin)
    setLineCallout(nextCallout)
  }, [
    issue.pin_x,
    issue.pin_y,
    issue.callout_x,
    issue.callout_y,
    stageWidth,
    stageHeight,
    isDraggingPin,
    isDraggingCallout,
  ])

  const scheduleLineUpdate = useCallback(() => {
    if (lineRafRef.current !== null) return
    lineRafRef.current = requestAnimationFrame(() => {
      lineRafRef.current = null
      const pending = pendingLineRef.current
      if (pending.pin) {
        setLinePin(pending.pin)
      }
      if (pending.callout) {
        setLineCallout(pending.callout)
      }
      pendingLineRef.current = {}
    })
  }, [])

  useEffect(() => {
    return () => {
      if (lineRafRef.current !== null) {
        cancelAnimationFrame(lineRafRef.current)
      }
    }
  }, [])

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

  const handlePinTap = useCallback(() => {
    onSelect(issue)
    onEdit(issue)
  }, [issue, onEdit, onSelect])

  const handleCalloutTap = useCallback(() => {
    onSelect(issue)
    onEdit(issue)
  }, [issue, onEdit, onSelect])

  const pinPointer = usePointerClickDrag({
    canDrag,
    onTap: handlePinTap,
    onDragStart: () => {
      if (!canDrag) return
      setIsDraggingPin(true)
      setDragCursor(true)
    },
  })

  const calloutPointer = usePointerClickDrag({
    canDrag,
    onTap: handleCalloutTap,
    onDragStart: () => {
      if (!canDrag) return
      setIsDraggingCallout(true)
      setDragCursor(true)
    },
  })

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
      pinPointer.handleDragStart()
      event.target.opacity(0.85)
    },
    [canDrag, pinPointer],
  )

  const handlePinDragMove = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      const group = event.target
      pendingLineRef.current.pin = { x: group.x(), y: group.y() }
      scheduleLineUpdate()
    },
    [canDrag, scheduleLineUpdate],
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
      const nextPin = toStageCoords(nextX, nextY, stageWidth, stageHeight)
      group.position(nextPin)
      pendingLineRef.current.pin = nextPin
      scheduleLineUpdate()

      void (async () => {
        const saved = await onDragPin(issue.id, nextX, nextY)
        if (saved === false) {
          group.position({ x: basePin.x, y: basePin.y })
          pendingLineRef.current.pin = { x: basePin.x, y: basePin.y }
          scheduleLineUpdate()
        }
      })()
    },
    [basePin.x, basePin.y, canDrag, issue.id, onDragPin, scheduleLineUpdate, setDragCursor, stageHeight, stageWidth],
  )

  const handleCalloutDragStart = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      calloutPointer.handleDragStart()
      event.target.opacity(0.85)
    },
    [calloutPointer, canDrag],
  )

  const handleCalloutDragMove = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!canDrag) return
      const label = event.target
      pendingLineRef.current.callout = { x: label.x(), y: label.y() }
      scheduleLineUpdate()
    },
    [canDrag, scheduleLineUpdate],
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
      const nextCallout = toStageCoords(nextX, nextY, stageWidth, stageHeight)
      label.position(nextCallout)
      pendingLineRef.current.callout = nextCallout
      scheduleLineUpdate()

      void (async () => {
        const saved = await onDragCallout(issue.id, nextX, nextY)
        if (saved === false) {
          label.position({ x: baseCallout.x, y: baseCallout.y })
          pendingLineRef.current.callout = { x: baseCallout.x, y: baseCallout.y }
          scheduleLineUpdate()
        }
      })()
    },
    [
      baseCallout.x,
      baseCallout.y,
      canDrag,
      issue.id,
      onDragCallout,
      scheduleLineUpdate,
      setDragCursor,
      stageHeight,
      stageWidth,
    ],
  )

  return (
    <>
      <MemoIssueConnectorLine
        pinX={linePin.x}
        pinY={linePin.y}
        calloutX={lineCallout.x}
        calloutY={lineCallout.y}
        stroke={isSelected ? '#2563eb' : pinColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
      />
      <MemoIssuePinMarker
        issue={issue}
        pinX={basePin.x}
        pinY={basePin.y}
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
        onPointerDown={pinPointer.handlePointerDown}
        onPointerUp={pinPointer.handlePointerUp}
      />
      <MemoIssueCalloutLabel
        issue={issue}
        calloutX={baseCallout.x}
        calloutY={baseCallout.y}
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
        onPointerDown={calloutPointer.handlePointerDown}
        onPointerUp={calloutPointer.handlePointerUp}
      />
    </>
  )
}

function areIssuePinPropsEqual(prev: IssuePinProps, next: IssuePinProps): boolean {
  if (prev.stageWidth !== next.stageWidth) return false
  if (prev.stageHeight !== next.stageHeight) return false
  if (prev.isSelected !== next.isSelected) return false
  if (prev.canDrag !== next.canDrag) return false
  if (prev.pdfExportMode !== next.pdfExportMode) return false
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

  return true
}

export const IssuePin = memo(IssuePinComponent, areIssuePinPropsEqual)
