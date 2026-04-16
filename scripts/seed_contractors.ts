import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です')
}

const supabase = createClient(url, key)

const contractorNames = [
  'ウエハラ工芸',
  '新星工業',
  '幡成サッシ',
  'SHIN鉄工',
  'アルテエンジニアリング',
  '栄光プロビジョン',
  '富士機材',
  '工藤工務店',
]

async function main() {
  const tenantId = process.argv[2]
  if (!tenantId) {
    throw new Error('usage: tsx scripts/seed_contractors.ts <tenant_id>')
  }

  const payload = contractorNames.map((name) => ({
    tenant_id: tenantId,
    name,
    category: null,
    phone: null,
  }))

  const { error } = await supabase.from('contractors').insert(payload)
  if (error) throw error
  console.log(`inserted ${payload.length} contractors`)
}

void main()
