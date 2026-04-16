'use client'

import {
  ArrowLeft,
  Hand,
  MapPin,
  Pencil,
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
import type { Drawing } from '@/lib/types'

export type EditorMode = 'move' | 'pin' | 'edit'

interface DrawingToolbarProps {
  drawings: Drawing[]
  currentDrawing: Drawing
  mode: EditorMode
  zoom: number
  onBack: () => void
  onChangeDrawing: (drawingId: string) => void
  onChangeMode: (mode: EditorMode) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onPrevDrawing: () => void
  onNextDrawing: () => void
}

export function DrawingToolbar({
  drawings,
  currentDrawing,
  mode,
  zoom,
  onBack,
  onChangeDrawing,
  onChangeMode,
  onZoomIn,
  onZoomOut,
  onPrevDrawing,
  onNextDrawing,
}: DrawingToolbarProps) {
  const currentIndex = drawings.findIndex((d) => d.id === currentDrawing.id)

  return (
    <header className="flex h-14 items-center gap-2 border-b border-border bg-card px-3">
      {/* Back */}
      <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div className="h-6 w-px bg-border" />

      {/* Floor select */}
      <Select value={currentDrawing.id} onValueChange={onChangeDrawing}>
        <SelectTrigger className="h-9 w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {drawings.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.floor}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Page nav */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={currentIndex <= 0}
          onClick={onPrevDrawing}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground min-w-[40px] text-center">
          {currentIndex + 1}/{drawings.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={currentIndex >= drawings.length - 1}
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

      {/* Mode toggle */}
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && onChangeMode(v as EditorMode)}
        className="gap-1"
      >
        <ToggleGroupItem value="move" aria-label="移動モード" className="h-9 gap-1.5 px-3 text-xs">
          <Hand className="h-4 w-4" />
          <span className="hidden sm:inline">移動</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="pin" aria-label="ピン追加モード" className="h-9 gap-1.5 px-3 text-xs">
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
