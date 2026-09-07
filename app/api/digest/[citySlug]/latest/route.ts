import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

interface RouteParams {
  params: Promise<{ citySlug: string }>
}

/**
 * Le dernier résumé est **public** : un visiteur anonyme ouvre l'onglet « Résumés IA »
 * et lit ce qui a déjà été généré. Les trois autres routes de la famille gardent leur
 * garde — 401 sur `history` et `send-email`, 403 admin sur la génération.
 *
 * D'où le client service-role pour cette seule lecture : la RLS d'`import_summaries`
 * (migration 007) n'ouvre le SELECT qu'au rôle `authenticated`, et l'élargir à `anon`
 * exposerait **tout** l'historique de **toutes** les villes via PostgREST. Ici, la
 * requête est figée dans le code — une ligne, la plus récente, à la demande, pour la
 * ville demandée — donc la surface publique reste exactement ce qui est affiché.
 * La ville, elle, est résolue avec le client de session : `cities` est en lecture
 * publique, et une ville dépubliée doit rester introuvable (elle l'est déjà par sa RLS).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { citySlug } = await params
  const supabase = await createClient()

  const { data: city } = await supabase
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .single()

  if (!city) {
    return Response.json({ error: 'Ville introuvable' }, { status: 404 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: citySummaries, error: citySummaryError } = await service
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
    const { data: globalSummaries, error: globalSummaryError } = await service
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
