/**
 * Helpers de date partagés par les fetchers.
 *
 * Les sources donnent des heures **murales** françaises, sans fuseau. Les convertir
 * demande le décalage réel de Paris à la date concernée, sinon l'affichage dérive
 * d'une à deux heures selon la saison.
 */

/** Heure d'ancrage quand une source donne une date mais aucune heure. */
export const UNKNOWN_TIME = '12:00'

/**
 * Convertit une date/heure murale française en instant UTC.
 *
 * Sans heure, on ancre à midi (`UNKNOWN_TIME`) : la date affichée reste la bonne quel
 * que soit le fuseau du lecteur, et c'est le marqueur convenu de « heure inconnue »
 * (voir `isUnknownTime`).
 */
export function parisWallClockToISO(date: string, time: string | null): string | null {
  const hhmm = /^\d{1,2}:\d{2}/.exec(time ?? '')?.[0] ?? UNKNOWN_TIME
  const [h, m] = hhmm.split(':')
  const provisional = new Date(`${date}T${h.padStart(2, '0')}:${m}:00Z`)
  if (isNaN(provisional.getTime())) return null

  return new Date(provisional.getTime() - parisOffsetMinutes(provisional) * 60_000).toISOString()
}

/** Décalage de Europe/Paris en minutes à un instant donné (+60 ou +120). */
export function parisOffsetMinutes(at: Date): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'longOffset',
  }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value

  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(formatted ?? '')
  if (!match) return 0

  const sign = match[1] === '-' ? -1 : 1
  return sign * (parseInt(match[2]) * 60 + parseInt(match[3]))
}

/** Date de Paris (`"2026-09-06"`) correspondant à un instant. */
export function parisDateISO(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Heure murale de Paris (`"14:00"`) correspondant à un instant. */
export function parisWallClock(at: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at)
}

/**
 * Vrai quand l'instant tombe pile sur l'ancrage de midi, c'est-à-dire quand la source
 * a donné une date sans heure.
 *
 * C'est un marqueur, pas une certitude : un événement réellement à 12 h 00 pile est
 * indistinguable. Le compromis est assumé — il vaut mieux exporter une journée entière
 * pour un événement de midi que d'inventer un créneau horaire pour tous les événements
 * dont on ignore l'heure.
 */
export function isUnknownTime(at: Date): boolean {
  return parisWallClock(at) === UNKNOWN_TIME
}

/**
 * Extrait une plage horaire d'un texte français : « de 9h à 17h », « de 9h30 à 17h »,
 * « 9h-17h », « à 20h30 ».
 *
 * Contrairement à la recherche de *dates* dans la prose — testée et écartée, elle se
 * trompait de 402 jours sur un article — on cherche ici uniquement des heures, sur un
 * motif étroit, et la date est déjà connue par ailleurs. Le risque de faux positif est
 * faible : « de 9h à 17h » ne veut rien dire d'autre.
 */
export function parseFrenchTimeRange(text: string): { start: string; end: string | null } | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')

  // « de 9h à 17h », « de 9h30 à 17h45 », « 9h - 17h »
  const range = /(?:de\s+)?(\d{1,2})\s*h\s*(\d{2})?\s*(?:à|a|-|–|jusqu'à)\s*(\d{1,2})\s*h\s*(\d{2})?/.exec(normalized)
  if (range) {
    const start = toHHMM(range[1], range[2])
    const end = toHHMM(range[3], range[4])
    if (start && end) return { start, end }
  }

  // « à 20h30 », « à 20h » — heure de début seule
  const single = /(?:à|a|dès|des)\s+(\d{1,2})\s*h\s*(\d{2})?/.exec(normalized)
  if (single) {
    const start = toHHMM(single[1], single[2])
    if (start) return { start, end: null }
  }

  return null
}

function toHHMM(hour: string, minute: string | undefined): string | null {
  const h = parseInt(hour)
  const m = minute ? parseInt(minute) : 0
  if (isNaN(h) || h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
