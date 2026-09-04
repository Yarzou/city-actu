'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Vrai quand la media query s'applique. Faux au rendu serveur : le HTML produit sur
 * le serveur ne connaît pas la largeur de l'écran, donc tout autre choix ferait une
 * divergence d'hydratation.
 *
 * Sert à ne **pas monter** les commandes réservées au desktop plutôt qu'à les
 * masquer en CSS. Le mini-calendrier, par exemple, était monté sur tous les
 * téléphones — il calculait une grille de 42 jours, tirait la locale française de
 * date-fns et déclenchait une requête de dates actives — pour finir en
 * `display: none`.
 *
 * `useSyncExternalStore` et non `useState` + `useEffect` : `matchMedia` est
 * exactement le genre de source externe pour lequel ce hook existe, et il évite
 * l'appel à `setState` dans le corps d'un effet (une passe de rendu de plus au
 * montage, signalée par la règle react-hooks/set-state-in-effect).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    [query]
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** Le point de rupture `sm:` de Tailwind, seul seuil utilisé par le feed. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 640px)')
}
