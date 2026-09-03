import { isUnknownTime } from '@/lib/fetchers/dates'

/**
 * Génération de fichiers iCalendar (RFC 5545) pour le bouton « Ajouter au calendrier ».
 *
 * Fonctions pures, sans accès base : la route API fournit les données déjà lues.
 */

export interface CalendarEvent {
  /** Identifiant de l'article, sert à construire un UID stable. */
  id: number
  title: string
  description: string | null
  /** Lieu de l'événement ; à défaut, l'appelant passe le nom de la ville. */
  location: string | null
  /** Lien vers l'article d'origine. */
  url: string
  start: Date
  /** Fin de l'événement si connue (colonne event_end_date). */
  end: Date | null
}

const PRODID = '-//Ville Actu//Agregateur actus locales//FR'

/** Durée retenue quand la source ne donne pas de fin d'événement. */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000

export function buildEventIcs(event: CalendarEvent, host: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // UID stable : un second ajout met à jour l'entrée existante au lieu de la dupliquer.
    `UID:ville-actu-${event.id}@${host}`,
    `DTSTAMP:${formatUtc(new Date())}`,
    'SEQUENCE:0',
    ...buildDateLines(event),
    `SUMMARY:${escapeText(event.title)}`,
  ]

  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`)
  }

  // Le lien vers la source est toujours ajouté à la description : c'est le seul recours
  // du lecteur si l'horaire est approximatif (cf. commentaire de buildDateLines).
  const description = [event.description, event.url].filter(Boolean).join('\n\n')
  lines.push(`DESCRIPTION:${escapeText(description)}`)
  lines.push(`URL:${escapeText(event.url)}`)

  lines.push('END:VEVENT', 'END:VCALENDAR')

  // CRLF exigé par la RFC — en \n seul, l'import échoue silencieusement sur iOS.
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/**
 * Choisit entre journée entière et événement horaire.
 *
 * Trois cas :
 *  - heure inconnue (ancrage de midi, cf. `isUnknownTime`) → journée entière ;
 *  - fin sur un autre jour → journée(s) entière(s), expositions et festivals ;
 *  - sinon → créneau horaire réel.
 *
 * Limite assumée : un événement réellement à 12 h 00 pile est indistinguable d'une
 * heure inconnue, et sortira en journée entière. C'est le bon compromis — mieux vaut
 * une journée entière pour un événement de midi que de faux horaires pour tous ceux
 * dont l'heure est ignorée.
 */
function buildDateLines(event: CalendarEvent): string[] {
  // Heure inconnue (date ancrée à midi par les fetchers) et pas de fin explicite :
  // une journée entière est la seule sortie honnête. Inventer un créneau donnait des
  // horaires faux — un événement « de 9 h à 17 h » ressortait en 14 h-16 h.
  if (isUnknownTime(event.start) && !event.end) {
    return [
      `DTSTART;VALUE=DATE:${formatDate(event.start)}`,
      `DTEND;VALUE=DATE:${formatDate(nextParisDay(event.start))}`,
    ]
  }

  if (event.end && !isSameDay(event.start, event.end)) {
    // DTEND est EXCLUSIF pour les dates : sans le +1 jour, le dernier jour est tronqué.
    return [
      `DTSTART;VALUE=DATE:${formatDate(event.start)}`,
      `DTEND;VALUE=DATE:${formatDate(nextParisDay(event.end))}`,
    ]
  }

  // La RFC exige DTEND strictement postérieur à DTSTART. Une fin égale au début
  // (scraping où les deux sélecteurs pointent la même valeur) donnerait un événement
  // de durée nulle, et une fin antérieure (donnée sale) un fichier invalide.
  const end = event.end && event.end.getTime() > event.start.getTime()
    ? event.end
    : new Date(event.start.getTime() + DEFAULT_DURATION_MS)

  return [
    `DTSTART:${formatUtc(event.start)}`,
    `DTEND:${formatUtc(end)}`,
  ]
}

function isSameDay(a: Date, b: Date): boolean {
  return formatDate(a) === formatDate(b)
}

/** Horodatage UTC (`20261002T180000Z`) : évite d'embarquer un bloc VTIMEZONE. */
function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Date seule (`20261113`), pour les événements en journée entière.
 *
 * Calculée dans le fuseau de Paris et non en UTC : un événement démarrant après
 * minuit heure française est encore la veille en UTC, ce qui décalerait la date
 * d'un jour.
 */
function formatDate(date: Date): string {
  const { year, month, day } = parisDateParts(date)
  return `${year}${pad2(month)}${pad2(day)}`
}

function parisDateParts(date: Date): { year: number; month: number; day: number } {
  // en-CA donne le format ISO "2026-11-13", directement découpable.
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).split('-').map(Number)

  return { year, month, day }
}

/** Jour suivant, en date de Paris. Ancré à midi UTC pour éviter tout effet de bord. */
function nextParisDay(date: Date): Date {
  const { year, month, day } = parisDateParts(date)
  return new Date(Date.UTC(year, month - 1, day + 1, 12))
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Échappement des valeurs texte (RFC 5545 §3.3.11). Les descriptions viennent de
 * sources externes et sont pleines de virgules, qui séparent des valeurs en iCalendar.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Pliage des lignes à 75 octets (RFC 5545 §3.1), continuation préfixée d'une espace.
 *
 * La limite est en **octets**, pas en caractères : plier au milieu d'une séquence
 * UTF-8 produirait des caractères cassés. On compte donc la taille encodée de chaque
 * caractère avant de couper.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line

  const chunks: string[] = []
  let current = ''
  let currentBytes = 0
  // Première ligne : 75 octets. Les suivantes portent une espace de continuation,
  // il ne reste donc que 74 octets utiles.
  let limit = 75

  for (const char of line) {
    const charBytes = encoder.encode(char).length
    if (currentBytes + charBytes > limit) {
      // Ne pas terminer une ligne sur l'antislash d'une séquence d'échappement.
      // Le dépliage la reconstituerait correctement, mais plusieurs clients
      // (Outlook notamment) s'y cassent les dents : on reporte l'antislash sur la
      // ligne suivante. Un nombre pair d'antislashs finaux est un « \\ » déjà
      // complet, il n'y a rien à déplacer.
      let trailing = 0
      while (trailing < current.length && current[current.length - 1 - trailing] === '\\') trailing++
      const carry = trailing % 2 === 1 ? '\\' : ''
      if (carry) current = current.slice(0, -1)

      chunks.push(current)
      current = carry
      currentBytes = carry.length
      limit = 74
    }
    current += char
    currentBytes += charBytes
  }
  if (current) chunks.push(current)

  return chunks.join('\r\n ')
}

/**
 * Nom de fichier ASCII dérivé du titre. Un nom accentué exigerait l'encodage
 * RFC 5987 dans Content-Disposition, complexité inutile ici.
 */
export function buildIcsFilename(title: string, id: number): string {
  const slug = title
    .normalize('NFD')
    // NFD décompose « é » en lettre de base + accent combinant ; le filtre suivant ne
    // garde que l'ASCII imprimable, donc la lettre survit et l'accent disparaît.
    .replace(/[^\x20-\x7E]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')

  return `${slug || `evenement-${id}`}.ics`
}
