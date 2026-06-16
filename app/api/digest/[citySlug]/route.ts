import { createClient } from '@/lib/supabase/server'
import { summarizeRecentArticles } from '@/lib/llm/gemini'
import { subDays } from 'date-fns'

interface RouteParams {
  params: Promise<{ citySlug: string }>
}

export async function GET(request: Request, { params }: RouteParams) {
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
    .select('title, content_preview')
    .eq('city_id', city.id)
    .eq('is_duplicate', false)
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false })
    .limit(40)

  if (!articles || articles.length === 0) {
    return Response.json({ digest: null, message: 'Aucun article cette semaine.' })
  }

  const digest = await summarizeRecentArticles(articles)
  if (!digest) {
    return Response.json({ error: 'Échec de la génération du résumé.' }, { status: 500 })
  }

  return Response.json({ digest, articleCount: articles.length })
}
