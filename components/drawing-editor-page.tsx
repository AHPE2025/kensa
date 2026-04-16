'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { MapPin, Users, Download, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApp } from '@/lib/app-store'
import { CONTRACTORS } from '@/lib/mock-data'
import type { Issue, IssueCategory } from '@/lib/types'
import { IssuePin } from './issue-pin'
import { IssueModal } from './issue-modal'
import { IssueListPanel } from './issue-list-panel'
import { ContractorFilter } from './contractor-filter'
import { DrawingToolbar, type EditorMode } from './drawing-toolbar'
import { toast } from 'sonner'

interface DrawingEditorPageProps {
  projectId: string
  drawingId: string
}

export function DrawingEditorPage({ projectId, drawingId }: DrawingEditorPageProps) {
  const { projects, navigate, addIssue, updateIssue } = useApp()
  const project = projects.find((p) => p.id === projectId)
  const [currentDrawingId, setCurrentDrawingId] = useState(drawingId)

  const drawing = project?.drawings.find((d) => d.id === currentDrawingId)
  const drawings = project?.drawings ?? []

  const [mode, setMode] = useState<EditorMode>('pin')
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState('issues')

  const [visibleContractors, setVisibleContractors] = useState<Set<string>>(
    () => new Set(CONTRACTORS.map((c) => c.id))
  )

  const issues = drawing?.issues ?? []

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (mode !== 'pin') return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      setPendingPin({ x, y })
      setModalOpen(true)
    },
    [mode]
  )

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (mode !== 'move') return
      setIsPanning(true)
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: panOffset.x,
        oy: panOffset.y,
      }
    },
    [mode, panOffset]
  )

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning || !panStartRef.current) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPanOffset({
        x: panStartRef.current.ox + dx,
        y: panStartRef.current.oy + dy,
      })
    },
    [isPanning]
  )

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false)
    panStartRef.current = null
  }, [])

  const handleSaveIssue = useCallback(
    (data: { floor: string; category: IssueCategory; content: string; contractorId: string }) => {
      if (!pendingPin || !drawing) return
      const contractor = CONTRACTORS.find((c) => c.id === data.contractorId)
      const newIssue: Issue = {
        id: `i-${Date.now()}`,
        number: issues.length + 1,
        floor: data.floor,
        category: data.category,
        content: data.content,
        contractorId: data.contractorId,
        contractorName: contractor?.name ?? '',
        x: pendingPin.x,
        y: pendingPin.y,
        labelX: Math.min(pendingPin.x + 8, 88),
        labelY: Math.max(pendingPin.y - 8, 2),
        resolved: false,
        createdAt: new Date().toISOString().split('T')[0],
      }
      addIssue(projectId, currentDrawingId, newIssue)
      setModalOpen(false)
      setPendingPin(null)
      toast.success('指摘を追加しました')
    },
    [pendingPin, drawing, issues.length, addIssue, projectId, currentDrawingId]
  )

  const handleSaveAndNext = useCallback(
    (data: { floor: string; category: IssueCategory; content: string; contractorId: string }) => {
      if (!pendingPin || !drawing) return
      const contractor = CONTRACTORS.find((c) => c.id === data.contractorId)
      const newIssue: Issue = {
        id: `i-${Date.now()}`,
        number: issues.length + 1,
        floor: data.floor,
        category: data.category,
        content: data.content,
        contractorId: data.contractorId,
        contractorName: contractor?.name ?? '',
        x: pendingPin.x,
        y: pendingPin.y,
        labelX: Math.min(pendingPin.x + 8, 88),
        labelY: Math.max(pendingPin.y - 8, 2),
        resolved: false,
        createdAt: new Date().toISOString().split('T')[0],
      }
      addIssue(projectId, currentDrawingId, newIssue)
      setPendingPin(null)
      setModalOpen(false)
      toast.success('指摘を追加しました。次のピンを配置してください。')
    },
    [pendingPin, drawing, issues.length, addIssue, projectId, currentDrawingId]
  )

  const handleLabelDrag = useCallback(
    (issueId: string, labelX: number, labelY: number) => {
      updateIssue(projectId, currentDrawingId, issueId, { labelX, labelY })
    },
    [updateIssue, projectId, currentDrawingId]
  )

  const handleSelectIssue = useCallback((issue: Issue) => {
    setSelectedIssue(issue)
  }, [])

  const toggleContractor = useCallback((contractorId: string) => {
    setVisibleContractors((prev) => {
      const next = new Set(prev)
      if (next.has(contractorId)) {
        next.delete(contractorId)
      } else {
        next.add(contractorId)
      }
      return next
    })
  }, [])

  const showAllContractors = useCallback(() => {
    setVisibleContractors(new Set(CONTRACTORS.map((c) => c.id)))
  }, [])

  const showOnlyContractor = useCallback((contractorId: string) => {
    setVisibleContractors(new Set([contractorId]))
  }, [])

  const currentIndex = drawings.findIndex((d) => d.id === currentDrawingId)

  if (!project || !drawing) return null

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      {/* Toolbar */}
      <DrawingToolbar
        drawings={drawings}
        currentDrawing={drawing}
        mode={mode}
        zoom={zoom}
        onBack={() => navigate({ type: 'project-detail', projectId })}
        onChangeDrawing={setCurrentDrawingId}
        onChangeMode={setMode}
        onZoomIn={() => setZoom((z) => Math.min(z + 0.25, 3))}
        onZoomOut={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
        onPrevDrawing={() => {
          if (currentIndex > 0) setCurrentDrawingId(drawings[currentIndex - 1].id)
        }}
        onNextDrawing={() => {
          if (currentIndex < drawings.length - 1) setCurrentDrawingId(drawings[currentIndex + 1].id)
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card lg:w-80">
            <Tabs value={sidebarTab} onValueChange={setSidebarTab} className="flex flex-1 flex-col">
              <TabsList className="mx-3 mt-2 h-9">
                <TabsTrigger value="issues" className="flex-1 text-xs gap-1">
                  <MapPin className="h-3 w-3" />
                  指摘一覧
                </TabsTrigger>
                <TabsTrigger value="contractors" className="flex-1 text-xs gap-1">
                  <Users className="h-3 w-3" />
                  業者表示
                </TabsTrigger>
              </TabsList>
              <TabsContent value="issues" className="flex-1 overflow-hidden mt-0">
                <IssueListPanel
                  issues={issues}
                  selectedIssue={selectedIssue}
                  onSelectIssue={handleSelectIssue}
                />
              </TabsContent>
              <TabsContent value="contractors" className="flex-1 overflow-hidden mt-0">
                <ContractorFilter
                  visibleContractors={visibleContractors}
                  onToggle={toggleContractor}
                  onShowAll={showAllContractors}
                  onShowOnly={showOnlyContractor}
                />
              </TabsContent>
            </Tabs>
          </aside>
        )}

        {/* Main canvas area */}
        <div className="relative flex-1 overflow-hidden">
          {/* Sidebar toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-2 z-30 h-8 w-8 bg-card/80 backdrop-blur-sm shadow-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>

          {/* Canvas */}
          <div
            className="h-full w-full overflow-hidden"
            style={{
              cursor: mode === 'move' ? (isPanning ? 'grabbing' : 'grab') : mode === 'pin' ? 'crosshair' : 'default',
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            <div
              className="drawing-canvas relative h-full w-full"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
              onClick={handleCanvasClick}
            >
              {/* Blueprint-style background */}
              <div className="absolute inset-0 bg-card">
                {/* Grid pattern */}
                <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="oklch(0.90 0.015 250)" strokeWidth="0.5" />
                    </pattern>
                    <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                      <rect width="100" height="100" fill="url(#smallGrid)" />
                      <path d="M 100 0 L 0 0 0 100" fill="none" stroke="oklch(0.85 0.02 250)" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>

                {/* Floor plan mockup lines */}
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 700">
                  {/* Outer walls */}
                  <rect x="50" y="50" width="900" height="600" fill="none" stroke="oklch(0.35 0.03 250)" strokeWidth="4" />

                  {/* Room dividers */}
                  <line x1="400" y1="50" x2="400" y2="400" stroke="oklch(0.4 0.03 250)" strokeWidth="3" />
                  <line x1="400" y1="400" x2="950" y2="400" stroke="oklch(0.4 0.03 250)" strokeWidth="3" />
                  <line x1="650" y1="50" x2="650" y2="400" stroke="oklch(0.4 0.03 250)" strokeWidth="3" />
                  <line x1="50" y1="400" x2="400" y2="400" stroke="oklch(0.4 0.03 250)" strokeWidth="3" />
                  <line x1="200" y1="400" x2="200" y2="650" stroke="oklch(0.4 0.03 250)" strokeWidth="3" />
                  <line x1="650" y1="400" x2="650" y2="650" stroke="oklch(0.4 0.03 250)" strokeWidth="3" />

                  {/* Doors */}
                  <path d="M 380 400 A 20 20 0 0 1 400 380" fill="none" stroke="oklch(0.5 0.03 250)" strokeWidth="1.5" />
                  <path d="M 630 400 A 20 20 0 0 0 650 380" fill="none" stroke="oklch(0.5 0.03 250)" strokeWidth="1.5" />
                  <path d="M 200 630 A 20 20 0 0 1 220 650" fill="none" stroke="oklch(0.5 0.03 250)" strokeWidth="1.5" />

                  {/* Windows */}
                  <line x1="150" y1="50" x2="300" y2="50" stroke="oklch(0.55 0.15 250)" strokeWidth="5" />
                  <line x1="500" y1="50" x2="600" y2="50" stroke="oklch(0.55 0.15 250)" strokeWidth="5" />
                  <line x1="750" y1="50" x2="900" y2="50" stroke="oklch(0.55 0.15 250)" strokeWidth="5" />
                  <line x1="950" y1="150" x2="950" y2="350" stroke="oklch(0.55 0.15 250)" strokeWidth="5" />
                  <line x1="50" y1="500" x2="50" y2="600" stroke="oklch(0.55 0.15 250)" strokeWidth="5" />

                  {/* Room labels */}
                  <text x="200" y="230" textAnchor="middle" fill="oklch(0.5 0.02 250)" fontSize="18" fontFamily="sans-serif">リビング</text>
                  <text x="525" y="230" textAnchor="middle" fill="oklch(0.5 0.02 250)" fontSize="18" fontFamily="sans-serif">洋室1</text>
                  <text x="800" y="230" textAnchor="middle" fill="oklch(0.5 0.02 250)" fontSize="18" fontFamily="sans-serif">洋室2</text>
                  <text x="120" y="530" textAnchor="middle" fill="oklch(0.5 0.02 250)" fontSize="16" fontFamily="sans-serif">洗面所</text>
                  <text x="420" y="530" textAnchor="middle" fill="oklch(0.5 0.02 250)" fontSize="16" fontFamily="sans-serif">廊下</text>
                  <text x="800" y="530" textAnchor="middle" fill="oklch(0.5 0.02 250)" fontSize="16" fontFamily="sans-serif">キッチン</text>

                  {/* Dimensions */}
                  <text x="500" y="35" textAnchor="middle" fill="oklch(0.6 0.02 250)" fontSize="12" fontFamily="monospace">10,000</text>
                  <text x="30" y="350" textAnchor="middle" fill="oklch(0.6 0.02 250)" fontSize="12" fontFamily="monospace" transform="rotate(-90, 30, 350)">7,000</text>

                  {/* Floor label */}
                  <text x="900" y="635" textAnchor="end" fill="oklch(0.45 0.03 250)" fontSize="22" fontWeight="bold" fontFamily="sans-serif">{drawing.floor} 平面図</text>
                </svg>
              </div>

              {/* Issue pins */}
              {issues.map((issue) => (
                <IssuePin
                  key={issue.id}
                  issue={issue}
                  isSelected={selectedIssue?.id === issue.id}
                  isFiltered={visibleContractors.has(issue.contractorId)}
                  onSelect={handleSelectIssue}
                  onLabelDrag={handleLabelDrag}
                />
              ))}
            </div>
          </div>

          {/* Quick Action Buttons - bottom right */}
          <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-2">
            <Button
              size="lg"
              className="h-12 gap-2 shadow-lg"
              onClick={() => setMode('pin')}
              variant={mode === 'pin' ? 'default' : 'secondary'}
            >
              <MapPin className="h-5 w-5" />
              <span className="hidden sm:inline">ピン追加</span>
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-12 gap-2 shadow-lg"
              onClick={() => {
                setSidebarOpen(true)
                setSidebarTab('contractors')
              }}
            >
              <Users className="h-5 w-5" />
              <span className="hidden sm:inline">業者フィルタ</span>
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-12 gap-2 shadow-lg"
              onClick={() => navigate({ type: 'pdf-export', projectId })}
            >
              <Download className="h-5 w-5" />
              <span className="hidden sm:inline">PDF出力</span>
            </Button>
          </div>

          {/* Mode indicator */}
          {mode === 'pin' && (
            <div className="absolute left-1/2 top-2 z-30 -translate-x-1/2 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-md">
              図面上をクリックしてピンを追加
            </div>
          )}
        </div>
      </div>

      {/* Issue Modal */}
      <IssueModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setPendingPin(null)
        }}
        onSave={handleSaveIssue}
        onSaveAndNext={handleSaveAndNext}
        defaultFloor={drawing.floor}
      />
    </div>
  )
}
