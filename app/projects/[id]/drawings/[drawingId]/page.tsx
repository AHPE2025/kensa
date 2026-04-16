'use client'

import dynamic from 'next/dynamic'

const DrawingEditorClient = dynamic(() => import('@/components/drawing-editor-client'), { ssr: false })

export default function DrawingEditorPage() {
  return <DrawingEditorClient />
}
