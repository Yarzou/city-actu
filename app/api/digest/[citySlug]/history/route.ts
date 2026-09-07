import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ citySlug: string }>
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/**
 * La liste ne renvoie plus `summary_text`.
 *
 * Elle le faisait pour les 20 lignes, soit ~50 ko de JSON (un résumé pèse ~2,5 ko de
 * HTML) que l'onglet téléchargeait et rendait **en entier** à chaque ouverture, alors
 * que seules la date et le nombre d'articles sont visibles avant dépliage. Le corps
 * d'une ligne se demande maintenant à l'unité, avec `?id=`.
 */
const LIST_SELECT = 'id, articles_count, created_at, source'
const DETAIL_SELECT = 'id, summary_text, articles_count, created_at, source'

function sanitizeLimit(rawLimit: string | null): number {
  const parsed = Number(rawLimit)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(Math.trunc(parsed), MAX_LIMIT)
}

function sanitizeId(rawId: string | null): number | null {
  if (rawId === null) return null
  const parsed = Number(rawId)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

interface SummaryRow {
  id: number
  summary_text?: string
  articles_count: number
  created_at: string
  source: string
}

export async function GET(request: Request, { params }: RouteParams) {
  const { citySlug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const searchParams = new URL(request.url).searchParams
  const requestedId = sanitizeId(searchParams.get('id'))

  // ─── Un seul résumé, avec son corps : le dépliage d'une ligne de l'historique ───
  //
  // Filtré sur l'`id` seul, sans recouper la ville. Deux raisons : la RLS de la
  // migration 007 ouvre déjà le SELECT à **tout** utilisateur authentifié (`USING
  // (true)`), donc y ajouter un filtre applicatif ne protégerait rien ; et les résumés
  // hérités portent `city_id IS NULL`, un filtre par ville les rendrait justement
  // illisibles alors que la liste les affiche. La garde utile est le 401 ci-dessus.
  if (requestedId !== null) {
    const { data, error } = await supabase
      .from('import_summaries')
      .select(DETAIL_SELECT)
      .eq('id', requestedId)
      .maybeSingle()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!data) return Response.json({ error: 'Résumé introuvable' }, { status: 404 })

    const row = data as SummaryRow
    return Response.json({
      summary: {
        id: row.id,
        digest: row.summary_text,
        articleCount: row.articles_count,
        createdAt: row.created_at,
        source: row.source,
      },
    })
  }

  // ─── La liste : métadonnées seules ──────────────────────────────────────────────

  const { data: city } = await supabase
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .maybeSingle()

  if (!city) {
    return Response.json({ error: 'Ville introuvable' }, { status: 404 })
  }

  const limit = sanitizeLimit(searchParams.get('limit'))

  const { data: citySummaries, error: citySummaryError } = await supabase
    .from('import_summaries')
    .select(LIST_SELECT)
    .eq('city_id', (city as { id: number }).id)
    .eq('source', 'on_demand')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (citySummaryError) {
    return Response.json({ error: citySummaryError.message }, { status: 500 })
  }

  let summaries = (citySummaries ?? []) as SummaryRow[]

  // Compatibilité : les résumés générés avant l'introduction de `city_id` le portent à
  // NULL. Comme dans `lib/digest/latest.ts`, cette requête ne part que si la ville n'a
  // aucun résumé propre.
  if (summaries.length === 0) {
    const { data: globalSummaries, error: globalSummaryError } = await supabase
      .from('import_summaries')
      .select(LIST_SELECT)
      .is('city_id', null)
      .eq('source', 'on_demand')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (globalSummaryError) {
      return Response.json({ error: globalSummaryError.message }, { status: 500 })
    }

    summaries = (globalSummaries ?? []) as SummaryRow[]
  }

  return Response.json({
    summaries: summaries.map((summary) => ({
      id: summary.id,
      articleCount: summary.articles_count,
      createdAt: summary.created_at,
      source: summary.source,
    })),
  })
}
