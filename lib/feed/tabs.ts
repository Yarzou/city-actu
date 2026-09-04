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
