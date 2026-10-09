/**
 * Diffusion des favoris d'un onglet à l'autre.
 *
 * Les onglets restent montés une fois ouverts (voir `TabPanel`) : un cœur touché dans
 * « Actus » doit se voir dans « Favoris », et un favori retiré depuis « Favoris » doit
 * vider le cœur de la carte restée dans le fil caché. Quand chaque onglet repartait de
 * zéro à l'ouverture, la question ne se posait pas.
 *
 * Un événement `window` plutôt qu'un contexte : le fil rendu par le serveur est un
 * enfant `children` de `CityHomePage`, et chaque conteneur tient déjà son propre état
 * de favoris — il suffit de lui dire ce qui a changé. `dispatchEvent` est synchrone,
 * l'onglet d'où part le geste est donc mis à jour aussi vite que par un rappel.
 */

const FAVORITE_EVENT = 'ville-actu:favorite'

export interface FavoriteChange {
  articleId: number
  favorited: boolean
}

/** À appeler après une écriture **réussie** en base, jamais avant. */
export function announceFavorite(change: FavoriteChange) {
  window.dispatchEvent(new CustomEvent<FavoriteChange>(FAVORITE_EVENT, { detail: change }))
}

/** Abonnement ; renvoie de quoi se désabonner, à retourner tel quel par un `useEffect`. */
export function onFavoriteChange(listener: (change: FavoriteChange) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<FavoriteChange>).detail)
  window.addEventListener(FAVORITE_EVENT, handler)
  return () => window.removeEventListener(FAVORITE_EVENT, handler)
}
