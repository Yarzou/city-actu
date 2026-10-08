import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import type { Article } from '@/lib/types'
import { isUnknownTime, parisDateISO, parisWallClock } from '@/lib/fetchers/dates'
import { addCivilDays, civilDateToISO, parseCivilDate } from '@/lib/feed/paris-time'

/**
 * tailwind-merge ne connaît pas l'échelle typographique iOS de `globals.css` : il
 * prend `text-caption` ou `text-body` pour des couleurs, et les supprime dès qu'une
 * couleur suit (`text-accent`). Les libellés de la barre d'onglets de Fridge passaient
 * ainsi de 11 à 16 px. On lui déclare ces tailles.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['large-title', 'title', 'headline', 'body', 'subhead', 'footnote', 'caption'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/*
 * Formatage des dates d'événement — toujours en Europe/Paris, jamais en heure locale.
 *
 * Les anciennes fonctions passaient par `isToday` / `format` de date-fns, qui raisonnent
 * dans le fuseau de la machine. La première page étant rendue par le serveur (Vercel,
 * UTC) puis hydratée par le navigateur (Paris), les deux côtés pouvaient produire deux
 * libellés différents pour la même carte entre minuit et 2 h. Tout repose désormais sur
 * `Intl.DateTimeFormat` avec `timeZone` figé, et sur la date civile parisienne.
 */
const PARIS_TZ = 'Europe/Paris'

const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ, weekday: 'short', day: 'numeric', month: 'short',
})
const WEEKDAY_DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
})
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS_TZ, day: 'numeric', month: 'short' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ, day: 'numeric', month: 'short', year: 'numeric',
})
const DAY = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS_TZ, day: 'numeric' })
const LONG_DAY = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ, weekday: 'long', day: 'numeric', month: 'long',
})
const LONG_DAY_YEAR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})

/** Clés de journée `YYYY-MM-DD` d'aujourd'hui, demain et hier, en date civile de Paris. */
function relativeDayKeys(now: Date) {
  const today = parisDateISO(now)
  const civil = parseCivilDate(today)!
  return {
    today,
    tomorrow: civilDateToISO(addCivilDays(civil, 1)),
    yesterday: civilDateToISO(addCivilDays(civil, -1)),
  }
}

function relativeDayLabel(dayKey: string, now: Date): string | null {
  const keys = relativeDayKeys(now)
  if (dayKey === keys.today) return "Aujourd'hui"
  if (dayKey === keys.tomorrow) return 'Demain'
  if (dayKey === keys.yesterday) return 'Hier'
  return null
}

/** « 20h », « 20h30 » — ou null quand l'instant porte l'ancrage « heure inconnue ». */
export function formatEventTime(at: Date): string | null {
  if (isUnknownTime(at)) return null
  const [h, m] = parisWallClock(at).split(':')
  // Certains moteurs ICU rendent minuit « 24:00 » en cycle 24 h.
  const hour = String(parseInt(h, 10) % 24)
  return m === '00' ? `${hour}h` : `${hour}h${m}`
}

/**
 * Date d'une carte : « Aujourd'hui · 20h30 », « sam. 3 oct. », « 3 – 5 oct. »,
 * « 27 juin – 1 nov. », « Jusqu'au 1 nov. » pour un événement déjà commencé.
 *
 * L'heure n'apparaît que sur une date unique et quand la source l'a donnée : les
 * fetchers ancrent à midi les dates sans heure (voir `isUnknownTime`), et afficher
 * « 12h » à tous ces événements inventerait un horaire. L'année n'est ajoutée que si
 * elle diffère de l'année en cours.
 */
export function formatEventDateRange(startStr: string, endStr: string | null, now: Date = new Date()): string {
  const start = new Date(startStr)
  const end = endStr ? new Date(endStr) : null
  const startKey = parisDateISO(start)
  const endKey = end ? parisDateISO(end) : null
  const { today } = relativeDayKeys(now)
  const currentYear = today.slice(0, 4)

  if (!endKey || endKey === startKey) {
    const relative = relativeDayLabel(startKey, now)
    const day = relative ?? (startKey.slice(0, 4) === currentYear
      ? WEEKDAY_DAY_MONTH.format(start)
      : WEEKDAY_DAY_MONTH_YEAR.format(start))
    const time = formatEventTime(start)
    return time ? `${day} · ${time}` : day
  }

  const endLabel = endKey.slice(0, 4) === currentYear ? DAY_MONTH.format(end!) : DAY_MONTH_YEAR.format(end!)

  // Déjà commencé et pas encore fini : c'est la fin qui compte, pas un début passé.
  if (startKey < today && endKey >= today) return `Jusqu'au ${endLabel}`

  // Même mois : « 3 – 5 oct. » ; sinon « 27 juin – 1 nov. ».
  if (startKey.slice(0, 7) === endKey.slice(0, 7)) return `${DAY.format(start)} – ${endLabel}`
  return `${DAY_MONTH.format(start)} – ${endLabel}`
}

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Commune d'un `articles.location`, c'est-à-dire le dernier segment avant la virgule.
 *
 * La valeur n'est pas homogène d'une source à l'autre : `location_selector` sur
 * fest.fr rend l'`addressLocality` seul (« Oudon »), tandis que le fetcher open data
 * assemble « salle, adresse, ville » (`buildLocation`). Chercher la chaîne entière ne
 * remonterait rien dans le second cas — c'est la commune, et elle seule, qui est
 * comparable d'un article à l'autre.
 *
 * Limite assumée : quand l'open data ne fournit pas de ville, le dernier segment est
 * une adresse. Le lien reste cliquable et ne remonte que l'article d'origine, ce qui
 * est inutile mais pas faux.
 */
export function extractLocality(location: string | null | undefined): string | null {
  if (!location) return null
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? null
}

/** Clé de groupe des articles sans date : ils restent visibles en permanence. */
export const UNDATED_DAY_KEY = 'unknown'

/**
 * Regroupe les articles par journée civile de Paris, dans l'ordre d'arrivée.
 *
 * Un événement déjà commencé et toujours en cours (exposition sur quatre mois) est
 * rangé sous **aujourd'hui** et non sous sa date de début : le feed par défaut le
 * remonte en tête parce qu'il est en cours, une rubrique « samedi 27 juin » au-dessus
 * de « Aujourd'hui » serait un contresens. Les articles sans date vont dans
 * `UNDATED_DAY_KEY`.
 */
export function groupByDay<T extends Pick<Article, 'published_at' | 'event_end_date'>>(
  articles: T[],
  now: Date = new Date()
): Map<string, T[]> {
  const { today } = relativeDayKeys(now)
  const map = new Map<string, T[]>()
  for (const article of articles) {
    let key = UNDATED_DAY_KEY
    if (article.published_at) {
      key = parisDateISO(new Date(article.published_at))
      const endKey = article.event_end_date ? parisDateISO(new Date(article.event_end_date)) : null
      if (key < today && endKey && endKey >= today) key = today
    }
    const group = map.get(key) ?? []
    group.push(article)
    map.set(key, group)
  }
  return map
}

/** « Aujourd'hui – mardi 29 septembre », « jeudi 15 janvier 2027 », « Sans date ». */
export function formatDayHeader(dateKey: string, now: Date = new Date()): string {
  if (dateKey === UNDATED_DAY_KEY) return 'Sans date'
  const long = longDayLabel(dateKey, now)
  const relative = relativeDayLabel(dateKey, now)
  return relative ? `${relative} – ${long}` : long
}

/** « samedi 10 octobre », avec l'année seulement si elle diffère de l'année en cours. */
function longDayLabel(dateKey: string, now: Date): string {
  // Midi UTC tombe toujours le même jour civil à Paris (13 h ou 14 h).
  const at = new Date(`${dateKey}T12:00:00Z`)
  const { today } = relativeDayKeys(now)
  return dateKey.slice(0, 4) === today.slice(0, 4) ? LONG_DAY.format(at) : LONG_DAY_YEAR.format(at)
}

/**
 * Les deux moitiés d'un en-tête de jour, pour les styler séparément : le libellé fort
 * (« Aujourd'hui », « Demain », ou le jour de la semaine) et son complément discret
 * (la date). « Aujourd'hui » est mis en avant dans le corail de la palette.
 */
export function dayHeaderParts(
  dateKey: string,
  now: Date = new Date()
): { relative: string; long: string; isToday: boolean } {
  if (dateKey === UNDATED_DAY_KEY) return { relative: 'Sans date', long: '', isToday: false }
  const long = longDayLabel(dateKey, now)
  const relative = relativeDayLabel(dateKey, now)
  if (relative) return { relative, long, isToday: dateKey === relativeDayKeys(now).today }
  // « samedi 10 octobre » → « Samedi » + « 10 octobre »
  const [weekday, ...rest] = long.split(' ')
  return { relative: weekday.charAt(0).toUpperCase() + weekday.slice(1), long: rest.join(' '), isToday: false }
}

function sanitizeHtml(input: string): string {
  const withoutDangerousBlocks = input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  const allowedTags = new Set(['h3', 'p', 'ul', 'li', 'strong', 'br'])

  return withoutDangerousBlocks.replace(/<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?>/g, (fullMatch, tagName) => {
    const safeTag = String(tagName).toLowerCase()
    if (!allowedTags.has(safeTag)) return ''
    const isClosing = fullMatch.startsWith('</')
    return isClosing ? `</${safeTag}>` : `<${safeTag}>`
  })
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatDigestHtml(input: string): string {
  const trimmed = input.trim()
  const looksLikeHtml = /<\s*(h3|p|ul|li|strong)\b/i.test(trimmed)
  if (looksLikeHtml) return sanitizeHtml(trimmed)

  // Backward compatibility for older markdown-like summaries already stored.
  const fallbackHtml = escapeHtml(trimmed)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />')

  return `<p>${fallbackHtml}</p>`
}
