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

/**
 * `cities!inner(slug)` filtre la ville **dans la même requête** que le résumé, au lieu de
 * la résoudre d'abord pour n'utiliser que son `id`. La jointure interne n'est correcte que
 * parce que `city_id` est NOT NULL depuis la migration 019 : avant, elle aurait écarté les
 * résumés hérités à `city_id IS NULL`, que la route rattrapait par une seconde requête.
 *
 * `!inner` et non une simple imbrication : sans lui PostgREST fait une jointure externe et
 * le `.eq('cities.slug', …)` ne filtre plus rien.
 */
const SUMMARY_SELECT = 'id, summary_text, articles_count, created_at, source, cities!inner(slug)'

interface SummaryRow {
  id: number
  summary_text: string
  articles_count: number
  created_at: string
  source: string
  /** Ramené par la jointure de filtrage, jamais lu. */
  cities?: unknown
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
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Les deux requêtes partent **ensemble** : un seul aller-retour de latence là où il y en
  // avait deux à trois en série. Elles ne dépendent plus l'une de l'autre depuis que la
  // ville est filtrée par jointure côté résumé — la première ne sert plus qu'à décider de
  // la visibilité de la ville.
  //
  // Elle reste indispensable, et avec le client de **session** : le client service-role
  // contourne la RLS, donc lui seul ne saurait pas si la ville est visible pour ce
  // visiteur. C'est le point d'accroche du jour où `cities` portera un `published` — ne
  // pas la supprimer sous prétexte que son résultat n'alimente plus la seconde requête.
  const [{ data: city }, { data: summaries, error }] = await Promise.all([
    sessionClient.from('cities').select('id').eq('slug', citySlug).maybeSingle(),
    service
      .from('import_summaries')
      .select(SUMMARY_SELECT)
      .eq('cities.slug', citySlug)
      .eq('source', 'on_demand')
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  if (!city) return { ok: false, reason: 'city-not-found' }
  if (error) return { ok: false, reason: 'error', message: error.message }

  const latest = (summaries ?? [])[0] as SummaryRow | undefined
  return { ok: true, digest: latest ? toLatestDigest(latest) : null }
}
