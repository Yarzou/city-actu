import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchAllSources, fetchSourceById } from '@/lib/fetchers'
import { summarizeArticles } from '@/lib/llm/gemini'

export const runtime = 'nodejs'
export const maxDuration = 300

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  let sourceId: number | undefined
  let cityId: number | undefined
  try {
    const body = await request.json().catch(() => ({}))
    if (body.sourceId) sourceId = Number(body.sourceId)
    if (body.cityId) cityId = Number(body.cityId)
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
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors.length,
      }),
      { sources: 0, fetched: 0, inserted: 0, skipped: 0, errors: 0 }
    )

    let aiSummary: string | null = null
    if (summary.inserted > 0) {
      const allInserted = results.flatMap(r => r.insertedArticles)
      aiSummary = await summarizeArticles(allInserted)

      if (aiSummary) {
        const service = getServiceClient()
        await service.from('import_summaries').insert({
          city_id: cityId ?? null,
          summary_text: aiSummary,
          articles_count: summary.inserted,
          source: 'refresh',
        })
      }
    }

    return NextResponse.json({ ok: true, summary, results, aiSummary, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[Admin] refresh erreur:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
