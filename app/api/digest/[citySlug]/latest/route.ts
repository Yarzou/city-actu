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

  // La reprise sur les résumés à city_id = NULL a été retirée : ces lignes héritées
  // avaient été générées pour la ville seedée, donc dès la deuxième ville elles
  // faisaient passer le résumé de l'une pour celui de l'autre. La migration 016 les
  // rattache à leur ville, il n'y a plus d'orphelin à rattraper.
  const latest = citySummaries?.[0] ?? null

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
