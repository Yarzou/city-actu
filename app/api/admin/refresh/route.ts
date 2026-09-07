import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllSources, fetchSourceById } from '@/lib/fetchers'
import { isAdminUser } from '@/lib/authz'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Rafraîchissement manuel des sources — **ingestion seule**.
 *
 * Cette route appelait `summarizeArticles` dès qu'un article était inséré : chaque
 * scraping consommait du quota Groq et rallongeait la requête de plusieurs secondes.
 * La génération de résumé a ses propres points d'entrée, tous deux explicites et
 * réservés à l'administration — `/api/digest/[citySlug]` (onglet « Résumés IA ») et
 * `/api/admin/summarize-recent` (panneau admin). Ne pas la rebrancher ici, pas plus
 * que dans le cron.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  if (!(await isAdminUser(supabase, user.id))) {
    return NextResponse.json({ error: 'Accès administrateur requis' }, { status: 403 })
  }

  let sourceId: number | undefined
  try {
    const body = await request.json().catch(() => ({}))
    if (body.sourceId) sourceId = Number(body.sourceId)
  } catch {}

  try {
    const results = sourceId
      ? await fetchSourceById(sourceId)
      : await fetchAllSources()

    const summary = results.reduce(
      (acc, r) => ({
        sources: acc.sources + 1,
        fetched: acc.fetched + r.fetched,
        inserted: acc.inserted + r.inserted,
        updated: acc.updated + r.updated,
        unchanged: acc.unchanged + r.unchanged,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors.length,
      }),
      { sources: 0, fetched: 0, inserted: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0 }
    )

    return NextResponse.json({ ok: true, summary, results, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[Admin] refresh erreur:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
