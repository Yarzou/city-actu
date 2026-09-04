import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { summarizeRecentArticles, describeLlmFailure } from '@/lib/llm/groq'
import { getCurrentParisDateLabel, getCurrentParisWeekMondayUtcIso, getCurrentParisWeekEndUtcIso } from '@/lib/week'

// Sans cette ligne, la route tombait sur le `maxDuration` par défaut de Vercel, plus
// court que l'appel au LLM sur un prompt long. Les deux autres routes de résumé
// l'exportent déjà.
export const maxDuration = 60

interface RouteParams {
  params: Promise<{ citySlug: string }>
}

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { citySlug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { data: city } = await supabase
    .from('cities').select('id, name').eq('slug', citySlug).single()
  if (!city) {
    return Response.json({ error: 'Ville introuvable' }, { status: 404 })
  }

  // Semaine calendaire en cours, **bornée des deux côtés**. Sans la borne haute, la
  // requête embarquait les événements futurs de l'agenda — `published_at` porte la date
  // de l'événement — et le tri décroissant les faisait passer devant : le « résumé de la
  // semaine » pouvait ne contenir aucun article de la semaine. Voir
  // `getCurrentParisWeekEndUtcIso`.
  const mondayUtcIso = getCurrentParisWeekMondayUtcIso()
  const nextMondayUtcIso = getCurrentParisWeekEndUtcIso()

  const { data: articles } = await supabase
    .from('articles')
    .select('title, content_preview, published_at, fetched_at')
    .eq('city_id', city.id)
    .eq('is_duplicate', false)
    .gte('published_at', mondayUtcIso)
    .lt('published_at', nextMondayUtcIso)
    .order('published_at', { ascending: false })
    .limit(40)

  if (!articles || articles.length === 0) {
    return Response.json({ digest: null, message: 'Aucun article cette semaine.' })
  }

  const result = await summarizeRecentArticles(
    articles.map((article) => ({
      title: article.title as string,
      content_preview: (article.content_preview as string | null) ?? undefined,
      published_at: (article.published_at as string | null) ?? (article.fetched_at as string | null) ?? undefined,
    })),
    {
      cityName: city.name,
      todayDateLabel: getCurrentParisDateLabel(),
    }
  )
  // Le message d'origine, « Échec de la génération du résumé. », ne disait rien : il
  // couvrait aussi bien une clé absente qu'un modèle décommissionné ou une réponse
  // tronquée. Comprendre demandait de lister les modèles de Groq à la main.
  if (!result.ok) {
    return Response.json(
      { error: `Échec de la génération du résumé : ${describeLlmFailure(result.reason, result.status)}` },
      { status: 500 }
    )
  }
  const digest = result.text

  const service = getServiceClient()
  const { data: inserted, error: insertError } = await service
    .from('import_summaries')
    .insert({
      city_id: city.id,
      summary_text: digest,
      articles_count: articles.length,
      source: 'on_demand',
    })
    .select('id, created_at')
    .single()

  if (insertError) {
    return Response.json({ error: `Échec de l'enregistrement du résumé: ${insertError.message}` }, { status: 500 })
  }

  return Response.json({ id: inserted.id, digest, articleCount: articles.length, createdAt: inserted.created_at })
}
