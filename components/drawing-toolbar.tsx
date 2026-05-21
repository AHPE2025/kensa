'use client'

import {
  ArrowLeft,
  MapPin,
  Pencil,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Drawing } from '@/lib/domain'
import type { EditorMode } from '@/lib/stores/editor-store'

interface DrawingToolbarProps {
  drawings: Drawing[]
  currentFloorLabel: string
  currentDrawingIndex: number
  totalDrawings: number
  mode: EditorMode
  zoom: number
  rotation: number
  onBack: () => void
  onChangeDrawing: (floorLabel: string) => void
  onChangeMode: (mode: EditorMode) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onPrevDrawing: () => void
  onNextDrawing: () => void
  onRotate: () => void
}

export function DrawingToolbar({
  drawings,
  currentFloorLabel,
  currentDrawingIndex,
  totalDrawings,
  mode,
  zoom,
  rotation,
  onBack,
  onChangeDrawing,
  onChangeMode,
  onZoomIn,
  onZoomOut,
  onPrevDrawing,
  onNextDrawing,
  onRotate,
}: DrawingToolbarProps) {
  const displayIndex = currentDrawingIndex >= 0 ? currentDrawingIndex + 1 : 1
  const displayTotal = totalDrawings > 0 ? totalDrawings : 1

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border bg-white px-3 py-2">
      <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div className="h-6 w-px bg-border" />

      <Select value={currentFloorLabel} onValueChange={onChangeDrawing}>
        <SelectTrigger className="h-9 w-28">
          <SelectValue placeholder="階選択" />
        </SelectTrigger>
        <SelectContent>
          {drawings.map((d) => (
            <SelectItem key={d.id} value={d.floor_label}>
              {d.floor_label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={currentDrawingIndex <= 0}
          onClick={onPrevDrawing}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground min-w-[56px] text-center whitespace-nowrap">
          {displayIndex}/{displayTotal} 図面
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={currentDrawingIndex < 0 || currentDrawingIndex >= totalDrawings - 1}
          onClick={onNextDrawing}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs font-mono text-muted-foreground min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-6 w-px bg-border" />
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onRotate}>
        <RefreshCw className="h-4 w-4" />
        {rotation}°
      </Button>

      <ToggleGroup
        type="single"
        value={mode === 'add' || mode === 'edit' ? mode : ''}
        onValueChange={(value) => {
          onChangeMode(value ? (value as EditorMode) : 'view')
        }}
        className="gap-1"
      >
        <ToggleGroupItem value="add" aria-label="ピン追加モード" className="h-9 gap-1.5 px-3 text-xs">
          <MapPin className="h-4 w-4" />
          <span className="hidden sm:inline">ピン追加</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="edit" aria-label="編集モード" className="h-9 gap-1.5 px-3 text-xs">
          <Pencil className="h-4 w-4" />
          <span className="hidden sm:inline">編集</span>
        </ToggleGroupItem>
      </ToggleGroup>
    </header>
  )
}
