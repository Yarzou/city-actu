/**
 * Bornes de journée en `Europe/Paris`, indépendantes du fuseau de la machine.
 *
 * Pourquoi ce module existe : le feed calculait ses bornes avec `startOfDay` /
 * `endOfDay` de date-fns, qui travaillent dans le fuseau **local**. Tant que tout
 * était rendu dans le navigateur, « local » valait Europe/Paris et personne ne le
 * voyait. Dès lors que le premier lot d'articles est produit côté serveur (Vercel
 * tourne en UTC), les deux côtés ne calculent plus la même borne : entre 22h et
 * minuit heure de Paris, le serveur est déjà « demain » en UTC. Le lot serveur et
 * le lot client divergeraient, et des articles apparaîtraient puis disparaîtraient
 * à l'hydratation.
 *
 * On raisonne donc en **date civile** (année/mois/jour tels qu'affichés à Paris),
 * jamais en `Date` local, et on ne convertit en instant qu'au dernier moment.
 *
 * Pas de dépendance ajoutée : `Intl.DateTimeFormat` suffit, et il porte déjà la
 * base de données des fuseaux (donc l'heure d'été) du runtime.
 */

const PARIS_TZ = 'Europe/Paris'

/** Date civile : ce qu'un calendrier accroché au mur à Paris affiche. */
export interface CivilDate {
  y: number
  m: number
  d: number
}

const YMD_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARIS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const FULL_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: PARIS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Décalage de Paris par rapport à UTC, en millisecondes, à cet instant précis. */
function parisOffsetMs(at: Date): number {
  // « sv-SE » rend "2026-09-04 14:32:10" : le seul format ISO-like que Intl
  // produise sans bricolage. Relu comme si c'était de l'UTC, l'écart avec
  // l'instant d'origine est exactement le décalage du fuseau.
  const asParisWallClock = FULL_FORMATTER.format(at).replace(' ', 'T') + 'Z'
  return Date.parse(asParisWallClock) - at.getTime()
}

/** La date civile parisienne correspondant à cet instant. */
export function parisCivilDate(at: Date = new Date()): CivilDate {
  const [y, m, d] = YMD_FORMATTER.format(at).split('-').map(Number)
  return { y, m, d }
}

export function civilDateToISO(c: CivilDate): string {
  return `${String(c.y).padStart(4, '0')}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`
}

/** `YYYY-MM-DD` → date civile. Null si la chaîne n'est pas une date valide. */
export function parseCivilDate(value: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])

  // Rejette « 2026-02-31 » : le Date.UTC correspondant déborderait sur mars.
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null
  }
  return { y, m, d }
}

/** 0 = dimanche … 6 = samedi. Calculé sur la date civile, pas sur un instant. */
export function civilDayOfWeek(c: CivilDate): number {
  return new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay()
}

export function addCivilDays(c: CivilDate, days: number): CivilDate {
  const shifted = new Date(Date.UTC(c.y, c.m - 1, c.d + days))
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
  }
}

/** L'instant du premier millième de seconde de cette journée à Paris. */
export function parisStartOfDay(c: CivilDate): Date {
  // On part de minuit interprété en UTC, puis on retire le décalage. Le décalage
  // est relu sur le résultat : les deux nuits de changement d'heure sont les seuls
  // cas où la première estimation tombe dans l'autre régime horaire.
  const guess = new Date(Date.UTC(c.y, c.m - 1, c.d))
  const firstPass = new Date(guess.getTime() - parisOffsetMs(guess))
  const correctedOffset = parisOffsetMs(firstPass)
  return new Date(guess.getTime() - correctedOffset)
}

/** L'instant du dernier millième de seconde de cette journée à Paris. */
export function parisEndOfDay(c: CivilDate): Date {
  return new Date(parisStartOfDay(addCivilDays(c, 1)).getTime() - 1)
}

/**
 * Borne basse du feed par défaut : minuit ce matin, heure de Paris.
 * Gelée par l'appelant pour que toutes les pages d'un même feed la partagent.
 */
export function parisHorizonISO(at: Date = new Date()): string {
  return parisStartOfDay(parisCivilDate(at)).toISOString()
}

/**
 * Une `Date` construite en heure locale → date civile.
 *
 * Réservé aux dates qui *viennent* d'un calendrier local : le mini-calendrier
 * construit ses jours avec `eachDayOfInterval` de date-fns, donc à minuit heure
 * locale. Les relire via `Intl` en Europe/Paris décalerait d'un jour toute machine
 * dont le fuseau n'est pas celui de Paris. On lit donc les composantes locales
 * telles quelles — c'est bien le jour que l'utilisateur a cliqué.
 */
export function buildCivilFromDate(date: Date): CivilDate {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}
