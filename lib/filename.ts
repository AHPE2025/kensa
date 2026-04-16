export function toAsciiFileName(value: string) {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  return cleaned || 'export'
}
