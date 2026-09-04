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
import type { FeedArticle } from '@/lib/types'

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
  /** Une seule exclusion : les guinguettes, sorties du feed « Actus ». */
  excludeCategoryId: number | null
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
 * Résout ville et catégories en une seule vague. Retourne null si la ville n'existe
 * pas — l'appelant en fait un `notFound()` côté serveur.
 *
 * Les deux jeux de slugs sont résolus **ensemble**, dans une seule requête
 * `.in('slug', …)`. `excludeCategoryId` est renseigné même quand des catégories sont
 * sélectionnées : la sélection peut être vidée côté client (bouton « Tout ») et
 * l'exclusion doit alors reprendre effet. Ne pas la résoudre dans ce cas laissait les
 * guinguettes réapparaître dans le feed « Actus » après un retour à « Tout ».
 *
 * `queryArticles` donne la priorité à `categoryIds` : les deux ne s'appliquent jamais
 * en même temps.
 */
export async function resolveFeedContext(
  supabase: SupabaseClient,
  citySlug: string,
  categorySlugs: string[] = [],
  excludeCategorySlug?: string
): Promise<FeedContext | null> {
  const slugsToResolve = [
    ...new Set([...categorySlugs, ...(excludeCategorySlug ? [excludeCategorySlug] : [])]),
  ]

  const [{ data: city }, { data: categories }] = await Promise.all([
    supabase.from('cities').select('id,name').eq('slug', citySlug).maybeSingle(),
    slugsToResolve.length > 0
      ? supabase.from('categories').select('id,slug').in('slug', slugsToResolve)
      : Promise.resolve({ data: [] as { id: number; slug: string }[] }),
  ])

  if (!city) return null

  const resolved = city as { id: number; name: string }
  const bySlug = new Map(
    ((categories ?? []) as { id: number; slug: string }[]).map((r) => [r.slug, r.id])
  )

  return {
    cityId: resolved.id,
    cityName: resolved.name,
    categoryIds: categorySlugs
      .map((slug) => bySlug.get(slug))
      .filter((id): id is number => typeof id === 'number'),
    excludeCategoryId: excludeCategorySlug ? (bySlug.get(excludeCategorySlug) ?? null) : null,
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
