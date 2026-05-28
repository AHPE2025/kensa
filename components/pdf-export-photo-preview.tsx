'use client'

import type { PhotoDetailIssue } from '@/components/pdf-export-photo-detail'
import { normalizeIssueStatus } from '@/lib/issue-status'

function issueContractorName(issue: PhotoDetailIssue): string {
  if (issue.issue_category === 'common') return '共通'
  return issue.contractor?.name ?? '業者未定'
}

function PhotoSlot({
  title,
  path,
  url,
  loadError,
}: {
  title: string
  path: string | null | undefined
  url: string | null | undefined
  loadError?: boolean
}) {
  const hasPath = Boolean(path?.trim())

  return (
    <div className="flex flex-1 flex-col gap-2">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <div className="flex min-h-[180px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {!hasPath ? (
          <span className="text-sm text-slate-500">写真なし</span>
        ) : loadError || !url ? (
          <span className="text-sm text-red-600">写真を読み込めません</span>
        ) : (
          <img src={url} alt={title} className="max-h-[240px] w-full object-contain" crossOrigin="anonymous" />
        )}
      </div>
    </div>
  )
}

export function PdfExportPhotoPreviewSection({ issues }: { issues: PhotoDetailIssue[] }) {
  if (issues.length === 0) return null

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">写真付き指摘詳細</h2>
      </div>
      <div className="space-y-6 p-6">
        {issues.map((issue) => {
          const status = normalizeIssueStatus(issue.status)
          const issueText = issue.issue_text?.trim() ? issue.issue_text : '未入力'

          return (
            <div
              key={issue.id}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-sm font-bold text-slate-900">No.{issue.exportNo}</h3>
              <dl className="mt-3 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-sm text-slate-800">
                <dt className="font-medium text-slate-600">階</dt>
                <dd>{issue.floor_label}</dd>
                <dt className="font-medium text-slate-600">区分</dt>
                <dd>{issue.issue_type}</dd>
                <dt className="font-medium text-slate-600">指摘内容</dt>
                <dd className="leading-relaxed">{issueText}</dd>
                <dt className="font-medium text-slate-600">担当業者</dt>
                <dd>{issueContractorName(issue)}</dd>
                <dt className="font-medium text-slate-600">状態</dt>
                <dd>{status}</dd>
              </dl>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row">
                <PhotoSlot
                  title="ビフォー写真"
                  path={issue.before_photo_path}
                  url={issue.before_photo_url}
                  loadError={issue.beforePhotoLoadError}
                />
                <PhotoSlot
                  title="アフター写真"
                  path={issue.after_photo_path}
                  url={issue.after_photo_url}
                  loadError={issue.afterPhotoLoadError}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
