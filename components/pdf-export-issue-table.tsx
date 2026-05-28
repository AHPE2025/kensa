'use client'

import type { ExportIssue } from '@/lib/pdf-export-client'
import { issueStatusLabel } from '@/lib/pdf-export-client'

export type PdfExportIssueTableProps = {
  title: string
  projectName: string
  address?: string | null
  inspectionDate: string
  exportDate: string
  badgeLabel: string
  badgeVariant?: 'contractor' | 'common' | 'unassigned' | 'all'
  issues: ExportIssue[]
}

function issueContractorName(issue: ExportIssue): string {
  if (issue.issue_category === 'common') return '共通'
  return issue.contractor?.name ?? '業者未定'
}

function countStats(issues: ExportIssue[]) {
  let open = 0
  let done = 0
  for (const issue of issues) {
    if (issueStatusLabel(issue.status) === '完了') {
      done += 1
    } else {
      open += 1
    }
  }
  return { total: issues.length, open, done }
}

const BADGE_STYLES: Record<NonNullable<PdfExportIssueTableProps['badgeVariant']>, string> = {
  contractor: 'bg-emerald-600 text-white',
  common: 'bg-sky-600 text-white',
  unassigned: 'bg-slate-600 text-white',
  all: 'bg-blue-600 text-white',
}

export function PdfExportIssueTable({
  title,
  projectName,
  address,
  inspectionDate,
  exportDate,
  badgeLabel,
  badgeVariant = 'contractor',
  issues,
}: PdfExportIssueTableProps) {
  const stats = countStats(issues)

  return (
    <div
      className="box-border bg-white text-slate-900"
      style={{ width: 1122, minHeight: 794, padding: 32, fontFamily: 'system-ui, "Hiragino Sans", "Yu Gothic", sans-serif' }}
    >
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 text-base font-medium text-slate-800">{projectName}</p>
            {address?.trim() ? (
              <p className="mt-1 text-sm text-slate-600">{address}</p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-600">検査日：{inspectionDate}</p>
            <p className="mt-1 text-sm text-slate-600">出力日：{exportDate}</p>
            <span
              className={`mt-3 inline-block rounded-full px-4 py-1.5 text-sm font-semibold ${BADGE_STYLES[badgeVariant]}`}
            >
              {badgeLabel}
            </span>
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-left text-slate-700">
              <th className="border border-slate-200 px-3 py-2.5 font-semibold" style={{ width: 48 }}>
                No
              </th>
              <th className="border border-slate-200 px-3 py-2.5 font-semibold" style={{ width: 56 }}>
                階
              </th>
              <th className="border border-slate-200 px-3 py-2.5 font-semibold" style={{ width: 72 }}>
                区分
              </th>
              <th className="border border-slate-200 px-3 py-2.5 font-semibold">指摘内容</th>
              <th className="border border-slate-200 px-3 py-2.5 font-semibold" style={{ width: 140 }}>
                担当業者
              </th>
              <th className="border border-slate-200 px-3 py-2.5 font-semibold" style={{ width: 88 }}>
                状態
              </th>
            </tr>
          </thead>
          <tbody>
            {issues.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-slate-200 px-3 py-8 text-center text-slate-500">
                  指摘はありません
                </td>
              </tr>
            ) : (
              issues.map((issue) => {
                const status = issueStatusLabel(issue.status)
                const statusClass =
                  status === '完了'
                    ? { className: 'text-green-700', dotClassName: 'bg-green-500' }
                    : { className: 'text-red-700', dotClassName: 'bg-red-500' }
                return (
                  <tr key={issue.id} className="text-slate-800">
                    <td className="border border-slate-200 px-3 py-2 text-center font-medium">
                      {issue.exportNo}
                    </td>
                    <td className="border border-slate-200 px-3 py-2">{issue.floor_label}</td>
                    <td className="border border-slate-200 px-3 py-2">{issue.issue_type}</td>
                    <td className="border border-slate-200 px-3 py-2 leading-relaxed">
                      {issue.issue_text?.trim() ? issue.issue_text : '未入力'}
                    </td>
                    <td className="border border-slate-200 px-3 py-2">{issueContractorName(issue)}</td>
                    <td className="border border-slate-200 px-3 py-2">
                      <span className={`inline-flex items-center gap-1.5 font-medium ${statusClass.className}`}>
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusClass.dotClassName}`} />
                        {status}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        <div className="mt-5 flex gap-6 border-t border-slate-200 pt-4 text-sm text-slate-700">
          <span>
            合計件数：<strong>{stats.total}</strong>件
          </span>
          <span>
            未対応件数：<strong>{stats.open}</strong>件
          </span>
          <span>
            完了件数：<strong>{stats.done}</strong>件
          </span>
        </div>
      </div>
    </div>
  )
}
