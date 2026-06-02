import { createClient } from '@supabase/supabase-js'
import { fetchRssFeed } from './rss'
import { fetchScrapingSource } from './scraper'
import type { Source } from '@/lib/types'

// Use service role to bypass RLS during cron writes
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface FetchResult {
  sourceId: number
  fetched: number
  inserted: number
  skipped: number
  errors: string[]
}

export async function fetchAllSources(citySlug?: string): Promise<FetchResult[]> {
  const supabase = getServiceClient()

  let query = supabase
    .from('sources')
    .select('*, city:cities(id,slug), category:categories(id,slug)')
    .eq('active', true)

  if (citySlug) {
    const { data: city } = await supabase.from('cities').select('id').eq('slug', citySlug).single()
    if (city) query = query.eq('city_id', city.id)
  }

  const { data: sources, error } = await query
  if (error || !sources) {
    console.error('[Orchestrator] Impossible de charger les sources:', error)
    return []
  }

  const results: FetchResult[] = []
  for (const source of sources as Source[]) {
    const result = await fetchSource(source)
    results.push(result)
    await sleep(500)
  }
  return results
}

export async function fetchSourceById(sourceId: number): Promise<FetchResult[]> {
  const supabase = getServiceClient()
  const { data: source, error } = await supabase
    .from('sources')
    .select('*, city:cities(id,slug), category:categories(id,slug)')
    .eq('id', sourceId)
    .single()

  if (error || !source) {
    console.error('[Orchestrator] Source introuvable:', sourceId, error)
    return []
  }

  return [await fetchSource(source as Source)]
}

async function fetchSource(source: Source): Promise<FetchResult> {
  const result: FetchResult = {
    sourceId: source.id,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  }

  const items = source.type === 'rss'
    ? await fetchRssFeed(source)
    : await fetchScrapingSource(source)

  result.fetched = items.length
  if (items.length === 0) return result

  const supabase = getServiceClient()

  for (const item of items) {
    if (!item.url) { result.skipped++; continue }

    const { error } = await supabase.from('articles').insert({
      source_id:       source.id,
      city_id:         source.city_id,
      category_id:     source.category_id,
      title:           item.title,
      content_preview: item.content_preview,
      url:             item.url,
      image_url:       item.image_url,
      published_at:    item.published_at,
      is_duplicate:    false,
    })

    if (error) {
      if (error.code === '23505') {
        result.skipped++
      } else {
        result.errors.push(`${item.url}: ${error.message}`)
      }
    } else {
      result.inserted++
    }
  }

  return result
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
