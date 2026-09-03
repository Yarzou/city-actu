export type SourceType = 'rss' | 'scraping' | 'opendata'

export type FetchStatus = 'ok' | 'error'

export interface City {
  id: number
  name: string
  slug: string
  lat: number
  lng: number
  description: string | null
  created_at: string
}

export interface Category {
  id: number
  name: string
  slug: string
  icon: string
  color: string
  // Ordre d'affichage choisi dans l'admin (flèches haut/bas). Toutes les listes
  // trient par display_order puis name — le name départage si deux catégories
  // partagent la même valeur, pour que l'ordre reste déterministe.
  display_order: number
  created_at: string
}

export interface Source {
  id: number
  city_id: number
  category_id: number
  name: string
  url: string
  type: SourceType
  active: boolean
  scraping_config: ScrapingConfig | null
  created_at: string
  // Santé du dernier fetch (renseignée par lib/fetchers/index.ts)
  last_fetch_at: string | null
  last_fetch_status: FetchStatus | null
  last_fetch_error: string | null
  consecutive_failures: number
  city?: City
  category?: Category
}

export interface ScrapingConfig {
  list_selector: string
  title_selector: string
  link_selector: string
  content_selector?: string
  image_selector?: string
  date_selector?: string
  end_date_selector?: string
  // Lieu de l'événement, repris dans le champ LOCATION des exports .ics.
  location_selector?: string
  detail_date_selector?: string
  base_url?: string
  // Optional case-insensitive regex: only keep items whose title matches.
  // Useful to isolate a theme (e.g. "guinguette") from a broader commune agenda.
  title_filter?: string
}

export interface Article {
  id: number
  source_id: number
  city_id: number
  category_id: number
  title: string
  content_preview: string | null
  url: string
  image_url: string | null
  published_at: string | null
  event_end_date: string | null
  /** Lieu de l'événement, alimenté par les fetchers open data et scraping. */
  location: string | null
  fetched_at: string
  is_duplicate: boolean
  source?: Source
  category?: Category
  city?: City
}

/**
 * Sous-ensemble d'`Article` réellement consommé par le feed et les cartes.
 *
 * Le feed ne demande plus `select('*')` : les colonnes générées `title_search` et
 * `content_preview_search` (migration 010) dupliquent le titre et la description, et
 * les identifiants bruts comme `is_duplicate`/`fetched_at` ne sont jamais lus au rendu.
 * Un `Article` complet reste assignable ici, donc les écrans qui chargent tout
 * (favoris, page article) continuent de fonctionner sans changement.
 */
export type FeedArticle =
  Pick<Article, 'id' | 'title' | 'content_preview' | 'url' | 'image_url' | 'published_at' | 'event_end_date'> & {
    source?: Pick<Source, 'name'>
    category?: Pick<Category, 'id' | 'name' | 'slug' | 'icon'>
  }

export interface UserFavorite {
  user_id: string
  article_id: number
  created_at: string
  article?: Article
}

export interface UserAlert {
  id: number
  user_id: string
  city_id: number
  category_id: number | null
  active: boolean
  created_at: string
  city?: City
  category?: Category | null
}

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  is_admin?: boolean
  created_at: string
}

export interface ImportSummary {
  id: number
  city_id: number | null
  summary_text: string
  articles_count: number
  source: 'refresh' | 'on_demand'
  created_at: string
}

// Couleurs des pastilles de catégorie.
//
// Contrairement à l'icône — qui vient désormais de `categories.icon` en base — la
// couleur reste codée ici : la colonne `categories.color` stocke un nom court
// ("blue"), pas la paire de classes attendue, et Tailwind ne peut de toute façon pas
// générer une classe construite dynamiquement au runtime. Rendre la couleur éditable
// demanderait une palette fermée mappée ici, pas une simple lecture de la colonne.
export const CATEGORY_COLORS: Record<string, string> = {
  'sorties-enfants':  'bg-pink-100 text-pink-800',
  'agenda':           'bg-purple-100 text-purple-800',
  'sports':           'bg-orange-100 text-orange-800',
  'travaux':          'bg-yellow-100 text-yellow-800',
  'guinguettes':      'bg-teal-100 text-teal-800',
}
