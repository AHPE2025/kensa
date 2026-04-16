'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { authedFetch } from '@/lib/authed-fetch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/projects')
    })
  }, [router])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = getSupabaseBrowserClient()

    const loginResult = await supabase.auth.signInWithPassword({ email, password })
    if (loginResult.error) {
      const signupResult = await supabase.auth.signUp({ email, password })
      if (signupResult.error) {
        toast.error(signupResult.error.message)
        setLoading(false)
        return
      }
      toast.success('新規ユーザーを作成しました。ログインを続行します。')
      const retried = await supabase.auth.signInWithPassword({ email, password })
      if (retried.error) {
        toast.error(retried.error.message)
        setLoading(false)
        return
      }
    }

    const bootstrap = await authedFetch('/api/profile/bootstrap', { method: 'POST' })
    if (!bootstrap.ok) {
      const data = (await bootstrap.json()) as { error?: string }
      toast.error(data.error ?? 'プロフィール初期化に失敗しました')
      setLoading(false)
      return
    }

    toast.success('ログインしました')
    router.replace('/projects')
    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md border-blue-100 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-blue-700">引き渡し前検査システム</CardTitle>
          <CardDescription>メールアドレスでログインしてください</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">メール</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button className="h-11 w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
              {loading ? '処理中...' : 'ログイン'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
