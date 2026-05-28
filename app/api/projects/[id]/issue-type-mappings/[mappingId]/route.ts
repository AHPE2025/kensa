import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import type { AssignmentType } from '@/lib/domain'

type Params = { params: Promise<{ id: string; mappingId: string }> }

const MAPPING_SELECT =
  'id, tenant_id, project_id, issue_type, contractor_id, assignment_type, sort_order, is_active, created_at, updated_at, contractor:contractors(id, name, category, phone)'

function validateAssignmentPayload(body: {
  issue_type?: string
  contractor_id?: string | null
  assignment_type?: AssignmentType
}) {
  if (body.issue_type !== undefined && !body.issue_type.trim()) {
    return 'issue_type は必須です'
  }
  if (body.assignment_type === 'contractor' && !body.contractor_id) {
    return 'assignment_type が contractor の場合、contractor_id は必須です'
  }
  if (body.assignment_type === 'common' && body.contractor_id) {
    return 'assignment_type が common の場合、contractor_id は null である必要があります'
  }
  if (body.assignment_type === 'unassigned' && body.contractor_id) {
    return 'assignment_type が unassigned の場合、contractor_id は null である必要があります'
  }
  return null
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id: projectId, mappingId } = await params

  const body = (await request.json()) as {
    issue_type?: string
    contractor_id?: string | null
    assignment_type?: AssignmentType
    sort_order?: number
    is_active?: boolean
  }

  const validationError = validateAssignmentPayload(body)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.issue_type !== undefined) updates.issue_type = body.issue_type.trim()
  if (body.assignment_type !== undefined) updates.assignment_type = body.assignment_type
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order
  if (body.is_active !== undefined) updates.is_active = body.is_active

  if (body.assignment_type !== undefined) {
    if (body.assignment_type === 'contractor') {
      updates.contractor_id = body.contractor_id
    } else {
      updates.contractor_id = null
    }
  } else if (body.contractor_id !== undefined) {
    updates.contractor_id = body.contractor_id
  }

  try {
    const { data, error } = await client
      .from('issue_type_contractor_mappings')
      .update(updates)
      .eq('id', mappingId)
      .eq('tenant_id', tenantId)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .select(MAPPING_SELECT)
      .single()

    if (error) throw error
    return NextResponse.json({ mapping: data })
  } catch (error) {
    console.error('update issue type mapping error:', error)
    return NextResponse.json({ error: '紐付けの更新に失敗しました' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id: projectId, mappingId } = await params

  try {
    const { data, error } = await client
      .from('issue_type_contractor_mappings')
      .update({ is_active: false })
      .eq('id', mappingId)
      .eq('tenant_id', tenantId)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .select(MAPPING_SELECT)
      .single()

    if (error) throw error
    return NextResponse.json({ mapping: data })
  } catch (error) {
    console.error('delete issue type mapping error:', error)
    return NextResponse.json({ error: '紐付けの無効化に失敗しました' }, { status: 400 })
  }
}
