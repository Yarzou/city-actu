import { NextResponse } from 'next/server'
import { fetchAllSources } from '@/lib/fetchers'

export const runtime = 'nodejs'
// Plafond du plan Hobby. Toute valeur supérieure est silencieusement écrêtée par Vercel :
// autant que le code dise la vérité. Le fetch nominal tient en ~15-40 s, la marge est
// surveillée via le `durationMs` renvoyé plus bas.
export const maxDuration = 60

/**
 * Ingestion quotidienne, déclenchée par le cron déclaré dans `vercel.json`.
 *
 * Ce handler ne doit JAMAIS appeler le LLM : le résumé Groq reste attaché au
 * rafraîchissement manuel de `/api/admin/refresh`, pour qu'une exécution automatique
 * ne consomme aucun quota. Ne pas y rebrancher `summarizeArticles`.
 */
export async function GET(request: Request) {
  // Vercel injecte `Authorization: Bearer <CRON_SECRET>` sur ses appels de cron dès que la
  // variable est définie sur le projet. Sans elle, comparer à `Bearer ${undefined}` ferait
  // de la chaîne littérale "Bearer undefined" un laissez-passer public.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[Cron] CRON_SECRET non configuré — ingestion refusée')
    return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()

  try {
    const results = await fetchAllSources()

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

    const durationMs = Date.now() - startedAt
    console.log('[Cron] fetch-news terminé:', { ...summary, durationMs })

    return NextResponse.json({
      ok: true,
      summary,
      durationMs,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Cron] fetch-news erreur:', err)
    return NextResponse.json(
      { error: String(err), durationMs: Date.now() - startedAt },
      { status: 500 }
    )
  }
}
