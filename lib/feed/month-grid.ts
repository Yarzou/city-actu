/**
 * Calcul de la vue mensuelle — fonctions pures, sans React, rejouables hors base.
 *
 * Toutes les clés de jour sont des dates civiles de Paris (`YYYY-MM-DD`) : un
 * événement à 0 h 30 à Paris est la veille en UTC, et le serveur tourne en UTC.
 *
 * Deux produits à partir du même lot : les **compteurs par jour** du bandeau de
 * navigation (`buildMonthGrid`), où un événement compte sur chaque jour qu'il couvre, et
 * les **sections de cartes** (`buildMonthSections`), où il n'apparaît qu'une fois, sous
 * son premier jour dans le mois.
 */

import { parisDateISO } from '@/lib/fetchers/dates'
import type { FeedArticle } from '@/lib/types'
import { addCivilDays, civilDateToISO, civilDayOfWeek, parseCivilDate, type CivilDate } from './paris-time'
import { daysInMonth, type CivilMonth } from './view-params'

/**
 * Au-delà de cette durée, un événement sort des jours pour le groupe « En cours ce
 * mois ». Sans ce seuil, une exposition sur quatre mois marquerait toutes les cases et
 * noierait les événements d'un jour, qui sont la raison d'être de la vue.
 */
export const LONG_EVENT_DAYS = 7

/** Ce que la grille a besoin de lire sur un article. Le lot a déjà exclu les sans-date. */
export type MonthEventLike = Pick<FeedArticle, 'id' | 'published_at' | 'event_end_date'>

export interface MonthCell<T extends MonthEventLike = FeedArticle> {
  /** `YYYY-MM-DD` */
  key: string
  day: number
  inMonth: boolean
  events: T[]
}

export interface MonthGrid<T extends MonthEventLike = FeedArticle> {
  /** Semaines complètes, du lundi au dimanche : 28 à 42 cases. */
  cells: MonthCell<T>[]
  /** Événements de plus de `LONG_EVENT_DAYS` jours, hors grille. */
  longRunning: T[]
  /** Nombre d'événements distincts du mois, courts et longs confondus. */
  total: number
}

export interface MonthSection<T extends MonthEventLike = FeedArticle> {
  /** `YYYY-MM-DD` du jour d'en-tête. */
  key: string
  articles: T[]
}

export interface MonthSections<T extends MonthEventLike = FeedArticle> {
  /** Événements de plus de `LONG_EVENT_DAYS` jours, en tête, par ordre de début. */
  longRunning: T[]
  /** Un groupe par jour qui ouvre au moins un événement, dans l'ordre du mois. */
  sections: MonthSection<T>[]
}

/** Plage civile d'un événement : la fin ne précède jamais le début. */
export function eventDayRange(event: MonthEventLike): { start: string; end: string } {
  // La requête exclut les sans-date ; le repli n'est là que pour le typage.
  const start = parisDateISO(new Date(event.published_at ?? 0))
  const rawEnd = event.event_end_date ? parisDateISO(new Date(event.event_end_date)) : start
  return { start, end: rawEnd < start ? start : rawEnd }
}

/** Nombre de jours civils couverts, bornes incluses. */
export function spanDays(range: { start: string; end: string }): number {
  const a = parseCivilDate(range.start)!
  const b = parseCivilDate(range.end)!
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000) + 1
}

function isLong(event: MonthEventLike): boolean {
  return spanDays(eventDayRange(event)) > LONG_EVENT_DAYS
}

function byStart<T extends MonthEventLike>(a: T, b: T): number {
  return Date.parse(a.published_at ?? '') - Date.parse(b.published_at ?? '')
}

export function buildMonthGrid<T extends MonthEventLike>(month: CivilMonth, events: T[]): MonthGrid<T> {
  const first: CivilDate = { y: month.y, m: month.m, d: 1 }
  const count = daysInMonth(month)
  const last = addCivilDays(first, count - 1)

  // Lundi en tête : `civilDayOfWeek` rend 0 pour dimanche, 1 pour lundi.
  const leading = (civilDayOfWeek(first) + 6) % 7
  const trailing = (7 - ((civilDayOfWeek(last) + 6) % 7) - 1) % 7
  const gridStart = addCivilDays(first, -leading)
  const size = leading + count + trailing

  const cells: MonthCell<T>[] = []
  const byKey = new Map<string, MonthCell<T>>()
  for (let i = 0; i < size; i++) {
    const civil = addCivilDays(gridStart, i)
    const cell: MonthCell<T> = {
      key: civilDateToISO(civil),
      day: civil.d,
      inMonth: civil.m === month.m && civil.y === month.y,
      events: [],
    }
    cells.push(cell)
    byKey.set(cell.key, cell)
  }

  const longRunning: T[] = []
  const firstKey = cells[0].key
  const lastKey = cells[cells.length - 1].key

  for (const event of events) {
    if (!event.published_at) continue
    const range = eventDayRange(event)
    if (spanDays(range) > LONG_EVENT_DAYS) {
      longRunning.push(event)
      continue
    }
    // Chaque jour couvert, borné à la grille : la requête rend aussi ce qui déborde.
    let cursor = range.start < firstKey ? firstKey : range.start
    const stop = range.end > lastKey ? lastKey : range.end
    while (cursor <= stop) {
      byKey.get(cursor)?.events.push(event)
      cursor = civilDateToISO(addCivilDays(parseCivilDate(cursor)!, 1))
    }
  }

  // La requête exclut déjà les sans-date ; le filtre garde le compteur juste si un
  // appelant passe un lot brut.
  return { cells, longRunning, total: events.filter((e) => e.published_at).length }
}

/**
 * Les cartes du mois, regroupées par jour. Un événement court n'apparaît **qu'une
 * fois**, sous son premier jour dans le mois : commencé le 29 septembre et fini le
 * 2 octobre, il ouvre la section du 1er octobre — la carte porte de toute façon sa
 * plage complète.
 */
export function buildMonthSections<T extends MonthEventLike>(month: CivilMonth, events: T[]): MonthSections<T> {
  const firstKey = civilDateToISO({ y: month.y, m: month.m, d: 1 })
  const longRunning: T[] = []
  const byDay = new Map<string, T[]>()

  for (const event of events) {
    if (!event.published_at) continue
    if (isLong(event)) {
      longRunning.push(event)
      continue
    }
    const { start } = eventDayRange(event)
    const key = start < firstKey ? firstKey : start
    const group = byDay.get(key) ?? []
    group.push(event)
    byDay.set(key, group)
  }

  const sections = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, articles]) => ({ key, articles: articles.sort(byStart) }))

  return { longRunning: longRunning.sort(byStart), sections }
}

/**
 * Section visée par un appui sur un jour du bandeau : celle du jour même, sinon la
 * dernière ouverte avant lui — c'est elle qui contient l'événement qui couvre ce jour.
 */
export function sectionKeyForDay(sections: MonthSection<MonthEventLike>[], dayKey: string): string | null {
  let found: string | null = null
  for (const section of sections) {
    if (section.key > dayKey) break
    found = section.key
  }
  return found
}
