import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { summarizeRecentArticles } from '@/lib/llm/gemini'

export const runtime = 'nodejs'
export const maxDuration = 60

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

  let limit = 10
  let cityId: number | undefined
  try {
    const body = await request.json().catch(() => ({}))
    if (body.limit) limit = Math.min(Number(body.limit), 30)
    if (body.cityId) cityId = Number(body.cityId)
  } catch {}

  const service = getServiceClient()

  // Compute start of current week (Monday 00:00:00)
  const now = new Date()
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1 // Mon=0 … Sun=6
  const monday = new Date(now)
  monday.setDate(now.getDate() - dayOfWeek)
  monday.setHours(0, 0, 0, 0)

  // Fetch articles from current week, non-duplicate
  let query = service
    .from('articles')
    .select('title, content_preview, city_id')
    .eq('is_duplicate', false)
    .gte('published_at', monday.toISOString())
    .order('published_at', { ascending: false })
    .limit(limit)

  if (cityId) query = query.eq('city_id', cityId)

  const { data: articles, error } = await query

  if (error || !articles || articles.length === 0) {
    return NextResponse.json({ error: error?.message ?? 'Aucun article trouvé' }, { status: 404 })
  }

  const snippets = articles.map(a => ({
    title: a.title as string,
    content_preview: (a.content_preview as string | null) ?? undefined,
  }))

  const aiSummary = await summarizeRecentArticles(snippets)

  if (!aiSummary) {
    return NextResponse.json(
      { error: 'Impossible de générer le résumé. Vérifiez que GEMINI_API_KEY est configurée.' },
      { status: 503 }
    )
  }

  // Persist to import_summaries
  await service.from('import_summaries').insert({
    city_id: cityId ?? (articles[0]?.city_id ?? null),
    summary_text: aiSummary,
    articles_count: articles.length,
    source: 'on_demand',
  })

  return NextResponse.json({ ok: true, aiSummary, articlesCount: articles.length })
}
