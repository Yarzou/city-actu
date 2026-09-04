/**
 * Onglets de la page d'accueil ville, dans un module neutre.
 *
 * Ils vivaient dans `CityHomePage.tsx`, marqué `'use client'`. Un composant serveur
 * qui importe une valeur depuis un module client n'en reçoit pas la valeur mais une
 * référence client : `FEED_TABS.includes(...)` sur le serveur ne se comporte pas
 * comme un tableau. Le module doit donc être partagé et sans directive.
 */

export const FEED_TABS = ['actus', 'guinguettes', 'favoris', 'ia'] as const
export type HomeTab = (typeof FEED_TABS)[number]

/** La catégorie sortie du feed « Actus » et présentée dans son propre onglet. */
export const GUINGUETTES_SLUG = 'guinguettes'

export function isHomeTab(value: unknown): value is HomeTab {
  return typeof value === 'string' && (FEED_TABS as readonly string[]).includes(value)
}

/** Query string canonique d'un onglet — `actus` est l'absence de paramètre. */
export function tabSearch(tab: HomeTab): string {
  return tab === 'actus' ? '' : `?tab=${tab}`
}

/**
 * Change d'onglet **sans navigation** : `history.pushState`, que le routeur d'App
 * Router intercepte pour rafraîchir `useSearchParams` sans aller-retour serveur.
 *
 * C'est la seule façon acceptable de changer d'onglet. La barre basse utilisait un
 * `<Link>` vers `?tab=…` : même route, mais Next traitait ça comme une navigation
 * complète — `loading.tsx`, requête RSC, `queryArticles` rejoué côté serveur — soit
 * ~1,5 s de latence au doigt sur mobile, alors que les onglets desktop étaient
 * instantanés parce qu'ils passaient déjà par ici.
 */
export function pushTab(tab: HomeTab) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (tab === 'actus') params.delete('tab')
  else params.set('tab', tab)
  // Changer d'onglet remet les filtres à zéro : ils portent sur un feed précis.
  params.delete('d')
  params.delete('q')
  params.delete('cat')

  const query = params.toString()
  window.history.pushState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
}
