import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  const authed = await getAuthedUser(request)
  if ('error' in authed) return authed.error

  const { client, user } = authed

  const { data: existing } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (existing) {
    return NextResponse.json({ profile: existing })
  }

  const tenantName = `${user.email ?? 'tenant'} company`
  const { data: tenant, error: tenantError } = await client
    .from('tenants')
    .insert({ name: tenantName })
    .select('*')
    .single()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: tenantError?.message ?? 'tenant create failed' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .insert({
      id: user.id,
      tenant_id: tenant.id,
      display_name: user.user_metadata?.display_name ?? user.email ?? 'user',
    })
    .select('*')
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: profileError?.message ?? 'profile create failed' }, { status: 400 })
  }

  return NextResponse.json({ profile })
}
