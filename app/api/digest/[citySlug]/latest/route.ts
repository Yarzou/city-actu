import { createClient } from '@/lib/supabase/server'
import { fetchLatestDigest } from '@/lib/digest/latest'

interface RouteParams {
  params: Promise<{ citySlug: string }>
}

/**
 * Le dernier résumé est **public** : un visiteur anonyme ouvre l'onglet « Résumés IA »
 * et lit ce qui a déjà été généré. Les trois autres routes de la famille gardent leur
 * garde — 401 sur `history` et `send-email`, 403 admin sur la génération.
 *
 * La requête elle-même vit dans `lib/digest/latest.ts` (clé service-role, choix de la
 * ligne, compatibilité `city_id IS NULL`) : `app/[citySlug]/page.tsx` l'appelle aussi,
 * pour servir le résumé dans le HTML quand on arrive directement sur `?tab=ia`. Cette
 * route reste nécessaire pour les entrées côté client — changement d'onglet, ou
 * rechargement après une suppression.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { citySlug } = await params
  const supabase = await createClient()

  const result = await fetchLatestDigest(supabase, citySlug)

  if (!result.ok) {
    return result.reason === 'city-not-found'
      ? Response.json({ error: 'Ville introuvable' }, { status: 404 })
      : Response.json({ error: result.message }, { status: 500 })
  }

  if (!result.digest) {
    return Response.json({ digest: null, message: 'Aucun résumé à la demande disponible.' })
  }

  return Response.json(result.digest)
}
