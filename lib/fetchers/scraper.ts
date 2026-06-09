import * as cheerio from 'cheerio'
import type { Source, ScrapingConfig } from '@/lib/types'
import type { FetchedItem } from './rss'

const FETCH_HEADERS = {
  'User-Agent': 'VilleActu/1.0 (agregateur actualites locales)',
  'Accept': 'text/html,application/xhtml+xml',
}

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
}

/**
 * Parses a French date range string such as:
 *   "Du mercredi 10 au dimanche 14 juin"
 *   "Du lundi 1er juin au dimanche 7 juin 2026"
 *   "Le samedi 10 juin"
 *
 * Returns { start, end } as ISO strings, or null if unparseable.
 * The year is inferred: current year, bumped to next year if the end date is already past.
 */
export function parseFrenchDateRange(text: string): { start: string; end: string } | null {
  const normalized = text.toLowerCase().replace(/1er/g, '1').replace(/\s+/g, ' ').trim()

  // Pattern: "du <day?> <num> <month?> au <day?> <num> <month> <year?>"
  const rangeRe = /du\s+(?:\w+\s+)?(\d{1,2})\s*(\w+)?\s+au\s+(?:\w+\s+)?(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/
  const rangeMatch = normalized.match(rangeRe)

  if (rangeMatch) {
    const startDay  = parseInt(rangeMatch[1])
    const midMonth  = rangeMatch[2] // may be absent (e.g. "du 10 au 14 juin")
    const endDay    = parseInt(rangeMatch[3])
    const endMonth  = rangeMatch[4]
    const yearHint  = rangeMatch[5] ? parseInt(rangeMatch[5]) : null

    const endMonthNum = FRENCH_MONTHS[endMonth]
    if (!endMonthNum) return null

    const startMonthNum = midMonth ? (FRENCH_MONTHS[midMonth] ?? endMonthNum) : endMonthNum

    const year = yearHint ?? inferYear(endDay, endMonthNum)

    const start = toISO(startDay, startMonthNum, year)
    const end   = toISO(endDay, endMonthNum, year)
    if (!start || !end) return null
    return { start, end }
  }

  // Pattern: "le <day?> <num> <month> <year?>"
  const singleRe = /(?:le\s+)?(?:\w+\s+)?(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/
  const singleMatch = normalized.match(singleRe)
  if (singleMatch) {
    const day      = parseInt(singleMatch[1])
    const monthStr = singleMatch[2]
    const yearHint = singleMatch[3] ? parseInt(singleMatch[3]) : null

    const monthNum = FRENCH_MONTHS[monthStr]
    if (!monthNum) return null

    const year = yearHint ?? inferYear(day, monthNum)
    const iso  = toISO(day, monthNum, year)
    if (!iso) return null
    return { start: iso, end: iso }
  }

  return null
}

function inferYear(day: number, month: number): number {
  const now  = new Date()
  const year = now.getFullYear()
  const d    = new Date(year, month - 1, day)
  // If the date is more than 30 days in the past, assume next year
  return d.getTime() < now.getTime() - 30 * 24 * 3600 * 1000 ? year + 1 : year
}

function toISO(day: number, month: number, year: number): string | null {
  const d = new Date(year, month - 1, day, 12, 0, 0)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

async function fetchDetailDates(
  url: string,
  selector: string,
): Promise<{ published_at: string | null; event_end_date: string | null }> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { published_at: null, event_end_date: null }

    const html = await res.text()
    const $ = cheerio.load(html)
    const text = $(selector).first().text().trim()
    if (!text) return { published_at: null, event_end_date: null }

    const range = parseFrenchDateRange(text)
    if (!range) return { published_at: null, event_end_date: null }

    return {
      published_at:   range.start,
      event_end_date: range.end !== range.start ? range.end : null,
    }
  } catch {
    return { published_at: null, event_end_date: null }
  }
}

export async function fetchScrapingSource(source: Source): Promise<FetchedItem[]> {
  const config = source.scraping_config as ScrapingConfig | null
  if (!config) {
    console.error(`[Scraping] Config manquante pour "${source.name}"`)
    return []
  }

  try {
    const res = await fetch(source.url, {
      headers: FETCH_HEADERS,
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
      const endDateEl = config.end_date_selector
        ? $(el).find(config.end_date_selector).first()
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
      const endDateText = endDateEl?.attr('content') ?? endDateEl?.text().trim() ?? null
      const published_at = dateText ? parseFrenchDate(dateText) : null
      const event_end_date = endDateText ? parseFrenchDate(endDateText) : null

      items.push({ title, url, content_preview: content, image_url: image, published_at, event_end_date })
    })

    // If detail_date_selector is configured, enrich each item with dates from its detail page
    if (config.detail_date_selector && items.length > 0) {
      for (const item of items) {
        if (!item.published_at && item.url) {
          const dates = await fetchDetailDates(item.url, config.detail_date_selector)
          item.published_at   = dates.published_at
          item.event_end_date = dates.event_end_date
        }
      }
    }

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
