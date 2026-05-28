import { createClient } from '@supabase/supabase-js'

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} が設定されていません`)
  }
  return value
}

/** サーバー専用（API route 等）。クライアントコンポーネントから import しないこと。 */
export function createSupabaseAdmin() {
  return createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}
