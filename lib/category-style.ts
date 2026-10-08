import type { CSSProperties } from 'react'
import {
  Baby,
  CalendarDays,
  Construction,
  Landmark,
  Leaf,
  Map as MapIcon,
  Newspaper,
  Trophy,
  Wine,
  type LucideIcon,
} from 'lucide-react'

/**
 * Identité visuelle d'une catégorie : une tuile colorée façon Réglages d'iOS, icône
 * blanche dessus, et la même teinte pour le libellé sur la carte.
 *
 * Remplace `CATEGORY_COLORS` (paires de classes pastel `bg-pink-100 text-pink-800`),
 * qui supposait une feuille de surcharges `!important` pour le mode sombre. La tuile
 * garde la même teinte dans les deux modes (blanc dessus ≥ 4,5:1) ; seul le libellé a
 * une variante claire pour la carte sombre (`inkDark`).
 *
 * Toujours indexé par slug, et non lu dans `categories.color` : Tailwind ne peut pas
 * générer une classe construite au runtime, d'où les hexadécimaux passés en style. Une
 * catégorie créée depuis l'admin sans entrée ici tombe sur le repli ardoise — c'est le
 * piège à ne pas oublier en ajoutant une catégorie.
 */
export interface CategoryStyle {
  /** Fond de la tuile, et texte du libellé sur carte claire. */
  color: string
  /** Libellé sur carte sombre. */
  inkDark: string
  /** Ciel pâle des illustrations de repli (carte sans photo). */
  sky: string
  icon: LucideIcon
}

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  // Rouge comme l'appli Calendrier : c'est l'agenda.
  agenda: { color: '#d03a2f', inkDark: '#ff7b6e', sky: '#f8d9d4', icon: CalendarDays },
  'infos-pratiques': { color: '#2f6fb3', inkDark: '#7fb0f0', sky: '#d6e5f6', icon: Landmark },
  'sorties-enfants': { color: '#b03a6e', inkDark: '#f47eb4', sky: '#f6d8e6', icon: Baby },
  sports: { color: '#b35a0a', inkDark: '#f5a04a', sky: '#f8e0c8', icon: Trophy },
  'nature-environnement': { color: '#2f7a33', inkDark: '#6fcf73', sky: '#d7eed6', icon: Leaf },
  metropole: { color: '#6e56cf', inkDark: '#a795ff', sky: '#e3ddf9', icon: MapIcon },
  guinguettes: { color: '#9a6700', inkDark: '#e8b54a', sky: '#f5e6c4', icon: Wine },
  travaux: { color: '#56657a', inkDark: '#a7b4c6', sky: '#dfe4ea', icon: Construction },
}

const FALLBACK: CategoryStyle = { color: '#56657a', inkDark: '#a7b4c6', sky: '#dfe4ea', icon: Newspaper }

export function categoryStyle(slug: string | null | undefined): CategoryStyle {
  return (slug && CATEGORY_STYLES[slug]) || FALLBACK
}

/** Variables lues par la classe `.cat-ink` (globals.css) : la teinte du libellé, claire ou sombre. */
export function categoryInkStyle(style: CategoryStyle): CSSProperties {
  return { '--cat-ink': style.color, '--cat-ink-dark': style.inkDark } as CSSProperties
}
