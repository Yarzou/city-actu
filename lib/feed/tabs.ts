/**
 * Onglets de la page d'accueil ville, dans un module neutre.
 *
 * Ils vivaient dans `CityHomePage.tsx`, marqué `'use client'`. Un composant serveur
 * qui importe une valeur depuis un module client n'en reçoit pas la valeur mais une
 * référence client : `FEED_TABS.includes(...)` sur le serveur ne se comporte pas
 * comme un tableau. Le module doit donc être partagé et sans directive.
 */

export const FEED_TABS = ['actus', 'metropole', 'favoris', 'ia'] as const
export type HomeTab = (typeof FEED_TABS)[number]

/**
 * La catégorie sortie du feed « Actus » et présentée dans son propre onglet.
 *
 * C'était `guinguettes`. La bascule vers `metropole` (migration 017) vient de fest.fr :
 * le site n'a pas de page communale — `/agenda/loire-atlantique/la-chapelle-sur-erdre`
 * répond 200 mais sert les événements des alentours — donc ses articles n'ont rien à
 * faire dans le feed chapelain, et tout à faire dans un onglet qui les annonce comme
 * métropolitains.
 *
 * Une seule catégorie peut être mise en avant : `FeedContext.excludeCategoryId` est
 * au singulier, et c'est ce qui la retire du feed « Actus ». Les guinguettes rejoignent
 * donc les catégories ordinaires — elles restent joignables par la pastille `?cat=`,
 * rien n'est perdu.
 */
export const SPOTLIGHT_SLUG = 'metropole'

export function isHomeTab(value: unknown): value is HomeTab {
  return typeof value === 'string' && (FEED_TABS as readonly string[]).includes(value)
}

/**
 * Relit un `?tab=` en acceptant `guinguettes` comme **alias déprécié** de `metropole`.
 *
 * L'alias n'est pas de la politesse : le raccourci du manifeste PWA pointait sur
 * `?tab=guinguettes`, donc les installations existantes le portent encore sur l'écran
 * d'accueil des téléphones, et des liens ont pu être partagés. Sans l'alias, ils
 * retomberaient silencieusement sur « Actus ».
 *
 * Un `?tab=` inconnu vaut « Actus » — le repli existait déjà dans les trois appelants,
 * il est simplement centralisé ici avec l'alias.
 */
export function toHomeTab(value: unknown): HomeTab {
  if (value === 'guinguettes') return 'metropole'
  return isHomeTab(value) ? value : 'actus'
}

/**
 * Le dernier résumé IA est public.
 *
 * L'onglet « Résumés IA » était réservé aux visiteurs connectés : un prédicat
 * `isTabAvailable(tab, isAuthenticated)` le retirait des deux barres de navigation, de
 * la page serveur et de la relecture de `?tab=`. Ce n'est plus le cas — un visiteur
 * anonyme voit l'onglet et le dernier résumé enregistré
 * (`GET /api/digest/[citySlug]/latest`, ouverte à tous).
 *
 * Restent derrière une session : l'historique et l'envoi par mail. Derrière le rôle
 * admin : la génération (coût LLM) et la suppression. Tous les onglets étant désormais
 * proposables à tout le monde, le prédicat n'a plus lieu d'exister — ne pas le
 * réintroduire pour masquer un onglet : c'est le corps de l'onglet qui module ce qu'il
 * propose, via les droits qu'il reçoit en props.
 */

/** Query string canonique d'un onglet — `actus` est l'absence de paramètre. */
export function tabSearch(tab: HomeTab): string {
  return tab === 'actus' ? '' : `?tab=${tab}`
}

/** Paramètres d'URL qui décrivent l'état d'un fil : date, recherche, catégories, mode, mois. */
const FEED_PARAM_KEYS = ['d', 'q', 'cat', 'v', 'm'] as const

/**
 * Ce que chaque onglet avait à l'écran quand on l'a quitté : ses paramètres de fil et
 * sa position de défilement.
 *
 * Les onglets restent montés une fois ouverts (`TabPanel`) : chacun garde ses filtres,
 * comme sur iOS où l'on retrouve un onglet là où on l'avait laissé. Mais l'URL, elle,
 * n'en décrit qu'un. En revenant sur un onglet, `pushTab` y remet donc ses paramètres
 * à lui — sinon le fil, qui adopte l'URL dès qu'il redevient visible, verrait des
 * filtres effacés et rechargerait pour rien.
 *
 * Au niveau du module : la barre d'onglets vit dans le layout, hors de l'arbre de la
 * page. `CityHomePage` écrit les paramètres au fil de l'eau et vide tout au démontage :
 * la mémoire ne survit pas aux onglets qu'elle décrit.
 */
const tabMemory = new Map<HomeTab, { params: string; scrollY?: number }>()

function feedParams(search: Pick<URLSearchParams, 'get'>): string {
  const params = new URLSearchParams()
  for (const key of FEED_PARAM_KEYS) {
    const value = search.get(key)
    if (value) params.set(key, value)
  }
  return params.toString()
}

/** Note les paramètres de fil de l'onglet affiché. Appelé à chaque changement d'URL. */
export function rememberTabParams(tab: HomeTab, search: Pick<URLSearchParams, 'get'>) {
  tabMemory.set(tab, { ...tabMemory.get(tab), params: feedParams(search) })
}

/** Position de défilement de l'onglet au moment où on l'a quitté ; haut de page sinon. */
export function rememberedScrollY(tab: HomeTab): number {
  return tabMemory.get(tab)?.scrollY ?? 0
}

export function forgetTabMemory() {
  tabMemory.clear()
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
 *
 * Les paramètres de fil de l'onglet quitté sont retirés, ceux de l'onglet visé remis
 * (voir `tabMemory`) : un onglet jamais ouvert part sans filtre et en liste. La
 * position de défilement est notée ici, avant que l'URL change — après, le contenu
 * affiché n'est plus celui de l'onglet quitté.
 */
export function pushTab(tab: HomeTab) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  tabMemory.set(toHomeTab(params.get('tab')), { params: feedParams(params), scrollY: window.scrollY })

  if (tab === 'actus') params.delete('tab')
  else params.set('tab', tab)
  for (const key of FEED_PARAM_KEYS) params.delete(key)
  for (const [key, value] of new URLSearchParams(tabMemory.get(tab)?.params ?? '')) params.set(key, value)

  const query = params.toString()
  window.history.pushState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
}
