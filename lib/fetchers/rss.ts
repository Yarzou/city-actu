import Parser from 'rss-parser'
import type { Source } from '@/lib/types'

const parser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': 'VilleActu/1.0 (aggregateur actualites locales)',
  },
})

export interface FetchedItem {
  title: string
  url: string
  content_preview: string | null
  image_url: string | null
  published_at: string | null
  event_end_date?: string | null
}

export async function fetchRssFeed(source: Source): Promise<FetchedItem[]> {
  try {
    const feed = await parser.parseURL(source.url)
    return feed.items.map((item) => ({
      title: (item.title ?? '').trim(),
      url: item.link ?? item.guid ?? '',
      content_preview: extractText(item.contentSnippet ?? item.content ?? item.summary ?? null),
      image_url: extractImage(item),
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    })).filter((i) => i.title && i.url)
  } catch (err) {
    console.error(`[RSS] Erreur source "${source.name}" (${source.url}):`, err)
    return []
  }
}

function extractText(raw: string | null): string | null {
  if (!raw) return null
  // Strip HTML tags
  const stripped = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped.slice(0, 500) || null
}

function extractImage(item: Parser.Item & Record<string, unknown>): string | null {
  // Common RSS image fields
  if (typeof item['media:content'] === 'object' && item['media:content'] !== null) {
    const mc = item['media:content'] as Record<string, unknown>
    if (typeof mc['$'] === 'object' && mc['$'] !== null) {
      const attr = mc['$'] as Record<string, string>
      if (attr.url) return attr.url
    }
  }
  if (typeof item.enclosure === 'object' && item.enclosure !== null) {
    const enc = item.enclosure as { url?: string; type?: string }
    if (enc.url && enc.type?.startsWith('image/')) return enc.url
  }
  // Try to extract first img src from content
  const content = (item.content as string | undefined) ?? ''
  const match = content.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match?.[1] ?? null
}
