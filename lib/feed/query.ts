/**
 * Requête du feed d'articles, partagée par le rendu serveur et la pagination client.
 *
 * Elle vivait auparavant dans le closure de `ArticleFeed` (`'use client'`), donc le
 * serveur ne pouvait pas produire le premier lot. Le point d'attention en extrayant :
 * les deux côtés doivent produire **exactement** le même lot, sinon l'hydratation
 * fait clignoter la liste. D'où le passage explicite du `horizon` et des bornes de
 * plage en ISO plutôt qu'un recalcul de chaque côté.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Category, FeedArticle } from '@/lib/types'

/**
 * Colonnes explicites plutôt que `*` : `title_search` et `content_preview_search`
 * sont des copies normalisées du titre et de la description (colonnes générées de la
 * migration 010), utiles au `ilike` côté serveur et jamais lues au rendu — les
 * ramener doublait presque le poids utile. La jointure `city` n'est pas lue non plus.
 */
export const FEED_SELECT =
  'id, title, content_preview, url, image_url, published_at, event_end_date, source:sources(name), category:categories(id,name,slug,icon)'

/** Identifiants résolus une fois, réutilisés par toutes les requêtes du feed. */
export interface FeedContext {
  cityId: number
  cityName: string
  /**
   * Catégories retenues. Vide = toutes (sous réserve de `excludeCategoryId`).
   * Un tableau et non plus un identifiant unique : la sélection est cumulative
   * depuis que les catégories ont quitté le segment de route pour `?cat=`.
   */
  categoryIds: number[]
  /**
   * La catégorie mise en avant, sortie du feed « Actus » pour recevoir son propre
   * onglet. Null quand la ville n'en désigne aucune.
   */
  excludeCategoryId: number | null
}

/**
 * Tout ce qu'une page ville a besoin de savoir, en une seule requête.
 *
 * Les catégories accompagnent le contexte parce qu'elles sont désormais propres à la
 * ville : les résoudre séparément demanderait de connaître d'abord l'identifiant de la
 * ville, donc deux allers-retours en série sur le chemin critique du premier rendu.
 * L'imbrication PostgREST les ramène avec la ville.
 */
export interface CityFeedResolution {
  context: FeedContext
  /** Catégories de la ville, triées comme dans l'administration. */
  categories: Category[]
  /** Catégorie mise en avant, ou null — source du libellé et de l'icône de l'onglet. */
  spotlight: Category | null
}

export interface FeedQueryParams {
  context: FeedContext
  /** Bornes ISO du filtre de date, ou null pour le feed par défaut. */
  range: { from: string; to: string } | null
  /** Borne basse du feed par défaut, gelée par l'appelant (voir `parisHorizonISO`). */
  horizon: string
  /** Texte déjà normalisé par `normalizeSearchText`. */
  search: string
  offset: number
  limit: number
}

export interface FeedQueryResult {
  articles: FeedArticle[]
  hasMore: boolean
  error: Error | null
}

/**
 * Résout la ville, ses catégories et sa catégorie mise en avant en **une** requête.
 * Retourne null si la ville n'existe pas *ou n'est pas visible* — l'appelant en fait un
 * `notFound()` côté serveur.
 *
 * La visibilité n'est pas testée ici : la RLS de la migration 016 ne rend une ville
 * dépubliée qu'à un administrateur. Avec le client de session, une ville dépubliée est
 * donc simplement absente du résultat, et le `notFound()` tombe tout seul. C'est
 * volontaire : la règle vit à un seul endroit, la base, plutôt que dans chaque `.eq()`
 * qu'il faudrait penser à écrire.
 *
 * Les catégories sont ramenées par imbrication plutôt que par une seconde requête :
 * leurs slugs ne sont plus uniques globalement (une contrainte `UNIQUE (city_id, slug)`
 * a remplacé l'unicité sur `slug`), donc un `.in('slug', …)` non filtré ramènerait les
 * catégories des autres villes. Les résoudre après la ville coûterait un aller-retour
 * en série sur le chemin critique du premier rendu.
 *
 * `excludeCategoryId` est renseigné même quand des catégories sont sélectionnées : la
 * sélection peut être vidée côté client (bouton « Tout ») et l'exclusion doit alors
 * reprendre effet. Ne pas la résoudre dans ce cas laissait la catégorie mise en avant
 * réapparaître dans le feed « Actus » après un retour à « Tout ».
 *
 * `queryArticles` donne la priorité à `categoryIds` : les deux ne s'appliquent jamais
 * en même temps.
 */
export async function resolveCityFeed(
  supabase: SupabaseClient,
  citySlug: string,
  categorySlugs: string[] = []
): Promise<CityFeedResolution | null> {
  const { data, error } = await supabase
    .from('cities')
    .select(
      'id,name,slug,published,spotlight_category_id, categories(id,city_id,name,slug,icon,color,display_order,created_at)'
    )
    .eq('slug', citySlug)
    .maybeSingle()

  if (error) {
    console.error('[Feed] résolution de ville impossible:', error)
    return null
  }
  if (!data) return null

  const city = data as unknown as {
    id: number
    name: string
    spotlight_category_id: number | null
    categories: Category[] | null
  }

  // PostgREST ne garantit pas l'ordre d'une relation imbriquée : on trie ici, avec la
  // même règle que partout ailleurs (display_order puis name, le nom départageant pour
  // que l'ordre ne dépende pas de ce que Postgres renvoie en premier).
  const categories = [...(city.categories ?? [])].sort(
    (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'fr')
  )

  const spotlight = city.spotlight_category_id
    ? (categories.find((c) => c.id === city.spotlight_category_id) ?? null)
    : null

  const bySlug = new Map(categories.map((c) => [c.slug, c.id]))

  return {
    context: {
      cityId: city.id,
      cityName: city.name,
      categoryIds: categorySlugs
        .map((slug) => bySlug.get(slug))
        .filter((id): id is number => typeof id === 'number'),
      excludeCategoryId: spotlight?.id ?? null,
    },
    categories,
    spotlight,
  }
}

export async function queryArticles(
  supabase: SupabaseClient,
  { context, range, horizon, search, offset, limit }: FeedQueryParams
): Promise<FeedQueryResult> {
  let query = supabase
    .from('articles')
    .select(FEED_SELECT)
    .eq('city_id', context.cityId)
    .eq('is_duplicate', false)

  if (context.categoryIds.length > 0) {
    query = query.in('category_id', context.categoryIds)
  } else if (context.excludeCategoryId !== null) {
    query = query.neq('category_id', context.excludeCategoryId)
  }

  if (range) {
    query = query.gte('published_at', range.from).lte('published_at', range.to)
  } else {
    // Feed par défaut : à partir d'aujourd'hui, plus les événements encore en cours
    // et les articles sans date (les actus de la mairie n'en ont pas — voir
    // memory/architecture.md).
    query = query.or(
      `published_at.gte.${horizon},event_end_date.gte.${horizon},published_at.is.null`
    )
  }

  if (search) {
    const searchPattern = search.split(' ').filter(Boolean).join('%')
    query = query.or(
      `title_search.ilike.%${searchPattern}%,content_preview_search.ilike.%${searchPattern}%`
    )
  }

  // On demande un élément de plus que nécessaire : c'est ce qui permet de savoir
  // s'il reste quelque chose sans recourir à un COUNT. L'ancien test
  // `results.length === requestedSize` affichait « Voir plus » à tort dès que la
  // dernière page tombait pile sur la taille demandée, et le clic ne ramenait rien.
  const { data, error } = await query
    .order('published_at', { ascending: true, nullsFirst: false })
    .order('fetched_at', { ascending: false })
    .range(offset, offset + limit)

  if (error) {
    return { articles: [], hasMore: false, error: new Error(error.message) }
  }

  // PostgREST type les jointures « vers-un » comme des tableaux ; `source` et
  // `category` sont bien des objets uniques ici (relations par clé étrangère).
  const fetched = (data ?? []) as unknown as FeedArticle[]

  return {
    articles: fetched.slice(0, limit),
    hasMore: fetched.length > limit,
    error: null,
  }
}
