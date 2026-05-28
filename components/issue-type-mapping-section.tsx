'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { authedFetch } from '@/lib/authed-fetch'
import { assignmentTypeLabel, mappingTargetLabel } from '@/lib/issue-type-mapping'
import type { Contractor, IssueTypeContractorMapping } from '@/lib/domain'
import { IssueTypeMappingModal } from '@/components/issue-type-mapping-modal'
import { toast } from 'sonner'

type IssueTypeMappingSectionProps = {
  projectId: string
  contractors: Contractor[]
}

export function IssueTypeMappingSection({ projectId, contractors }: IssueTypeMappingSectionProps) {
  const [mappings, setMappings] = useState<IssueTypeContractorMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMapping, setEditingMapping] = useState<IssueTypeContractorMapping | null>(null)

  const loadMappings = useCallback(async () => {
    setLoading(true)
    try {
      const response = await authedFetch(`/api/projects/${projectId}/issue-type-mappings?includeInactive=1`)
      const data = (await response.json()) as { mappings?: IssueTypeContractorMapping[]; error?: string }
      if (!response.ok) {
        console.error('load issue type mappings error:', data.error)
        toast.error(data.error ?? '紐付け一覧の取得に失敗しました')
        setMappings([])
        return
      }
      console.log('issue type mappings:', data.mappings)
      setMappings(data.mappings ?? [])
    } catch (error) {
      console.error('load issue type mappings error:', error)
      toast.error('紐付け一覧の取得に失敗しました')
      setMappings([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadMappings()
  }, [loadMappings])

  const onOpenCreate = () => {
    setEditingMapping(null)
    setModalOpen(true)
  }

  const onOpenEdit = (mapping: IssueTypeContractorMapping) => {
    setEditingMapping(mapping)
    setModalOpen(true)
  }

  const onSaveMapping = async (values: {
    issue_type: string
    assignment_type: 'contractor' | 'common' | 'unassigned'
    contractor_id: string | null
    sort_order: number
    is_active: boolean
  }) => {
    const url = editingMapping
      ? `/api/projects/${projectId}/issue-type-mappings/${editingMapping.id}`
      : `/api/projects/${projectId}/issue-type-mappings`
    const method = editingMapping ? 'PATCH' : 'POST'
    const body = editingMapping
      ? values
      : { ...values, project_id: projectId }

    const response = await authedFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as { error?: string }
    if (!response.ok) {
      toast.error(data.error ?? '紐付けの保存に失敗しました')
      return
    }
    toast.success('紐付けを保存しました')
    setModalOpen(false)
    await loadMappings()
  }

  const onDeactivateMapping = async (mapping: IssueTypeContractorMapping) => {
    const response = await authedFetch(`/api/projects/${projectId}/issue-type-mappings/${mapping.id}`, {
      method: 'DELETE',
    })
    const data = (await response.json()) as { error?: string }
    if (!response.ok) {
      toast.error(data.error ?? '紐付けの無効化に失敗しました')
      return
    }
    toast.success('紐付けを無効化しました')
    await loadMappings()
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>指摘区分との紐付け設定</CardTitle>
            <CardDescription className="mt-1">
              指摘区分を選んだ際に、自動で担当業者を設定できます。
            </CardDescription>
          </div>
          <Button className="shrink-0 bg-blue-600 hover:bg-blue-700" onClick={onOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            紐付けを追加
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>指摘区分</TableHead>
                <TableHead>自動設定する担当</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>状態</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    読み込み中...
                  </TableCell>
                </TableRow>
              ) : mappings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    紐付け設定がありません
                  </TableCell>
                </TableRow>
              ) : (
                mappings.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell>{mapping.issue_type}</TableCell>
                    <TableCell>{mappingTargetLabel(mapping)}</TableCell>
                    <TableCell>{assignmentTypeLabel(mapping.assignment_type)}</TableCell>
                    <TableCell>{mapping.is_active ? '有効' : '無効'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onOpenEdit(mapping)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        編集
                      </Button>
                      {mapping.is_active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => void onDeactivateMapping(mapping)}
                        >
                          無効化
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <IssueTypeMappingModal
        open={modalOpen}
        contractors={contractors}
        mapping={editingMapping}
        onClose={() => setModalOpen(false)}
        onSave={onSaveMapping}
      />
    </>
  )
}
