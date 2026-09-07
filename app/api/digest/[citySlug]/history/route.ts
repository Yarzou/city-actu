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
/**
 * `cities!inner(slug)` filtre la ville dans la requête de la liste, ce qui évite de
 * résoudre `cities` d'abord pour n'en tirer qu'un `id`. Correct seulement parce que
 * `city_id` est NOT NULL depuis la migration 019 — une jointure interne aurait sinon
 * écarté les résumés hérités à NULL, d'où la requête de repli qui existait ici.
 *
 * `!inner` est ce qui rend le `.eq('cities.slug', …)` filtrant : sans lui PostgREST fait
 * une jointure externe et ne filtre plus rien.
 */
const LIST_SELECT = 'id, articles_count, created_at, source, cities!inner(slug)'
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

  const searchParams = new URL(request.url).searchParams
  const requestedId = sanitizeId(searchParams.get('id'))
  const limit = sanitizeLimit(searchParams.get('limit'))

  // La lecture part **en même temps** que `auth.getUser()`, qui est un aller-retour réseau
  // vers le serveur Auth de Supabase : les enchaîner doublait la latence de l'ouverture de
  // l'historique. Rien ne fuit — la requête utilise le client de session, donc la RLS
  // d'`import_summaries` (007, `TO authenticated`) ne rend rien à un appelant anonyme, et
  // le 401 ci-dessous jette de toute façon le résultat sans l'émettre.
  //
  // Deux formes de requête, jamais les deux à la fois :
  //   * `?id=` — un résumé **avec son corps**, pour le dépliage d'une ligne. Filtré sur
  //     l'`id` seul : la RLS de 007 ouvre le SELECT à tout utilisateur authentifié
  //     (`USING (true)`), un filtre par ville ne protégerait donc rien de plus.
  //   * sinon — la liste, métadonnées seules, ville filtrée par jointure.
  const [{ data: { user } }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    requestedId !== null
      ? supabase
          .from('import_summaries')
          .select(DETAIL_SELECT)
          .eq('id', requestedId)
          .limit(1)
      : supabase
          .from('import_summaries')
          .select(LIST_SELECT)
          .eq('cities.slug', citySlug)
          .eq('source', 'on_demand')
          .order('created_at', { ascending: false })
          .limit(limit),
  ])

  if (!user) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as SummaryRow[]

  if (requestedId !== null) {
    const row = rows[0]
    if (!row) return Response.json({ error: 'Résumé introuvable' }, { status: 404 })

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

  // Une ville inconnue rend une liste vide et non un 404 : la jointure ne distingue pas
  // « ville absente » de « ville sans résumé », et l'onglet n'en fait rien de différent —
  // c'est la page qui décide du `notFound()`, avec le contexte du feed.
  return Response.json({
    summaries: rows.map((summary) => ({
      id: summary.id,
      articleCount: summary.articles_count,
      createdAt: summary.created_at,
      source: summary.source,
    })),
  })
}
