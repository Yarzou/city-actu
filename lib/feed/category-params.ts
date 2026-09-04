/**
 * Catégories du feed : sélection cumulative portée par `?cat=`.
 *
 * Elles étaient un segment de route (`/[citySlug]/[categorySlug]`). Deux conséquences
 * qui motivent ce module : cliquer une pastille déclenchait une navigation complète
 * (donc `loading.tsx`, donc une grille de squelettes et une attente serveur), et un
 * segment ne peut porter qu'une catégorie — le cumul était impossible par construction.
 *
 * Même contrat que `date-params.ts` : une valeur d'URL invalide dégrade vers l'état
 * neutre plutôt que de casser la page.
 */

import type { Category } from '@/lib/types'

const SEPARATOR = ','

/**
 * Slugs valides uniquement, triés et dédoublonnés.
 *
 * Le tri n'est pas cosmétique : sans lui, `?cat=sports,agenda` et `?cat=agenda,sports`
 * sont deux URLs pour le même filtre, et la clé de restauration de scroll du feed
 * (`buildScrollContext`) diverge pour rien.
 */
export function parseCategoryParam(
  value: string | string[] | undefined,
  known: Pick<Category, 'slug'>[]
): string[] {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return []

  const knownSlugs = new Set(known.map((c) => c.slug))
  const requested = raw
    .split(SEPARATOR)
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0 && knownSlugs.has(slug))

  return [...new Set(requested)].sort()
}

/** La valeur à écrire dans `?cat=`. Null quand aucune catégorie n'est sélectionnée. */
export function serializeCategoryParam(slugs: string[]): string | null {
  const normalized = [...new Set(slugs.filter(Boolean))].sort()
  return normalized.length > 0 ? normalized.join(SEPARATOR) : null
}

/** Bascule un slug dans la sélection, en conservant la forme canonique. */
export function toggleCategory(selected: string[], slug: string): string[] {
  const next = new Set(selected)
  if (next.has(slug)) next.delete(slug)
  else next.add(slug)
  return [...next].sort()
}
