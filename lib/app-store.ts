'use client'

import { createContext, useContext } from 'react'
import type { Project, Issue, Contractor } from './types'

export type AppPage =
  | { type: 'login' }
  | { type: 'projects' }
  | { type: 'project-detail'; projectId: string }
  | { type: 'drawing-editor'; projectId: string; drawingId: string }
  | { type: 'pdf-export'; projectId: string }

export interface AppState {
  currentPage: AppPage
  projects: Project[]
  navigate: (page: AppPage) => void
  addIssue: (projectId: string, drawingId: string, issue: Issue) => void
  updateIssue: (projectId: string, drawingId: string, issueId: string, updates: Partial<Issue>) => void
  deleteIssue: (projectId: string, drawingId: string, issueId: string) => void
}

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
