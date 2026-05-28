'use client'

import type { ExportIssue } from '@/lib/pdf-export-client'
import { normalizeIssueStatus } from '@/lib/issue-status'

export type PhotoDetailIssue = ExportIssue & {
  before_photo_url?: string | null
  after_photo_url?: string | null
  beforePhotoLoadError?: boolean
  afterPhotoLoadError?: boolean
}

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
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <div
        className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
        style={{ minHeight: 280 }}
      >
        {!hasPath ? (
          <span className="text-sm text-slate-500">写真なし</span>
        ) : loadError || !url ? (
          <span className="text-sm text-red-600">写真を読み込めません</span>
        ) : (
          <img
            src={url}
            alt={title}
            className="max-h-[360px] w-full object-contain"
            crossOrigin="anonymous"
          />
        )}
      </div>
    </div>
  )
}

export function PdfExportPhotoDetailPage({ issue }: { issue: PhotoDetailIssue }) {
  const status = normalizeIssueStatus(issue.status)
  const issueText = issue.issue_text?.trim() ? issue.issue_text : '未入力'

  return (
    <div
      className="box-border bg-white text-slate-900"
      style={{
        width: 794,
        minHeight: 1123,
        padding: 32,
        fontFamily: 'system-ui, "Hiragino Sans", "Yu Gothic", sans-serif',
      }}
    >
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">No.{issue.exportNo} 指摘詳細</h2>

        <dl className="mt-4 grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-sm text-slate-800">
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

        <div className="mt-8 flex flex-col gap-6">
          <PhotoSlot
            title={`No.${issue.exportNo} ビフォー写真`}
            path={issue.before_photo_path}
            url={issue.before_photo_url}
            loadError={issue.beforePhotoLoadError}
          />
          <PhotoSlot
            title={`No.${issue.exportNo} アフター写真`}
            path={issue.after_photo_path}
            url={issue.after_photo_url}
            loadError={issue.afterPhotoLoadError}
          />
        </div>
      </div>
    </div>
  )
}
