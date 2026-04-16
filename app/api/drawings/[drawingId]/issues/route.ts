import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/api-auth'

type Params = { params: Promise<{ drawingId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId } = authed
  const { drawingId } = await params

  const { data: drawing, error: drawingError } = await client
    .from('drawings')
    .select('*')
    .eq('id', drawingId)
    .eq('tenant_id', tenantId)
    .single()
  if (drawingError) {
    console.error('drawing fetch error:', {
      tenantId,
      drawingId,
      error: drawingError,
    })
  }

  const { data: issues, error } = await client
    .from('issues')
    .select('*, contractor:contractors(id,name)')
    .eq('drawing_id', drawingId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('issues fetch error:', {
      tenantId,
      drawingId,
      error,
    })
    return NextResponse.json({ drawing: drawing ?? null, issues: [] })
  }
  return NextResponse.json({ drawing: drawing ?? null, issues: issues ?? [] })
}

export async function POST(request: NextRequest, { params }: Params) {
  const authed = await getAuthedClient(request)
  if ('error' in authed) return authed.error
  const { client, tenantId, user } = authed
  const { drawingId } = await params
  const body = (await request.json()) as {
    page_index?: number
    floor_label?: string
    pin_x?: number
    pin_y?: number
    callout_x?: number
    callout_y?: number
    issue_type?: string
    issue_text?: string
    contractor_id?: string
    status?: string
  }

  const { data: drawing, error: drawingError } = await client
    .from('drawings')
    .select('project_id,floor_label')
    .eq('id', drawingId)
    .eq('tenant_id', tenantId)
    .single()

  if (drawingError || !drawing) {
    return NextResponse.json({ error: 'drawing が見つかりません' }, { status: 404 })
  }

  if (
    body.page_index === undefined ||
    body.pin_x === undefined ||
    body.pin_y === undefined ||
    body.callout_x === undefined ||
    body.callout_y === undefined ||
    !body.issue_type ||
    !body.issue_text ||
    !body.contractor_id
  ) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  const { data, error } = await client
    .from('issues')
    .insert({
      tenant_id: tenantId,
      project_id: drawing.project_id,
      drawing_id: drawingId,
      page_index: body.page_index,
      floor_label: body.floor_label ?? drawing.floor_label,
      pin_x: body.pin_x,
      pin_y: body.pin_y,
      callout_x: body.callout_x,
      callout_y: body.callout_y,
      issue_type: body.issue_type,
      issue_text: body.issue_text,
      contractor_id: body.contractor_id,
      status: body.status ?? 'open',
      created_by: user.id,
    })
    .select('*, contractor:contractors(id,name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ issue: data })
}
