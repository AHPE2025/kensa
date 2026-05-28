import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'
import { mergeIssueTypeMappings } from '@/lib/issue-type-mapping'
import type { AssignmentType, IssueTypeContractorMapping } from '@/lib/domain'

type Params = { params: Promise<{ id: string }> }

const MAPPING_SELECT =
  'id, tenant_id, project_id, issue_type, contractor_id, assignment_type, sort_order, is_active, created_at, updated_at, contractor:contractors(id, name, category, phone)'

function validateAssignmentPayload(body: {
  issue_type?: string
  contractor_id?: string | null
  assignment_type?: AssignmentType
}) {
  if (!body.issue_type?.trim()) {
    return 'issue_type は必須です'
  }
  if (!body.assignment_type) {
    return 'assignment_type は必須です'
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

export async function GET(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id: projectId } = await params
  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === '1'

  try {
    let projectQuery = client
      .from('issue_type_contractor_mappings')
      .select(MAPPING_SELECT)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    let tenantQuery = client
      .from('issue_type_contractor_mappings')
      .select(MAPPING_SELECT)
      .eq('tenant_id', tenantId)
      .is('project_id', null)
      .order('sort_order', { ascending: true })

    if (!includeInactive) {
      projectQuery = projectQuery.eq('is_active', true)
      tenantQuery = tenantQuery.eq('is_active', true)
    }

    const [{ data: projectMappings, error: projectError }, { data: tenantMappings, error: tenantError }] =
      await Promise.all([projectQuery, tenantQuery])

    if (projectError) throw projectError
    if (tenantError) throw tenantError

    const mappings = includeInactive
      ? [...(projectMappings ?? []), ...(tenantMappings ?? [])].sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
          return a.issue_type.localeCompare(b.issue_type, 'ja')
        })
      : mergeIssueTypeMappings(
          (projectMappings ?? []) as unknown as IssueTypeContractorMapping[],
          (tenantMappings ?? []) as unknown as IssueTypeContractorMapping[],
        )

    console.log('issue type mappings:', mappings)
    return NextResponse.json({ mappings })
  } catch (error) {
    console.error('load issue type mappings error:', error)
    return NextResponse.json({ error: '紐付け一覧の取得に失敗しました' }, { status: 400 })
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { id: projectId } = await params

  const body = (await request.json()) as {
    issue_type?: string
    contractor_id?: string | null
    assignment_type?: AssignmentType
    sort_order?: number
    is_active?: boolean
    project_id?: string | null
  }

  const validationError = validateAssignmentPayload(body)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const assignmentType = body.assignment_type as AssignmentType
  const contractorId = assignmentType === 'contractor' ? body.contractor_id : null
  const resolvedProjectId = body.project_id === null ? null : (body.project_id ?? projectId)

  try {
    const { data, error } = await client
      .from('issue_type_contractor_mappings')
      .insert({
        tenant_id: tenantId,
        project_id: resolvedProjectId,
        issue_type: body.issue_type!.trim(),
        contractor_id: contractorId,
        assignment_type: assignmentType,
        sort_order: body.sort_order ?? 0,
        is_active: body.is_active ?? true,
      })
      .select(MAPPING_SELECT)
      .single()

    if (error) throw error
    return NextResponse.json({ mapping: data })
  } catch (error) {
    console.error('create issue type mapping error:', error)
    return NextResponse.json({ error: '紐付けの作成に失敗しました' }, { status: 400 })
  }
}
