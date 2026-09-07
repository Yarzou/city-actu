/**
 * Lecture du dernier résumé IA d'une ville, partagée par la route HTTP et le rendu
 * serveur de la page.
 *
 * Elle vivait uniquement dans `app/api/digest/[citySlug]/latest/route.ts`, donc l'onglet
 * « Résumés IA » ne pouvait l'obtenir qu'après le clic : téléchargement du chunk, montage
 * du composant, puis un aller-retour HTTP qui rouvrait lui-même deux à trois requêtes
 * Supabase en série. La page résout déjà la ville — autant lire le résumé dans la même
 * passe et l'envoyer dans le HTML.
 *
 * Même raison d'être que `lib/feed/query.ts` pour le feed : un seul endroit construit la
 * requête. La dupliquer ferait diverger ce que le serveur rend et ce que le client
 * recharge.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Ce que l'onglet affiche du dernier résumé. */
export interface LatestDigest {
  id: number
  digest: string
  articleCount: number
  source: string
  createdAt: string
}

/**
 * `ok: true` avec `digest: null` = la ville existe, elle n'a pas encore de résumé. Les
 * deux cas d'échec sont distingués parce que la route en fait un 404 et un 500.
 *
 * L'erreur est **retournée**, pas jetée — comme `queryArticles`. Le rendu serveur de la
 * page ne doit pas tomber en 500 parce qu'`import_summaries` a hoqueté : l'onglet
 * rechargera par la route.
 */
export type LatestDigestResult =
  | { ok: true; digest: LatestDigest | null }
  | { ok: false; reason: 'city-not-found' }
  | { ok: false; reason: 'error'; message: string }

const SUMMARY_SELECT = 'id, summary_text, articles_count, created_at, source'

interface SummaryRow {
  id: number
  summary_text: string
  articles_count: number
  created_at: string
  source: string
}

function toLatestDigest(row: SummaryRow): LatestDigest {
  return {
    id: row.id,
    digest: row.summary_text,
    articleCount: row.articles_count,
    source: row.source,
    createdAt: row.created_at,
  }
}

/**
 * @param sessionClient client de **session** : `cities` est en lecture publique, et une
 *   ville dépubliée doit rester introuvable par sa propre RLS. C'est aussi pourquoi la
 *   résolution de la ville ne passe pas, elle, par la clé service-role.
 *
 * La lecture d'`import_summaries`, en revanche, utilise la clé service-role : la RLS de
 * la migration 007 n'ouvre le SELECT qu'au rôle `authenticated`, et l'élargir à `anon`
 * exposerait **tout** l'historique de **toutes** les villes via PostgREST. Ici la requête
 * est figée dans le code — une ligne, la plus récente, à la demande, pour la ville
 * demandée — donc la surface publique est exactement ce qui est affiché.
 */
export async function fetchLatestDigest(
  sessionClient: SupabaseClient,
  citySlug: string
): Promise<LatestDigestResult> {
  const { data: city } = await sessionClient
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .maybeSingle()

  if (!city) return { ok: false, reason: 'city-not-found' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: citySummaries, error: citySummaryError } = await service
    .from('import_summaries')
    .select(SUMMARY_SELECT)
    .eq('city_id', (city as { id: number }).id)
    .eq('source', 'on_demand')
    .order('created_at', { ascending: false })
    .limit(1)

  if (citySummaryError) return { ok: false, reason: 'error', message: citySummaryError.message }

  const latest = (citySummaries ?? [])[0] as SummaryRow | undefined
  if (latest) return { ok: true, digest: toLatestDigest(latest) }

  // Compatibilité : les résumés à la demande générés avant l'introduction de `city_id`
  // portent `city_id IS NULL`. Cette seconde requête ne part que dans le cas « aucun
  // résumé pour cette ville », elle ne pèse donc pas sur le cas courant.
  const { data: globalSummaries, error: globalSummaryError } = await service
    .from('import_summaries')
    .select(SUMMARY_SELECT)
    .is('city_id', null)
    .eq('source', 'on_demand')
    .order('created_at', { ascending: false })
    .limit(1)

  if (globalSummaryError) return { ok: false, reason: 'error', message: globalSummaryError.message }

  const legacy = (globalSummaries ?? [])[0] as SummaryRow | undefined
  return { ok: true, digest: legacy ? toLatestDigest(legacy) : null }
}
