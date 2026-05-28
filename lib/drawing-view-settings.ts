export const VALID_ROTATIONS = [0, 90, 180, 270] as const
export const MAX_ZOOM = 5

export function normalizeRotation(value: unknown): number {
  const n = Number(value)
  return (VALID_ROTATIONS as readonly number[]).includes(n) ? n : 0
}

export function normalizeZoom(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function parseRotationForUpdate(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return undefined
  if (!(VALID_ROTATIONS as readonly number[]).includes(numeric)) return undefined
  return numeric
}

export function parseZoomForUpdate(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_ZOOM) return undefined
  return numeric
}
