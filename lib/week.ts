const PARIS_TZ = 'Europe/Paris'

function getParisNowParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PARIS_TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }

  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  }
}

function parisMidnightToUtc(year: number, month: number, day: number) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const sameMomentInParis = new Date(utcGuess.toLocaleString('en-US', { timeZone: PARIS_TZ }))
  const sameMomentInUtc = new Date(utcGuess.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = sameMomentInUtc.getTime() - sameMomentInParis.getTime()
  return new Date(utcGuess.getTime() + offsetMs)
}

/**
 * Minuit (heure de Paris) du lundi de la semaine en cours, décalé de `weekOffset`
 * semaines. Le calcul se fait sur la **date civile parisienne** puis n'est converti en
 * instant qu'à la fin : raisonner en UTC ferait basculer d'un jour entre minuit et 2 h du
 * matin, Vercel tournant en UTC.
 */
function parisWeekMondayUtc(now: Date, weekOffset: number): Date {
  const { weekday, year, month, day } = getParisNowParts(now)
  const weekdayIndex: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }

  const currentDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const daysSinceMonday = weekdayIndex[weekday] ?? 0
  currentDay.setUTCDate(currentDay.getUTCDate() - daysSinceMonday + weekOffset * 7)

  return parisMidnightToUtc(
    currentDay.getUTCFullYear(),
    currentDay.getUTCMonth() + 1,
    currentDay.getUTCDate()
  )
}

/** Borne **basse** de la semaine en cours : lundi 00:00 heure de Paris. */
export function getCurrentParisWeekMondayUtcIso(now = new Date()): string {
  return parisWeekMondayUtc(now, 0).toISOString()
}

/**
 * Borne **haute** de la semaine en cours : lundi suivant 00:00 heure de Paris, exclu.
 *
 * Son absence était un bug de fond des deux routes de résumé. `articles.published_at`
 * porte la date de l'**événement**, souvent dans le futur sur un agrégateur d'agendas :
 * un simple `.gte(lundi)` embarquait les festivals du mois suivant, et comme la requête
 * trie par `published_at DESC` avant de couper à 40 lignes, ce sont les événements les
 * plus lointains qui passaient en premier — les articles de la semaine en cours pouvaient
 * être intégralement chassés de la fenêtre. Le « résumé de la semaine » ne parlait alors
 * pas de la semaine.
 */
export function getCurrentParisWeekEndUtcIso(now = new Date()): string {
  return parisWeekMondayUtc(now, 1).toISOString()
}

export function getCurrentParisDateLabel(now = new Date()): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now)
}
