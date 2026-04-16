'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

export async function authedFetch(input: string, init?: RequestInit) {
  const supabase = getSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('ログインが必要です')
  }

  const headers = new Headers(init?.headers ?? {})
  headers.set('Authorization', `Bearer ${session.access_token}`)

  return fetch(input, {
    ...init,
    headers,
  })
}
