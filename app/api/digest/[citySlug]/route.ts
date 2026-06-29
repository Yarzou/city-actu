import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { summarizeRecentArticles } from '@/lib/llm/gemini'
import { subDays } from 'date-fns'

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

  const since = subDays(new Date(), 7).toISOString()

  const { data: articles } = await supabase
    .from('articles')
    .select('title, content_preview, published_at, fetched_at')
    .eq('city_id', city.id)
    .eq('is_duplicate', false)
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false })
    .limit(40)

  if (!articles || articles.length === 0) {
    return Response.json({ digest: null, message: 'Aucun article cette semaine.' })
  }

  const digest = await summarizeRecentArticles(
    articles.map((article) => ({
      title: article.title as string,
      content_preview: (article.content_preview as string | null) ?? undefined,
      published_at: (article.published_at as string | null) ?? (article.fetched_at as string | null) ?? undefined,
    })),
    { cityName: city.name }
  )
  if (!digest) {
    return Response.json({ error: 'Échec de la génération du résumé.' }, { status: 500 })
  }

  const service = getServiceClient()
  const { data: inserted, error: insertError } = await service
    .from('import_summaries')
    .insert({
      city_id: city.id,
      summary_text: digest,
      articles_count: articles.length,
      source: 'on_demand',
    })
    .select('created_at')
    .single()

  if (insertError) {
    return Response.json({ error: `Échec de l'enregistrement du résumé: ${insertError.message}` }, { status: 500 })
  }

  return Response.json({ digest, articleCount: articles.length, createdAt: inserted.created_at })
}
