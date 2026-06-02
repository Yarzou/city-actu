export type SourceType = 'rss' | 'scraping'

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
  base_url?: string
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
  fetched_at: string
  is_duplicate: boolean
  source?: Source
  category?: Category
  city?: City
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
  created_at: string
}

// Category display metadata
export const CATEGORY_COLORS: Record<string, string> = {
  'infos-pratiques': 'bg-blue-100 text-blue-800',
  'sorties-enfants': 'bg-pink-100 text-pink-800',
  'agenda':          'bg-purple-100 text-purple-800',
  'sports':          'bg-orange-100 text-orange-800',
  'travaux':         'bg-yellow-100 text-yellow-800',
  'emploi':          'bg-green-100 text-green-800',
}

export const CATEGORY_ICONS: Record<string, string> = {
  'infos-pratiques': '🏛️',
  'sorties-enfants': '🎠',
  'agenda':          '📅',
  'sports':          '⚽',
  'travaux':         '🚧',
  'emploi':          '💼',
}
