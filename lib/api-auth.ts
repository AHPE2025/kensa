import { NextRequest } from 'next/server'
import { createUserScopedServerClient } from '@/lib/supabase-server'

export async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: new Response(JSON.stringify({ error: '認証ヘッダーが必要です' }), { status: 401 }) }
  }

  const token = authHeader.replace('Bearer ', '').trim()
  const client = createUserScopedServerClient(token)
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser()

  if (userError || !user) {
    return { error: new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401 }) }
  }

  return { client, user }
}

export async function getAuthedClient(request: NextRequest) {
  const authedUser = await getAuthedUser(request)
  if ('error' in authedUser) return authedUser
  const { client, user } = authedUser

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return {
      error: new Response(JSON.stringify({ error: 'プロフィール初期化が必要です' }), { status: 403 }),
    }
  }

  return {
    client,
    user,
    tenantId: profile.tenant_id as string,
  }
}
