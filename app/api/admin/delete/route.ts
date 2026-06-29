import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isAdminUser } from '@/lib/authz'

export const runtime = 'nodejs'

const ALLOWED_TABLES = ['categories', 'sources', 'articles', 'import_summaries'] as const
type AllowedTable = typeof ALLOWED_TABLES[number]

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  if (!(await isAdminUser(supabase, user.id))) {
    return NextResponse.json({ error: 'Accès administrateur requis' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { table, id } = body as { table?: string; id?: number }

  if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
    return NextResponse.json({ error: 'Table non autorisée' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const query = id !== undefined
    ? admin.from(table).delete().eq('id', id)
    : admin.from(table).delete().neq('id', 0)

  const { error } = await query

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
