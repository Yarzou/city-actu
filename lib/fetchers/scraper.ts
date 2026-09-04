import * as cheerio from 'cheerio'
import type { Source, ScrapingConfig } from '@/lib/types'
import type { FetchedItem } from './rss'
import { chunk } from './batch'
import { parisWallClockToISO, parseFrenchTimeRange, parisDateISO, parseFrenchRelativeDay } from './dates'

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
 *   "Samedi 22 et dimanche 23 août"
 *   "Le samedi 10 juin"
 *
 * Returns { start, end } as ISO strings, or null if unparseable.
 * The year is inferred: current year, bumped to next year if the end date is already past.
 *
 * Note: month names are matched with \p{L} rather than \w — \w excludes accented
 * letters, which silently truncated "août" to "ao" and broke every accented month.
 */
export function parseFrenchDateRange(text: string): { start: string; end: string } | null {
  const normalized = text.toLowerCase().replace(/1er/g, '1').replace(/\s+/g, ' ').trim()

  // Pattern: "du <day?> <num> <month?> au <day?> <num> <month> <year?>"
  const rangeRe = /du\s+(?:\p{L}+\s+)?(\d{1,2})\s*(\p{L}+)?\s+au\s+(?:\p{L}+\s+)?(\d{1,2})\s+(\p{L}+)(?:\s+(\d{4}))?/u
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

  // Pattern: "<day?> <num> et <day?> <num> <month> <year?>"
  // Common on municipal agendas: "Samedi 22 et dimanche 23 août".
  // Must be tried before the single-date pattern, which would stop on "et".
  const pairRe = /(?:\p{L}+\s+)?(\d{1,2})\s+et\s+(?:\p{L}+\s+)?(\d{1,2})\s+(\p{L}+)(?:\s+(\d{4}))?/u
  const pairMatch = normalized.match(pairRe)

  if (pairMatch) {
    const startDay = parseInt(pairMatch[1])
    const endDay   = parseInt(pairMatch[2])
    const monthNum = FRENCH_MONTHS[pairMatch[3]]

    if (monthNum) {
      const year  = pairMatch[4] ? parseInt(pairMatch[4]) : inferYear(endDay, monthNum)
      const start = toISO(startDay, monthNum, year)
      const end   = toISO(endDay, monthNum, year)
      if (start && end) return { start, end }
    }
  }

  // Pattern: "le <day?> <num> <month> <year?>"
  const singleRe = /(?:le\s+)?(?:\p{L}+\s+)?(\d{1,2})\s+(\p{L}+)(?:\s+(\d{4}))?/u
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

/**
 * Ancre une date à midi **heure de Paris**.
 *
 * Utilisait `new Date(y, m, d, 12, 0, 0)`, soit midi à l'heure du serveur : sur Vercel
 * qui tourne en UTC, ça donnait 12 h UTC, affiché 14 h à Paris. Invisible dans le feed
 * (`formatEventDateRange` n'affiche pas l'heure) mais bien visible dans les exports
 * .ics, qui proposaient 14 h pour un événement dont l'heure était en réalité inconnue.
 */
function toISO(day: number, month: number, year: number, time: string | null = null): string | null {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return parisWallClockToISO(iso, time)
}

/** Pages de détail récupérées en parallèle. Voir le commentaire sur l'appelant. */
const DETAIL_CONCURRENCY = 4

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

    // Les horaires ne sont pas dans la div de date mais dans le corps de l'article
    // (« ... au Complexe sportif de Mazaire de 9h à 17h. »). On les cherche dans le
    // parent du sélecteur de date, et non dans toute la page : le pied de page du site
    // affiche les horaires d'ouverture de la mairie, qui seraient un faux positif
    // parfait.
    const scopeText = $(selector).first().parent().text().replace(/\s+/g, ' ')
    const time = parseFrenchTimeRange(scopeText)

    const startDay = parisDateISO(new Date(range.start))
    const endDay   = parisDateISO(new Date(range.end))

    return {
      published_at: parisWallClockToISO(startDay, time?.start ?? null),
      event_end_date: startDay === endDay
        // Même jour : on ne pose une fin que si l'heure de fin est connue.
        ? (time?.end ? parisWallClockToISO(startDay, time.end) : null)
        : parisWallClockToISO(endDay, time?.end ?? null),
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
      const locationEl = config.location_selector
        ? $(el).find(config.location_selector).first()
        : null

      const title = titleEl.text().trim()
      let url = linkEl.attr('href') ?? titleEl.closest('a').attr('href') ?? ''
      if (url && !url.startsWith('http')) {
        url = url.startsWith('/') ? `${baseUrl}${url}` : `${baseUrl}/${url}`
      }

      if (!title || !url) return

      // Optional title filter: skip items that don't match (e.g. keep only "guinguette")
      if (config.title_filter) {
        let keep: boolean
        try {
          keep = new RegExp(config.title_filter, 'i').test(title)
        } catch {
          keep = title.toLowerCase().includes(config.title_filter.toLowerCase())
        }
        if (!keep) return
      }

      const content = contentEl?.text().trim().slice(0, 500) ?? null
      const image = imageEl?.attr('src') ?? imageEl?.attr('data-src') ?? null
      const dateText = dateEl?.attr('content') ?? dateEl?.text().trim() ?? null
      const endDateText = endDateEl?.attr('content') ?? endDateEl?.text().trim() ?? null
      const published_at = dateText ? parseFrenchDate(dateText) : null
      const event_end_date = endDateText ? parseFrenchDate(endDateText) : null

      const location = locationEl?.text().replace(/\s+/g, ' ').trim().slice(0, 200) || null

      items.push({ title, url, content_preview: content, image_url: image, published_at, event_end_date, location })
    })

    // If detail_date_selector is configured, enrich each item with dates from its detail page.
    // Par lots de DETAIL_CONCURRENCY et non en série : chaque page a 10 s de timeout, et une
    // liste d'agenda un peu fournie face à un serveur lent suffirait à épuiser à elle seule
    // les 60 s allouées au cron (plan Hobby), faisant échouer toute l'ingestion. Le lot reste
    // petit pour ne pas marteler le site de la mairie.
    if (config.detail_date_selector && items.length > 0) {
      const selector = config.detail_date_selector
      const pending = items.filter((item) => !item.published_at && item.url)

      for (const batch of chunk(pending, DETAIL_CONCURRENCY)) {
        await Promise.all(
          batch.map(async (item) => {
            const dates = await fetchDetailDates(item.url, selector)
            item.published_at   = dates.published_at
            item.event_end_date = dates.event_end_date
          })
        )
      }
    }

    return items
  } catch (err) {
    console.error(`[Scraping] Erreur source "${source.name}":`, err)
    return []
  }
}

/**
 * Résout la date d'un élément de liste. **L'ordre des tentatives est la partie qui
 * compte**, et il était faux :
 *
 * `new Date(text)` était essayé en premier. C'est le parseur permissif de V8, dont le
 * comportement hors ISO 8601 n'est pas spécifié, et qui lit les dates à l'américaine :
 * `new Date('05/09/2026')` rend le **9 mai**, pas le 5 septembre. La branche `DD/MM/YYYY`
 * juste en dessous était donc du code mort pour ce format. Il avalait aussi les dates
 * françaises en texte (« Samedi 5 septembre 2026 ») par une analyse au mot le plus
 * proche, qui tombait juste par chance.
 *
 * Les formats explicites passent maintenant d'abord, du plus contraint au plus permissif,
 * et le parseur de V8 ne sert plus que de dernier recours.
 */
export function parseFrenchDate(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // 1. ISO 8601 — le cas des sources bien faites. fest.fr expose ainsi l'instant exact
  //    dans l'attribut `content` de ses microdonnées schema.org
  //    (`<div itemprop="startDate" content="2026-09-05T07:30Z">Demain à 9h30</div>`), et
  //    l'appelant préfère déjà cet attribut au texte visible. Rien à deviner.
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}|$)/.test(trimmed)) {
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  // Heure murale éventuelle, réutilisée par les branches suivantes. Absente ⇒ ancrage à
  // midi par `parisWallClockToISO`, qui est le marqueur convenu d'« heure inconnue ».
  const time = parseFrenchTimeRange(trimmed)?.start ?? null

  // 2. JJ/MM/AAAA, dans l'ordre français, avant tout recours à `new Date`.
  const slashes = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (slashes) {
    const [, day, month, year] = slashes
    return toISO(parseInt(day), parseInt(month), parseInt(year), time)
  }

  // 3. Jour relatif : « Demain à 9h30 », « Aujourd'hui à 20h », « Ce soir ».
  const relative = parseFrenchRelativeDay(trimmed)
  if (relative) return parisWallClockToISO(relative, time)

  // 4. Date française en texte : « Samedi 5 septembre 2026 », « Du 10 au 14 juin ».
  const range = parseFrenchDateRange(trimmed)
  if (range) {
    // `parseFrenchDateRange` ancre à midi ; si le texte porte une heure, on la remet.
    if (!time) return range.start
    return parisWallClockToISO(parisDateISO(new Date(range.start)), time)
  }

  // 5. Dernier recours, pour les formats machine non ISO (RFC 1123 et compagnie).
  const loose = new Date(trimmed)
  return isNaN(loose.getTime()) ? null : loose.toISOString()
}
