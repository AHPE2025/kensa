export const ISSUE_TYPES = ['傷', '汚れ', '隙間', '浮き', '凹み', '調整', 'はがれ', '清掃'] as const

export type IssueType = (typeof ISSUE_TYPES)[number]

export type Profile = {
  id: string
  tenant_id: string
  display_name: string | null
  created_at: string
}

export type ProjectSummary = {
  id: string
  name: string
  address: string
  inspection_date: string
  created_at: string
  issue_count: number
  open_count: number
  latest_update: string
}

export type Project = {
  id: string
  tenant_id: string
  name: string
  address: string
  inspection_date: string
  created_at: string
}

export type Drawing = {
  id: string
  tenant_id: string
  project_id: string
  floor_label: string
  file_path: string
  page_count: number
  created_at: string
}

export type Contractor = {
  id: string
  tenant_id: string
  name: string
  category: string | null
  phone: string | null
  created_at: string
}

export type Issue = {
  id: string
  tenant_id: string
  project_id: string
  drawing_id: string
  page_index: number
  floor_label: string
  pin_x: number
  pin_y: number
  callout_x: number
  callout_y: number
  issue_type: IssueType
  issue_text: string
  contractor_id: string
  status: string
  created_by: string
  created_at: string
  contractor?: { id: string; name: string } | null
}
