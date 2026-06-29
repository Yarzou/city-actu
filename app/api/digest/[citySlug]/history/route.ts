import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ citySlug: string }>
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

function sanitizeLimit(rawLimit: string | null): number {
  const parsed = Number(rawLimit)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(Math.trunc(parsed), MAX_LIMIT)
}

export async function GET(request: Request, { params }: RouteParams) {
  const { citySlug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { data: city } = await supabase
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .single()

  if (!city) {
    return Response.json({ error: 'Ville introuvable' }, { status: 404 })
  }

  const limit = sanitizeLimit(new URL(request.url).searchParams.get('limit'))

  const { data: citySummaries, error: citySummaryError } = await supabase
    .from('import_summaries')
    .select('id, summary_text, articles_count, created_at, source')
    .eq('city_id', city.id)
    .eq('source', 'on_demand')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (citySummaryError) {
    return Response.json({ error: citySummaryError.message }, { status: 500 })
  }

  let summaries = citySummaries ?? []

  // Backward compatibility: older on-demand summaries could have city_id = null.
  if (summaries.length === 0) {
    const { data: globalSummaries, error: globalSummaryError } = await supabase
      .from('import_summaries')
      .select('id, summary_text, articles_count, created_at, source')
      .is('city_id', null)
      .eq('source', 'on_demand')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (globalSummaryError) {
      return Response.json({ error: globalSummaryError.message }, { status: 500 })
    }

    summaries = globalSummaries ?? []
  }

  return Response.json({
    summaries: summaries.map((summary) => ({
      id: summary.id,
      digest: summary.summary_text,
      articleCount: summary.articles_count,
      createdAt: summary.created_at,
      source: summary.source,
    })),
  })
}
