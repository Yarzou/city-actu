/**
 * Onglets de la page d'accueil ville, dans un module neutre.
 *
 * Ils vivaient dans `CityHomePage.tsx`, marqué `'use client'`. Un composant serveur
 * qui importe une valeur depuis un module client n'en reçoit pas la valeur mais une
 * référence client : `FEED_TABS.includes(...)` sur le serveur ne se comporte pas
 * comme un tableau. Le module doit donc être partagé et sans directive.
 */

/**
 * `spotlight` remplace l'ancien `guinguettes` : l'onglet thématique n'est plus une
 * catégorie codée en dur mais celle que la ville désigne dans
 * `cities.spotlight_category_id`. Son libellé et son icône viennent de la catégorie.
 */
export const FEED_TABS = ['actus', 'spotlight', 'favoris', 'ia'] as const
export type HomeTab = (typeof FEED_TABS)[number]

/**
 * Ancienne valeur du paramètre `?tab=`, encore présente dans des liens partagés et
 * dans les raccourcis des PWA déjà installées. Elle doit continuer de fonctionner
 * plutôt que de retomber silencieusement sur « Actus ».
 */
const DEPRECATED_TAB_ALIASES: Record<string, HomeTab> = {
  guinguettes: 'spotlight',
}

function isHomeTab(value: unknown): value is HomeTab {
  return typeof value === 'string' && (FEED_TABS as readonly string[]).includes(value)
}

/** Normalise une valeur d'URL en onglet, alias dépréciés compris. */
export function toHomeTab(value: unknown): HomeTab {
  if (isHomeTab(value)) return value
  if (typeof value === 'string' && value in DEPRECATED_TAB_ALIASES) {
    return DEPRECATED_TAB_ALIASES[value]
  }
  return 'actus'
}
