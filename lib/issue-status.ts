export type IssueStatus = '未対応' | '完了'

export function normalizeIssueStatus(status: string | null | undefined): IssueStatus {
  return status === '完了' || status === 'done' ? '完了' : '未対応'
}

/** @deprecated Use normalizeIssueStatus */
export function issueStatusLabel(status: string): IssueStatus {
  return normalizeIssueStatus(status)
}
