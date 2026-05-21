export const ISSUE_TYPES = ['傷', '汚れ', '補修', '隙間', '浮き', '凹み', '調整', 'その他'] as const

export const DRAWING_FLOOR_LABEL_OPTIONS = [
  'B3F',
  'B2F',
  'B1F',
  ...Array.from({ length: 30 }, (_, index) => `${index + 1}F`),
  'RF',
  'PH',
] as const

export const DEFAULT_DRAWING_FLOOR_LABEL = '1F' as const

export const DRAWING_FLOOR_ORDER = DRAWING_FLOOR_LABEL_OPTIONS

export function compareFloorLabels(a: string, b: string): number {
  const indexA = DRAWING_FLOOR_ORDER.indexOf(a as (typeof DRAWING_FLOOR_ORDER)[number])
  const indexB = DRAWING_FLOOR_ORDER.indexOf(b as (typeof DRAWING_FLOOR_ORDER)[number])
  const orderA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA
  const orderB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB
  return orderA - orderB
}

export function sortDrawingsByFloorLabel<T extends { floor_label: string }>(drawings: T[]): T[] {
  return [...drawings].sort((a, b) => compareFloorLabels(a.floor_label, b.floor_label))
}

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
  storage_path?: string | null
  file_name?: string | null
  original_pdf_path?: string | null
  page_images?: string[] | null
  page_count: number
  rotation?: number
  zoom?: number
  view_updated_at?: string | null
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

export type IssueFormValues = {
  issue_type: string
  issue_text: string
  contractor_id: string
  issue_category: string
  status: string
  beforePhotoFile: File | null
  afterPhotoFile: File | null
  clearBeforePhoto: boolean
  clearAfterPhoto: boolean
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
  issue_category?: string | null
  issue_type: IssueType
  issue_text: string | null
  contractor_id: string | null
  status: string
  before_photo_path?: string | null
  after_photo_path?: string | null
  before_photo_url?: string | null
  after_photo_url?: string | null
  created_by: string | null
  created_at: string
  updated_by?: string | null
  updated_at?: string | null
  contractor?: { id: string; name: string } | null
}
