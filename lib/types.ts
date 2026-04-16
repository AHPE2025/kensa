export interface Contractor {
  id: string
  name: string
  category: string
  contact: string
  color: string
}

export interface Issue {
  id: string
  number: number
  floor: string
  category: string
  content: string
  contractorId: string
  contractorName: string
  x: number
  y: number
  labelX: number
  labelY: number
  resolved: boolean
  createdAt: string
}

export interface Drawing {
  id: string
  floor: string
  fileName: string
  issueCount: number
  updatedAt: string
  issues: Issue[]
}

export interface Project {
  id: string
  name: string
  address: string
  inspectionDate: string
  totalIssues: number
  unresolvedIssues: number
  lastUpdated: string
  drawings: Drawing[]
  contractors: Contractor[]
}

export type IssueCategory = '傷' | '汚れ' | '隙間' | '浮き' | '凹み' | '調整'

export const ISSUE_CATEGORIES: IssueCategory[] = ['傷', '汚れ', '隙間', '浮き', '凹み', '調整']

export const FLOORS = ['1F', '2F', '3F', '4F', '5F', 'RF'] as const
