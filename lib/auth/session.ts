import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/authz'

/**
 * Session et statut administrateur, résolus **une fois par requête**.
 *
 * Le layout racine et la page ville appelaient chacun `auth.getUser()` — un
 * aller-retour réseau vers le serveur Auth de Supabase — puis `isAdminUser()`, une
 * requête sur `profiles`. Soit quatre requêtes en série sur le chemin critique du
 * premier octet, pour deux informations. `React.cache` mémoïse par requête : layout,
 * page et `generateMetadata` partagent le même résultat, quel que soit l'ordre dans
 * lequel React les rend.
 *
 * Le rafraîchissement du cookie de session reste dans `proxy.ts`, qui tourne avant et
 * hors de l'arbre React : ce cache ne le remplace pas.
 */
export const getSessionUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export const getSessionIsAdmin = cache(async () => {
  const user = await getSessionUser()
  if (!user) return false
  const supabase = await createClient()
  return isAdminUser(supabase, user.id)
})
