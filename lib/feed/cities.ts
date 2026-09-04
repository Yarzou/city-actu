/**
 * Résolution de la ville courante et liste des villes joignables.
 *
 * Le slug et le nom de La Chapelle-sur-Erdre étaient codés en dur en neuf endroits du
 * code applicatif — `NAV_LINKS`, `DEFAULT_CITY_SLUG`, la redirection racine, le pied de
 * page, le manifeste. Ce module est le point unique qui les remplace.
 *
 * Il ne filtre **pas** sur `published` : c'est la RLS (migration 016) qui le fait, et
 * c'est volontaire. Une ville dépubliée est invisible pour un visiteur parce que la base
 * refuse de la lui rendre, pas parce qu'une clause `.eq()` a été correctement écrite
 * partout. Un administrateur, dont la session satisfait `is_admin()`, les voit toutes —
 * d'où le champ `published` renvoyé, qui permet de marquer les brouillons dans le menu.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Nom du cookie qui mémorise la dernière ville visitée. */
export const CITY_COOKIE = 'ville-actu:city'

/** Un an : la ville d'un utilisateur ne change pas souvent. */
export const CITY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export interface CityListItem {
  id: number
  name: string
  slug: string
  published: boolean
  /**
   * Nom de la catégorie mise en avant, ou null.
   *
   * Il voyage avec la liste parce que la barre de navigation basse vit dans le layout
   * racine : un composant serveur n'a pas accès au chemin de la requête, il ne peut donc
   * pas savoir quelle ville est affichée. La barre, elle, le sait (`usePathname`) et
   * choisit la bonne entrée dans cette liste — correct dès la première visite d'une
   * ville, ce qu'un repli sur le cookie ne serait pas.
   */
  spotlightLabel: string | null
}

/**
 * Les villes que la session courante a le droit de voir, dans l'ordre du menu.
 *
 * `display_order` puis `name` : le nom départage deux villes de même rang, pour que
 * l'ordre reste déterministe d'un chargement à l'autre plutôt que de dépendre de ce que
 * Postgres renvoie en premier. Même règle que les catégories.
 */
export async function listVisibleCities(supabase: SupabaseClient): Promise<CityListItem[]> {
  // L'indice `!cities_spotlight_category_fkey` est obligatoire : il existe deux
  // relations entre `cities` et `categories` (celle-ci et `categories.city_id`), et
  // PostgREST refuse d'imbriquer sans savoir laquelle. La contrainte est nommée dans la
  // migration 016 précisément pour que cet indice soit stable.
  const { data, error } = await supabase
    .from('cities')
    .select('id,name,slug,published, spotlight:categories!cities_spotlight_category_fkey(name)')
    .order('display_order')
    .order('name')

  if (error) {
    console.error('[Villes] liste indisponible:', error)
    return []
  }

  return ((data ?? []) as unknown as {
    id: number
    name: string
    slug: string
    published: boolean
    spotlight: { name: string } | null
  }[]).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    published: c.published,
    spotlightLabel: c.spotlight?.name ?? null,
  }))
}

/**
 * Le slug à afficher quand la route n'en porte pas (`/`, `/a-propos`, `/profil`).
 *
 * Le slug du cookie est **toujours revalidé** contre la liste : un cookie qui désigne
 * une ville depuis supprimée ou dépubliée doit dégrader vers la première ville
 * disponible, jamais produire un 404 sur la page d'accueil.
 *
 * Retourne null quand aucune ville n'est visible — cas d'une base neuve, ou d'un
 * visiteur anonyme alors qu'aucune ville n'est encore publiée.
 */
export function pickCitySlug(cities: CityListItem[], cookieSlug?: string | null): string | null {
  if (cookieSlug && cities.some((c) => c.slug === cookieSlug)) return cookieSlug
  return cities[0]?.slug ?? null
}

/** Raccourci : liste puis choix, quand l'appelant n'a pas besoin de la liste. */
export async function resolveCurrentCitySlug(
  supabase: SupabaseClient,
  cookieSlug?: string | null
): Promise<string | null> {
  return pickCitySlug(await listVisibleCities(supabase), cookieSlug)
}
