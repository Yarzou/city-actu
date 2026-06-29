import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ citySlug: string }>
}

export async function GET(_request: Request, { params }: RouteParams) {
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

  const { data: citySummaries, error: citySummaryError } = await supabase
    .from('import_summaries')
    .select('summary_text, articles_count, created_at, source')
    .eq('city_id', city.id)
    .eq('source', 'on_demand')
    .order('created_at', { ascending: false })
    .limit(1)

  if (citySummaryError) {
    return Response.json({ error: citySummaryError.message }, { status: 500 })
  }

  let latest = citySummaries?.[0] ?? null

  // Backward compatibility: older on-demand summaries could have city_id = null.
  if (!latest) {
    const { data: globalSummaries, error: globalSummaryError } = await supabase
      .from('import_summaries')
      .select('summary_text, articles_count, created_at, source')
      .is('city_id', null)
      .eq('source', 'on_demand')
      .order('created_at', { ascending: false })
      .limit(1)

    if (globalSummaryError) {
      return Response.json({ error: globalSummaryError.message }, { status: 500 })
    }

    latest = globalSummaries?.[0] ?? null
  }

  if (!latest) {
    return Response.json({ digest: null, message: 'Aucun résumé à la demande disponible.' })
  }

  return Response.json({
    digest: latest.summary_text,
    articleCount: latest.articles_count,
    source: latest.source,
    createdAt: latest.created_at,
  })
}
