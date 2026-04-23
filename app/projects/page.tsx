'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Clock3, MapPin, Search } from 'lucide-react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { authedFetch } from '@/lib/authed-fetch'
import { useAuthStore } from '@/lib/stores/auth-store'
import type { ProjectSummary } from '@/lib/domain'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { toast } from 'sonner'

export default function ProjectsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const loadingAuth = useAuthStore((s) => s.loading)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', address: '', inspection_date: '' })

  useEffect(() => {
    if (!loadingAuth && !user) router.replace('/login')
  }, [loadingAuth, user, router])

  const loadProjects = async () => {
    setLoading(true)
    const response = await authedFetch('/api/projects')
    const data = (await response.json()) as { projects?: ProjectSummary[]; error?: string }
    if (!response.ok) {
      toast.error(data.error ?? '案件取得に失敗しました')
      setLoading(false)
      return
    }
    setProjects(data.projects ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (user) void loadProjects()
  }, [user])

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase()
    if (!key) return projects
    return projects.filter(
      (p) => p.name.toLowerCase().includes(key) || p.address.toLowerCase().includes(key)
    )
  }, [projects, search])

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const profileResult = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id ?? '')
        .maybeSingle()
      if (profileResult.error) {
        console.error('create project error:', profileResult.error)
        toast.error('tenant情報の取得に失敗しました。再ログインしてください。')
        return
      }
      const tenantId = profileResult.data?.tenant_id
      if (!tenantId) {
        const error = 'profiles.tenant_id が見つかりません。管理者にお問い合わせください。'
        console.error('create project error:', error)
        toast.error(error)
        return
      }

      const response = await authedFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          name: form.name,
          address: form.address,
          inspection_date: form.inspection_date,
        }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        const error = data.error ?? '作成に失敗しました'
        console.error('create project error:', error)
        toast.error(data.error ?? '作成に失敗しました')
        setSaving(false)
        return
      }
      console.log('project created')
      toast.success('案件を作成しました')
      setForm({ name: '', address: '', inspection_date: '' })
      setDialogOpen(false)
      await loadProjects()
    } catch (error) {
      console.error('create project error:', error)
      toast.error('作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const onLogout = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-700">案件一覧</h1>
          <p className="text-sm text-muted-foreground">引き渡し前検査の案件を管理します</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onLogout}>
            ログアウト
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">新規案件</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新規案件作成</DialogTitle>
              </DialogHeader>
              <form className="space-y-4" onSubmit={onCreate}>
                <div className="space-y-2">
                  <Label htmlFor="name">物件名</Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">住所</Label>
                  <Input
                    id="address"
                    required
                    value={form.address}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inspection_date">検査日</Label>
                  <Input
                    id="inspection_date"
                    type="date"
                    required
                    value={form.inspection_date}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, inspection_date: event.target.value }))
                    }
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                    {saving ? '保存中...' : '保存'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="物件名または現場名で検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            案件がありません。新規案件を作成してください。
          </CardContent>
        </Card>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {filtered.map((project) => (
            <Card key={project.id} className="border-blue-100">
              <CardHeader>
                <CardTitle className="text-xl">{project.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {project.address}
                </p>
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  検査日: {project.inspection_date}
                </p>
                <p>指摘数: {project.issue_count}件</p>
                <div className="flex items-center gap-2">
                  <Badge variant={project.open_count > 0 ? 'destructive' : 'secondary'}>未対応 {project.open_count}件</Badge>
                </div>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  最終更新日:{' '}
                  {format(new Date(project.latest_update), 'yyyy/MM/dd', {
                    locale: ja,
                  })}
                </p>
              </CardContent>
              <CardFooter className="justify-end">
                <Button asChild variant="outline" className="h-10">
                  <Link href={`/projects/${project.id}`}>開く</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>
      )}
    </main>
  )
}
