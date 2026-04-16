'use client'

import { useState } from 'react'
import {
  Building2,
  Search,
  Plus,
  MapPin,
  CalendarDays,
  AlertCircle,
  Clock,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/lib/app-store'

export function ProjectsPage() {
  const { projects, navigate } = useApp()
  const [search, setSearch] = useState('')

  const filtered = projects.filter(
    (p) =>
      p.name.includes(search) || p.address.includes(search)
  )

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold text-foreground">建物検査システム</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ type: 'login' })}
            className="text-muted-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            ログアウト
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
        {/* Top Bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold text-foreground">案件一覧</h2>
          <div className="flex gap-3">
            <div className="relative flex-1 sm:w-72 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="物件名または現場名で検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 pl-10"
              />
            </div>
            <Button size="lg" className="h-11 shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              新規案件
            </Button>
          </div>
        </div>

        {/* Project Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <Card
              key={project.id}
              className="group cursor-pointer border-border/60 transition-all hover:border-primary/30 hover:shadow-md"
              onClick={() => navigate({ type: 'project-detail', projectId: project.id })}
            >
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-bold leading-snug text-foreground group-hover:text-primary">
                    {project.name}
                  </h3>
                  <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>

                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{project.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    <span>検査日: {project.inspectionDate}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-t border-border pt-3">
                  <div className="flex items-center gap-1.5 text-sm">
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground font-medium">指摘 {project.totalIssues}件</span>
                  </div>
                  {project.unresolvedIssues > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      未対応 {project.unresolvedIssues}件
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{project.lastUpdated}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Search className="mb-3 h-10 w-10" />
            <p className="text-lg font-medium">案件が見つかりません</p>
            <p className="text-sm">検索条件を変更してください</p>
          </div>
        )}
      </main>
    </div>
  )
}
