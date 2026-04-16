'use client'

import { useState, useCallback, useMemo } from 'react'
import { AppContext, type AppPage, type AppState } from '@/lib/app-store'
import { MOCK_PROJECTS, CONTRACTORS } from '@/lib/mock-data'
import type { Project, Issue } from '@/lib/types'

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentPage, setCurrentPage] = useState<AppPage>({ type: 'login' })
  const [projects, setProjects] = useState<Project[]>(() =>
    MOCK_PROJECTS.map((p) => ({ ...p, contractors: CONTRACTORS }))
  )

  const navigate = useCallback((page: AppPage) => {
    setCurrentPage(page)
  }, [])

  const addIssue = useCallback((projectId: string, drawingId: string, issue: Issue) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        return {
          ...p,
          totalIssues: p.totalIssues + 1,
          unresolvedIssues: issue.resolved ? p.unresolvedIssues : p.unresolvedIssues + 1,
          drawings: p.drawings.map((d) => {
            if (d.id !== drawingId) return d
            return {
              ...d,
              issueCount: d.issueCount + 1,
              issues: [...d.issues, issue],
            }
          }),
        }
      })
    )
  }, [])

  const updateIssue = useCallback(
    (projectId: string, drawingId: string, issueId: string, updates: Partial<Issue>) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p
          return {
            ...p,
            drawings: p.drawings.map((d) => {
              if (d.id !== drawingId) return d
              return {
                ...d,
                issues: d.issues.map((i) => (i.id === issueId ? { ...i, ...updates } : i)),
              }
            }),
          }
        })
      )
    },
    []
  )

  const deleteIssue = useCallback((projectId: string, drawingId: string, issueId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        const drawing = p.drawings.find((d) => d.id === drawingId)
        const issue = drawing?.issues.find((i) => i.id === issueId)
        return {
          ...p,
          totalIssues: p.totalIssues - 1,
          unresolvedIssues: issue && !issue.resolved ? p.unresolvedIssues - 1 : p.unresolvedIssues,
          drawings: p.drawings.map((d) => {
            if (d.id !== drawingId) return d
            return {
              ...d,
              issueCount: d.issueCount - 1,
              issues: d.issues.filter((i) => i.id !== issueId),
            }
          }),
        }
      })
    )
  }, [])

  const state = useMemo<AppState>(
    () => ({
      currentPage,
      projects,
      navigate,
      addIssue,
      updateIssue,
      deleteIssue,
    }),
    [currentPage, projects, navigate, addIssue, updateIssue, deleteIssue]
  )

  return <AppContext value={state}>{children}</AppContext>
}
