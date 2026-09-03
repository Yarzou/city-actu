import type { Source } from '@/lib/types'
import type { FetchedItem } from './rss'

const FETCH_HEADERS = {
  'User-Agent': 'VilleActu/1.0 (agregateur actualites locales)',
  'Accept': 'application/json',
}

// Opendatasoft caps the Explore v2.1 records endpoint at 100 rows per call.
const MAX_LIMIT = 100

/**
 * Une ligne de dataset Opendatasoft. Les noms de champs varient d'un portail à
 * l'autre : le mapping ci-dessous essaie plusieurs alias plutôt que d'imposer
 * le schéma d'un seul dataset.
 */
interface OdsRow {
  [key: string]: unknown
}

const FIELDS = {
  title:       ['nom', 'titre', 'title', 'name', 'intitule'],
  description: ['description_evt', 'description', 'descriptif', 'resume', 'chapeau'],
  url:         ['lien_agenda', 'url', 'lien', 'permalink', 'link'],
  image:       ['media_url', 'image', 'visuel', 'photo', 'illustration'],
  date:        ['date', 'date_debut', 'firstdate_begin', 'start_date', 'date_start'],
  time:        ['heure_debut', 'horaire_debut', 'start_time'],
  place:       ['lieu', 'nom_lieu', 'location', 'equipement'],
  address:     ['adresse', 'adresse_complete', 'rue'],
  city:        ['ville', 'commune', 'city'],
  cancelled:   ['annule', 'cancelled'],
}

/**
 * Récupère un agenda depuis une API Opendatasoft Explore v2.1.
 *
 * Toute la configuration tient dans `source.url` — comme pour une source RSS,
 * il n'y a rien à saisir de plus dans l'admin. L'URL porte le dataset et le
 * filtre ODSQL, par exemple :
 *
 *   https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/
 *     244400404_agenda-evenements-nantes-metropole_v2/records
 *     ?where=code_insee%3D44035%20AND%20date%20%3E%3D%20now(days%3D-7)
 *     &order_by=date
 *
 * `now(days=-7)` est évalué par Opendatasoft à chaque appel : le filtre reste
 * glissant sans qu'on ait à réécrire l'URL.
 */
export async function fetchOpenDataSource(source: Source): Promise<FetchedItem[]> {
  let endpoint: URL
  try {
    endpoint = new URL(source.url)
  } catch {
    console.error(`[OpenData] URL invalide pour "${source.name}": ${source.url}`)
    return []
  }

  // On ne force que la pagination : le reste (dataset, where, order_by) vient de l'URL.
  if (!endpoint.searchParams.has('limit')) {
    endpoint.searchParams.set('limit', String(MAX_LIMIT))
  }

  try {
    const res = await fetch(endpoint.toString(), {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.error(`[OpenData] HTTP ${res.status} sur "${source.name}" (${endpoint.host})`)
      return []
    }

    const payload = await res.json() as { results?: OdsRow[]; error_code?: string; message?: string }

    if (payload.error_code) {
      console.error(`[OpenData] "${source.name}": ${payload.error_code} — ${payload.message}`)
      return []
    }

    const rows = payload.results ?? []
    if (rows.length === 0) return []

    return groupByEvent(rows)
  } catch (err) {
    console.error(`[OpenData] Erreur source "${source.name}" (${source.url}):`, err)
    return []
  }
}

/**
 * Un événement sur plusieurs jours occupe une ligne par date dans ces datasets
 * (une exposition de deux semaines = 14 lignes, même `lien_agenda`).
 *
 * Sans regroupement, `articles.url` étant UNIQUE, seule la première ligne serait
 * insérée et les suivantes comptées en doublons : l'article existerait mais sans
 * date de fin. On agrège donc ici — première date en `published_at`, dernière en
 * `event_end_date`, ce que les cartes savent déjà afficher.
 */
function groupByEvent(rows: OdsRow[]): FetchedItem[] {
  const byUrl = new Map<string, { row: OdsRow; dates: string[] }>()

  for (const row of rows) {
    if (pick(row, FIELDS.cancelled)?.toLowerCase() === 'oui') continue

    const url   = pick(row, FIELDS.url)
    const title = pick(row, FIELDS.title)
    if (!url || !title) continue

    const date = pick(row, FIELDS.date)
    const entry = byUrl.get(url)
    if (entry) {
      if (date) entry.dates.push(date)
    } else {
      byUrl.set(url, { row, dates: date ? [date] : [] })
    }
  }

  const items: FetchedItem[] = []

  for (const [url, { row, dates }] of byUrl) {
    dates.sort()
    const first = dates[0] ?? null
    const last  = dates[dates.length - 1] ?? null

    const published_at = first ? parisWallClockToISO(first, pick(row, FIELDS.time)) : null
    const end          = last && last !== first ? parisWallClockToISO(last, null) : null

    items.push({
      title:           pick(row, FIELDS.title)!.trim(),
      url,
      content_preview: buildPreview(row),
      image_url:       pick(row, FIELDS.image) ?? null,
      published_at,
      event_end_date:  end,
      location:        buildLocation(row),
    })
  }

  return items
}

/**
 * Lieu structuré « salle, adresse, ville », pour le champ LOCATION des exports .ics.
 *
 * Ces champs n'étaient jusqu'ici lus que par `buildPreview`, en repli quand la
 * description manquait — donc perdus dans le cas courant. `adresse` n'était même pas
 * dans la table d'alias.
 */
function buildLocation(row: OdsRow): string | null {
  const parts = [
    pick(row, FIELDS.place),
    pick(row, FIELDS.address),
    pick(row, FIELDS.city),
  ].filter(Boolean)

  return parts.length ? parts.join(', ') : null
}

function buildPreview(row: OdsRow): string | null {
  const description = pick(row, FIELDS.description)
  if (description) {
    return description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) || null
  }

  // Pas de description : le lieu vaut mieux qu'une carte vide.
  const place = pick(row, FIELDS.place)
  const city  = pick(row, FIELDS.city)
  const parts = [place, city].filter(Boolean)
  return parts.length ? parts.join(' — ') : null
}

/** Première valeur non vide parmi une liste d'alias de champs. */
function pick(row: OdsRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

/**
 * Convertit une date/heure locale française en instant UTC.
 *
 * Les datasets donnent une heure murale ("20:00" = 20h à Nantes) sans fuseau.
 * L'interpréter comme de l'UTC décalerait l'affichage d'une à deux heures selon
 * la saison — et ferait basculer un événement de fin de soirée au lendemain.
 * On résout donc le décalage réel de Paris à cette date.
 *
 * Sans heure, on ancre à midi : la date affichée reste la bonne quel que soit
 * le fuseau du lecteur (même convention que `toISO` dans scraper.ts).
 */
function parisWallClockToISO(date: string, time: string | null): string | null {
  const hhmm = /^\d{1,2}:\d{2}/.exec(time ?? '')?.[0] ?? '12:00'
  const [h, m] = hhmm.split(':')
  const provisional = new Date(`${date}T${h.padStart(2, '0')}:${m}:00Z`)
  if (isNaN(provisional.getTime())) return null

  const offsetMinutes = parisOffsetMinutes(provisional)
  return new Date(provisional.getTime() - offsetMinutes * 60_000).toISOString()
}

/** Décalage de Europe/Paris en minutes à un instant donné (+60 ou +120). */
function parisOffsetMinutes(at: Date): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'longOffset',
  }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value

  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(formatted ?? '')
  if (!match) return 0

  const sign = match[1] === '-' ? -1 : 1
  return sign * (parseInt(match[2]) * 60 + parseInt(match[3]))
}
