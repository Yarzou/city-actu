/**
 * Date de dernière collecte affichée au-dessus du feed.
 *
 * Elle vient de `sources.last_fetch_at` (migration 012), pas de `articles.fetched_at` :
 * une collecte qui ne ramène aucun article neuf ne touche à aucune ligne d'`articles`,
 * et l'entête afficherait alors une date figée alors que les sources ont bien été
 * relues. Les sources sont en lecture publique (RLS « Public read sources »), donc le
 * client de session suffit — aucune clé service-role ici.
 *
 * Seules les sources **actives** comptent : une source désactivée garde la date de son
 * dernier passage, parfois vieille de plusieurs semaines, et elle ne dit plus rien de
 * la fraîcheur du feed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function fetchLastFetchAt(
  supabase: SupabaseClient,
  cityId: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from('sources')
    .select('last_fetch_at')
    .eq('city_id', cityId)
    .eq('active', true)
    .not('last_fetch_at', 'is', null)
    .order('last_fetch_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Une panne ici ne doit pas priver la page de son feed : la ligne « mis à jour le »
  // disparaît, le reste s'affiche.
  if (error || !data) return null

  return (data as { last_fetch_at: string | null }).last_fetch_at
}
