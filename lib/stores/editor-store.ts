'use client'

import { create } from 'zustand'
import type { Issue } from '@/lib/domain'

export type EditorMode = 'move' | 'add' | 'edit'

type EditorStore = {
  mode: EditorMode
  zoom: number
  pan: { x: number; y: number }
  contractorFilter: string
  searchText: string
  focusedIssueId: string | null
  issues: Issue[]
  setIssues: (issues: Issue[]) => void
  setMode: (mode: EditorMode) => void
  setZoom: (zoom: number) => void
  setPan: (pan: { x: number; y: number }) => void
  setContractorFilter: (value: string) => void
  setSearchText: (value: string) => void
  setFocusedIssueId: (value: string | null) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  mode: 'move',
  zoom: 1,
  pan: { x: 0, y: 0 },
  contractorFilter: 'all',
  searchText: '',
  focusedIssueId: null,
  issues: [],
  setIssues: (issues) => set({ issues }),
  setMode: (mode) => set({ mode }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (pan) => set({ pan }),
  setContractorFilter: (contractorFilter) => set({ contractorFilter }),
  setSearchText: (searchText) => set({ searchText }),
  setFocusedIssueId: (focusedIssueId) => set({ focusedIssueId }),
}))
