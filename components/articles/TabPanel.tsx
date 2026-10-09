'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Vrai quand le panneau qui contient le composant est l'onglet affiché.
 *
 * Un contexte et non une prop : le fil de l'onglet rendu par le serveur arrive en
 * `children` de `CityHomePage`, construit par un composant serveur qui ne sait pas
 * quel onglet sera affiché ensuite. Hors de tout panneau, la valeur par défaut est
 * « affiché », ce qui laisse les composants utilisables seuls.
 */
const TabActiveContext = createContext(true)

export function useTabActive(): boolean {
  return useContext(TabActiveContext)
}

/**
 * Panneau d'onglet **gardé en vie** : caché par `hidden` (display: none) au lieu d'être
 * démonté. Revenir sur un onglet le retrouve tel quel — liste, filtres, pages déjà
 * chargées — au lieu de repartir de squelettes et de refaire ses requêtes.
 *
 * Caché, un composant continue de vivre : ses effets tournent, ses requêtes aboutissent.
 * C'est ce qui permet de précharger un onglet avant qu'on l'ouvre. Ceux qui ne doivent
 * pas agir en arrière-plan le demandent à `useTabActive()` — le fil, qui ignore l'URL
 * tant qu'elle décrit un autre onglet.
 */
export function TabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <TabActiveContext value={active}>
      <div hidden={!active}>{children}</div>
    </TabActiveContext>
  )
}
