import * as cheerio from 'cheerio'
import type { Source, ScrapingConfig } from '@/lib/types'
import type { FetchedItem } from './rss'

export async function fetchScrapingSource(source: Source): Promise<FetchedItem[]> {
  const config = source.scraping_config as ScrapingConfig | null
  if (!config) {
    console.error(`[Scraping] Config manquante pour "${source.name}"`)
    return []
  }

  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'VilleActu/1.0 (agregateur actualites locales)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.error(`[Scraping] HTTP ${res.status} pour "${source.name}" (${source.url})`)
      return []
    }

    const html = await res.text()
    const $ = cheerio.load(html)
    const items: FetchedItem[] = []
    const baseUrl = config.base_url ?? new URL(source.url).origin

    $(config.list_selector).each((_, el) => {
      const titleEl = $(el).find(config.title_selector).first()
      const linkEl   = $(el).find(config.link_selector).first()
      const contentEl = config.content_selector
        ? $(el).find(config.content_selector).first()
        : null
      const imageEl = config.image_selector
        ? $(el).find(config.image_selector).first()
        : null
      const dateEl = config.date_selector
        ? $(el).find(config.date_selector).first()
        : null

      const title = titleEl.text().trim()
      let url = linkEl.attr('href') ?? titleEl.closest('a').attr('href') ?? ''
      if (url && !url.startsWith('http')) {
        url = url.startsWith('/') ? `${baseUrl}${url}` : `${baseUrl}/${url}`
      }

      if (!title || !url) return

      const content = contentEl?.text().trim().slice(0, 500) ?? null
      const image = imageEl?.attr('src') ?? imageEl?.attr('data-src') ?? null
      const dateText = dateEl?.attr('content') ?? dateEl?.text().trim() ?? null
      const published_at = dateText ? parseFrenchDate(dateText) : null

      items.push({ title, url, content_preview: content, image_url: image, published_at })
    })

    return items
  } catch (err) {
    console.error(`[Scraping] Erreur source "${source.name}":`, err)
    return []
  }
}

function parseFrenchDate(text: string): string | null {
  try {
    const d = new Date(text)
    if (!isNaN(d.getTime())) return d.toISOString()
    // Try DD/MM/YYYY or DD/MM/YYYY HH:MM
    const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (match) {
      return new Date(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`).toISOString()
    }
    return null
  } catch {
    return null
  }
}
