'use client'

import { useApp } from '@/lib/app-store'
import { LoginPage } from './login-page'
import { ProjectsPage } from './projects-page'
import { ProjectDetailPage } from './project-detail-page'
import { DrawingEditorPage } from './drawing-editor-page'
import { PdfExportPage } from './pdf-export-page'

export function AppShell() {
  const { currentPage } = useApp()

  switch (currentPage.type) {
    case 'login':
      return <LoginPage />
    case 'projects':
      return <ProjectsPage />
    case 'project-detail':
      return <ProjectDetailPage projectId={currentPage.projectId} />
    case 'drawing-editor':
      return (
        <DrawingEditorPage
          projectId={currentPage.projectId}
          drawingId={currentPage.drawingId}
        />
      )
    case 'pdf-export':
      return <PdfExportPage projectId={currentPage.projectId} />
    default:
      return <LoginPage />
  }
}
