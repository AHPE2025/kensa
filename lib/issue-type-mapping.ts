import {
  DEFAULT_ISSUE_TYPE_OPTIONS,
  type AssignmentType,
  type IssueFormValues,
  type IssueTypeContractorMapping,
} from '@/lib/domain'

export function assignmentTypeLabel(type: AssignmentType): string {
  switch (type) {
    case 'contractor':
      return '業者'
    case 'common':
      return '共通'
    case 'unassigned':
      return '業者未定'
  }
}

export function mappingTargetLabel(mapping: IssueTypeContractorMapping): string {
  if (mapping.assignment_type === 'common') return '共通'
  if (mapping.assignment_type === 'unassigned') return '業者未定'
  return mapping.contractor?.name ?? '業者未定'
}

export function mergeIssueTypeMappings(
  projectMappings: IssueTypeContractorMapping[],
  tenantMappings: IssueTypeContractorMapping[],
): IssueTypeContractorMapping[] {
  const byIssueType = new Map<string, IssueTypeContractorMapping>()
  for (const mapping of tenantMappings) {
    byIssueType.set(mapping.issue_type, mapping)
  }
  for (const mapping of projectMappings) {
    byIssueType.set(mapping.issue_type, mapping)
  }
  return Array.from(byIssueType.values()).sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.issue_type.localeCompare(b.issue_type, 'ja')
  })
}

export function buildIssueTypeOptions(
  mappings: IssueTypeContractorMapping[],
  extraTypes: string[] = [],
): string[] {
  const seen = new Set<string>()
  const options: string[] = []
  const add = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    options.push(trimmed)
  }
  for (const type of DEFAULT_ISSUE_TYPE_OPTIONS) add(type)
  for (const mapping of mappings) add(mapping.issue_type)
  for (const type of extraTypes) add(type)
  return options
}

export function findActiveMappingForIssueType(
  mappings: IssueTypeContractorMapping[],
  issueType: string,
): IssueTypeContractorMapping | null {
  return mappings.find((mapping) => mapping.is_active && mapping.issue_type === issueType) ?? null
}

export type AutoMappingResult = {
  contractor_id: string
  issue_category: string
  message: string
}

export function applyIssueTypeMapping(
  mapping: IssueTypeContractorMapping | null,
  issueType: string,
): AutoMappingResult {
  if (!mapping) {
    return {
      contractor_id: '',
      issue_category: '',
      message: 'この指摘区分には担当業者が未設定です。',
    }
  }

  switch (mapping.assignment_type) {
    case 'contractor':
      return {
        contractor_id: mapping.contractor_id ?? '',
        issue_category: '',
        message: '指摘区分に基づき、担当業者を自動設定しました。',
      }
    case 'common':
      return {
        contractor_id: '',
        issue_category: 'common',
        message: 'この指摘は共通指摘として設定されます。',
      }
    case 'unassigned':
      return {
        contractor_id: '',
        issue_category: '',
        message: 'この指摘区分には担当業者が未設定です。',
      }
  }
}

export function buildIssueSaveCategory(values: IssueFormValues): string | null {
  if (values.issue_category === 'common') return 'common'
  if (values.contractor_id) {
    return values.issue_category || values.issue_type || null
  }
  if (values.issue_category === 'unassigned') return 'unassigned'
  return null
}

export function buildIssueSavePayload(values: IssueFormValues, base: Record<string, unknown>) {
  const payload = {
    ...base,
    issue_type: values.issue_type,
    issue_text: values.issue_text.trim() || null,
    issue_category: buildIssueSaveCategory(values),
    contractor_id: values.contractor_id || null,
    status: values.status === '完了' ? ('完了' as const) : ('未対応' as const),
  }
  console.log('issue payload with mapping:', payload)
  return payload
}
