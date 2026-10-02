/**
 * Mode d'affichage du feed (`?v=`) et mois affiché (`?m=`), partagés serveur / client.
 *
 * La vue mensuelle est un **mode** du feed et non un onglet : la barre basse mobile a
 * déjà quatre entrées (cinq pour un administrateur) dans des cellules de 75 px, et les
 * catégories comme la recherche s'appliquent aux deux modes sans rien dupliquer.
 *
 * Tout ce qui touche au mois passe par la date civile de Paris (voir `paris-time`),
 * jamais par le mois de la machine : le serveur tourne en UTC.
 */

import { addCivilDays, civilDateToISO, parisCivilDate, parisEndOfDay, parisStartOfDay } from './paris-time'

export type FeedView = 'liste' | 'mois'

/** Un mois civil : `m` de 1 à 12. */
export interface CivilMonth {
  y: number
  m: number
}

/** Toute valeur autre que `mois` dégrade vers la liste, sans erreur. */
export function parseViewParam(value: string | string[] | undefined): FeedView {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'mois' ? 'mois' : 'liste'
}

/** Null pour la liste : c'est le défaut, l'URL reste courte. */
export function serializeViewParam(view: FeedView): string | null {
  return view === 'mois' ? 'mois' : null
}

export function currentCivilMonth(now: Date = new Date()): CivilMonth {
  const { y, m } = parisCivilDate(now)
  return { y, m }
}

/** `YYYY-MM` → mois civil. Toute valeur invalide retombe sur le mois en cours. */
export function parseMonthParam(value: string | string[] | undefined, now: Date = new Date()): CivilMonth {
  const raw = Array.isArray(value) ? value[0] : value
  const match = /^(\d{4})-(\d{2})$/.exec(raw ?? '')
  if (!match) return currentCivilMonth(now)
  const y = Number(match[1])
  const m = Number(match[2])
  if (m < 1 || m > 12 || y < 2000 || y > 2100) return currentCivilMonth(now)
  return { y, m }
}

export function serializeMonth(month: CivilMonth): string {
  return `${month.y}-${String(month.m).padStart(2, '0')}`
}

/** Null pour le mois en cours : comme `v`, le défaut ne s'écrit pas. */
export function serializeMonthParam(month: CivilMonth, now: Date = new Date()): string | null {
  return isSameMonth(month, currentCivilMonth(now)) ? null : serializeMonth(month)
}

export function isSameMonth(a: CivilMonth, b: CivilMonth): boolean {
  return a.y === b.y && a.m === b.m
}

export function addMonths(month: CivilMonth, delta: number): CivilMonth {
  const index = month.y * 12 + (month.m - 1) + delta
  return { y: Math.floor(index / 12), m: (index % 12) + 1 }
}

export function daysInMonth(month: CivilMonth): number {
  // Jour 0 du mois suivant = dernier jour de celui-ci.
  return new Date(Date.UTC(month.y, month.m, 0)).getUTCDate()
}

/** Bornes du mois en instants : premier millième du 1er, dernier millième du dernier jour. */
export function monthBounds(month: CivilMonth): { start: Date; end: Date } {
  const first = { y: month.y, m: month.m, d: 1 }
  const last = addCivilDays(first, daysInMonth(month) - 1)
  return { start: parisStartOfDay(first), end: parisEndOfDay(last) }
}

/** `YYYY-MM-DD` du premier jour, pratique comme clé de cellule. */
export function monthFirstDayKey(month: CivilMonth): string {
  return civilDateToISO({ y: month.y, m: month.m, d: 1 })
}

const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' })

/** « octobre 2026 ». Midi UTC du 1er tombe toujours dans le bon mois à Paris. */
export function formatMonthLabel(month: CivilMonth): string {
  return MONTH_LABEL.format(new Date(Date.UTC(month.y, month.m - 1, 1, 12)))
}

const MONTH_LABEL_SHORT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'short', year: 'numeric' })

/** « oct. 2026 » : pour la rangée de navigation sur mobile, où le nom long ne tient pas. */
export function formatMonthLabelShort(month: CivilMonth): string {
  return MONTH_LABEL_SHORT.format(new Date(Date.UTC(month.y, month.m - 1, 1, 12)))
}
