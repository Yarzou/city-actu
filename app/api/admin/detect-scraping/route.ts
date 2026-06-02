import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ScrapingConfig } from '@/lib/types'

export const runtime = 'nodejs'

function isUrlSafe(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    const host = url.hostname.toLowerCase()
    const blocked = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^169\.254\./,
      /^::1$/,
      /^0\./,
      /^metadata\.google\.internal$/,
    ]
    return !blocked.some(p => p.test(host))
  } catch {
    return false
  }
}

function detectSelectors(
  $: CheerioAPI,
  pageUrl: string,
): { config: ScrapingConfig; matchedCount: number; sampleTitles: string[] } {
  const origin = new URL(pageUrl).origin

  // Remove structural elements that contain repeated but irrelevant blocks
  $('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="complementary"]').remove()

  // Build frequency map of tag.class combinations
  const freq = new Map<string, Element[]>()
  $('body *').each((_, el) => {
    if (el.type !== 'tag') return
    const tag = el.name
    if (['script', 'style', 'iframe', 'svg', 'path', 'noscript'].includes(tag)) return
    const classes = (el.attribs?.class ?? '').trim().split(/\s+/).filter(c => c.length >= 2)
    for (const cls of classes) {
      const key = `${tag}.${cls}`
      if (!freq.has(key)) freq.set(key, [])
      freq.get(key)!.push(el)
    }
  })

  let bestSelector = ''
  let bestScore = -1
  let bestEls: Element[] = []

  for (const [sel, els] of freq.entries()) {
    if (els.length < 3 || els.length > 60) continue
    let hasLink = false, hasHeading = false, hasImage = false, hasDate = false, hasP = false
    for (const el of els.slice(0, 5)) {
      const $el = $(el)
      if ($el.find('a').length) hasLink = true
      if ($el.find('h1,h2,h3,h4,h5').length) hasHeading = true
      if ($el.find('img').length) hasImage = true
      if ($el.find('time,[class*="date"],[class*="time"]').length) hasDate = true
      if ($el.find('p').length) hasP = true
    }
    if (!hasLink) continue
    let score = 0
    if (hasHeading) score += 10
    if (hasDate)    score += 6
    if (hasImage)   score += 4
    if (hasP)       score += 2
    score += Math.min(els.length, 20)
    if (score > bestScore) { bestScore = score; bestSelector = sel; bestEls = els }
  }

  // Fallback to semantic elements
  if (!bestSelector) {
    for (const sel of ['article', 'li', '.card', '.item', '.post', '.event', '.news']) {
      const matched = $(sel).toArray()
      if (matched.length >= 3) { bestSelector = sel; bestEls = matched as Element[]; break }
    }
  }

  if (!bestSelector || bestEls.length === 0) {
    return { config: { list_selector: '', title_selector: '', link_selector: 'a', base_url: origin }, matchedCount: 0, sampleTitles: [] }
  }

  const sample = $(bestEls[0])

  // Title selector
  let title_selector = ''
  const heading = sample.find('h1,h2,h3,h4,h5').first()
  if (heading.length) {
    title_selector = heading.prop('tagName')!.toLowerCase()
  } else {
    const titleEl = sample.find('[class*="title"],[class*="titre"],[class*="heading"],[class*="name"]').first()
    if (titleEl.length) {
      const cls = (titleEl.attr('class') ?? '').trim().split(/\s+/)[0]
      title_selector = titleEl.prop('tagName')!.toLowerCase() + (cls ? `.${cls}` : '')
    }
  }

  // Image selector
  const image_selector = sample.find('img').length ? 'img' : ''

  // Date selector
  let date_selector = ''
  if (sample.find('time').length) {
    date_selector = 'time'
  } else {
    const dateEl = sample.find('[class*="date"],[class*="when"],[class*="heure"],[class*="jour"]').first()
    if (dateEl.length) {
      const cls = (dateEl.attr('class') ?? '').trim().split(/\s+/)[0]
      date_selector = dateEl.prop('tagName')!.toLowerCase() + (cls ? `.${cls}` : '')
    }
  }

  // Content selector
  const content_selector = sample.find('p').length ? 'p' : ''

  // Base URL if links are relative
  const firstHref = sample.find('a').first().attr('href') ?? ''
  const base_url = firstHref && !firstHref.startsWith('http') ? origin : ''

  const config: ScrapingConfig = { list_selector: bestSelector, title_selector, link_selector: 'a' }
  if (content_selector) config.content_selector = content_selector
  if (image_selector)   config.image_selector   = image_selector
  if (date_selector)    config.date_selector    = date_selector
  if (base_url)         config.base_url         = base_url

  // Sample titles for preview
  const sampleTitles: string[] = []
  for (const el of bestEls.slice(0, 5)) {
    const $el = $(el)
    const text = title_selector
      ? $el.find(title_selector).first().text().trim()
      : $el.find('a').first().text().trim()
    if (text) sampleTitles.push(text.slice(0, 80))
  }

  return { config, matchedCount: bestEls.length, sampleTitles }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  let url: string
  try {
    const body = await req.json()
    url = body.url
  } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })
  }

  if (!url || typeof url !== 'string' || !isUrlSafe(url)) {
    return NextResponse.json({ error: 'URL invalide ou non autorisée' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'VilleActu/1.0 (agregateur actualites locales)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    })

    if (!res.ok) return NextResponse.json({ error: `Erreur HTTP ${res.status}` }, { status: 422 })

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) {
      return NextResponse.json({ error: 'La page ne retourne pas de HTML (peut nécessiter JavaScript)' }, { status: 422 })
    }

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > 2_000_000) {
      return NextResponse.json({ error: 'Page trop volumineuse' }, { status: 422 })
    }

    const html = new TextDecoder().decode(buffer)
    const $ = cheerio.load(html)
    const result = detectSelectors($, url)

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[detect-scraping]', err)
    return NextResponse.json({ error: 'Impossible de récupérer la page' }, { status: 422 })
  }
}
