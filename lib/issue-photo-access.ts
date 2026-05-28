import type { SupabaseClient } from '@supabase/supabase-js'

export async function verifyIssueBelongsToTenant(
  client: SupabaseClient,
  tenantId: string,
  projectId: string,
  issueId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('issues')
    .select('id')
    .eq('id', issueId)
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    console.error('issue access verify error:', error)
    return false
  }
  return !!data
}

export async function verifyIssuePhotoPathAccess(
  client: SupabaseClient,
  tenantId: string,
  path: string,
): Promise<boolean> {
  const { data: beforeMatch, error: beforeError } = await client
    .from('issues')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('before_photo_path', path)
    .limit(1)
    .maybeSingle()

  if (beforeError) {
    console.error('issue photo path access verify error:', { path, beforeError })
    return false
  }
  if (beforeMatch) return true

  const { data: afterMatch, error: afterError } = await client
    .from('issues')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('after_photo_path', path)
    .limit(1)
    .maybeSingle()

  if (afterError) {
    console.error('issue photo path access verify error:', { path, afterError })
    return false
  }
  return !!afterMatch
}
