import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllSources } from '@/lib/fetchers'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  try {
    const results = await fetchAllSources()

    const summary = results.reduce(
      (acc, r) => ({
        sources: acc.sources + 1,
        fetched: acc.fetched + r.fetched,
        inserted: acc.inserted + r.inserted,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors.length,
      }),
      { sources: 0, fetched: 0, inserted: 0, skipped: 0, errors: 0 }
    )

    return NextResponse.json({ ok: true, summary, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[Admin] refresh erreur:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
