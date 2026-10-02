'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { cn, formatDayHeader } from '@/lib/utils'
import { CATEGORY_COLORS, type FeedArticle } from '@/lib/types'
import { addMonths, formatMonthLabel, formatMonthLabelShort, isSameMonth, type CivilMonth } from '@/lib/feed/view-params'
import { sectionKeyForDay, type MonthCell, type MonthGrid, type MonthSections } from '@/lib/feed/month-grid'
import { SkeletonCard } from './SkeletonCard'

/**
 * Le mois comme cadre, les cartes comme contenu.
 *
 * Un bandeau de jours en tête, collé sous la barre de navigation, puis les cartes du
 * mois regroupées par jour avec les mêmes en-têtes que la liste. Le bandeau est une
 * table des matières : appuyer sur un jour fait **défiler** jusqu'à sa section, il ne
 * filtre rien. Les cartes gardent toutes leurs actions (favori, partage, calendrier,
 * masquage), ce qu'une grille de puces ne permettait pas.
 */

/** Points de couleur par jour dans le bandeau : une catégorie = un point. */
const DOTS_PER_DAY = 3
const WEEKDAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const LONG_RUNNING_ID = 'jour-en-cours'

/**
 * Hauteur de la barre de navigation plus celle du bandeau : ce qu'une section doit
 * laisser au-dessus d'elle quand on y défile, et la marge haute de l'observateur qui
 * décide quel jour est « visible ».
 */
const SECTION_SCROLL_MARGIN = 'scroll-mt-[calc(var(--header-h)+5.5rem)]'
const OBSERVER_TOP_PX = 150

const NAV_BUTTON =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-ring sm:size-10'

interface MonthNavProps {
  month: CivilMonth
  currentMonth: CivilMonth
  onMonthChange: (month: CivilMonth) => void
}

/**
 * Navigation de mois : flèches, nom du mois, retour au mois en cours. Rendue par
 * `ArticleFeed` **à la place des pastilles de date**, sur la rangée du sélecteur
 * « Liste | Mois » : sans elle, le sélecteur restait seul à droite d'une case vide sur
 * mobile. Libellé court sous 640 px (« oct. 2026 ») pour que la rangée tienne sur une
 * ligne à côté du sélecteur ; « Ce mois-ci » y devient une icône.
 */
export function MonthNav({ month, currentMonth, onMonthChange }: MonthNavProps) {
  const label = formatMonthLabel(month)
  return (
    <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
      <button type="button" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="Mois précédent" className={NAV_BUTTON}>
        <ChevronLeft className="size-5" />
      </button>
      <h2 className="min-w-0 truncate px-1 text-sm font-semibold capitalize text-gray-900 sm:text-lg" aria-live="polite">
        <span className="sm:hidden">{formatMonthLabelShort(month)}</span>
        <span className="hidden sm:inline">{label}</span>
      </h2>
      <button type="button" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Mois suivant" className={NAV_BUTTON}>
        <ChevronRight className="size-5" />
      </button>
      {!isSameMonth(month, currentMonth) && (
        <button
          type="button"
          onClick={() => onMonthChange(currentMonth)}
          aria-label="Revenir au mois en cours"
          title="Ce mois-ci"
          className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-ring sm:size-auto sm:min-h-10 sm:px-3"
        >
          <CalendarCheck className="size-5 sm:size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Ce mois-ci</span>
        </button>
      )}
    </div>
  )
}

interface MonthViewProps {
  month: CivilMonth
  /** `YYYY-MM-DD` d'aujourd'hui en date civile de Paris. */
  todayKey: string
  /** Null tant que le premier mois n'a pas répondu. */
  grid: MonthGrid | null
  sections: MonthSections | null
  loading: boolean
  error: string | null
  onRetry: () => void
  /** La carte du feed, avec ses gestionnaires : le mois n'en possède aucun. */
  renderCard: (article: FeedArticle, index: number) => ReactNode
  /** Classes de la grille de cartes, les mêmes que la liste. */
  listClassName: string
}

/** La classe `text-…` du badge de catégorie : un point `bg-current` en prend la couleur. */
function categoryTextClass(slug: string | undefined) {
  const classes = CATEGORY_COLORS[slug ?? ''] ?? 'bg-gray-100 text-gray-800'
  return classes.split(' ').find((c) => c.startsWith('text-')) ?? 'text-gray-500'
}

function weekdayLetter(dayKey: string) {
  // Midi UTC tombe toujours le même jour civil à Paris.
  return WEEKDAY_LETTERS[new Date(`${dayKey}T12:00:00Z`).getUTCDay()]
}

function countLabel(n: number) {
  return n === 0 ? 'aucun événement' : n === 1 ? '1 événement' : `${n} événements`
}

export function MonthView({
  month,
  todayKey,
  grid,
  sections,
  loading,
  error,
  onRetry,
  renderCard,
  listClassName,
}: MonthViewProps) {
  const label = formatMonthLabel(month)
  const days = useMemo(() => grid?.cells.filter((c) => c.inMonth) ?? [], [grid])

  // ─── Jour « visible » : la première section sous le bandeau ─────────────────────
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const sectionRefs = useRef(new Map<string, HTMLElement>())
  const visibleRef = useRef(new Set<string>())
  const stripRef = useRef<HTMLDivElement>(null)
  const dayButtonRefs = useRef(new Map<string, HTMLButtonElement>())

  const registerSection = useCallback((key: string) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(key, el)
    else sectionRefs.current.delete(key)
  }, [])

  const registerDayButton = useCallback((key: string) => (el: HTMLButtonElement | null) => {
    if (el) dayButtonRefs.current.set(key, el)
    else dayButtonRefs.current.delete(key)
  }, [])

  const sectionKeys = useMemo(() => sections?.sections.map((s) => s.key) ?? [], [sections])

  useEffect(() => {
    visibleRef.current.clear()
    setActiveKey(null)
    if (sectionKeys.length === 0 || typeof IntersectionObserver === 'undefined') return

    // La bande utile va du bas du bandeau à un peu moins de la moitié de l'écran : le
    // jour surligné est celui dont les cartes sont sous le doigt, pas celui qui
    // s'apprête à sortir par le haut.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.day
          if (!key) continue
          if (entry.isIntersecting) visibleRef.current.add(key)
          else visibleRef.current.delete(key)
        }
        const first = [...visibleRef.current].sort()[0] ?? null
        setActiveKey(first)
      },
      { rootMargin: `-${OBSERVER_TOP_PX}px 0px -55% 0px`, threshold: 0 }
    )
    for (const key of sectionKeys) {
      const el = sectionRefs.current.get(key)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sectionKeys])

  // Le bandeau suit le défilement : le jour actif reste visible dans la rangée.
  useEffect(() => {
    if (!activeKey) return
    const strip = stripRef.current
    const button = dayButtonRefs.current.get(activeKey)
    if (!strip || !button) return
    const target = button.offsetLeft - strip.clientWidth / 2 + button.clientWidth / 2
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [activeKey])

  function scrollToDay(dayKey: string) {
    if (!sections) return
    const target = sectionKeyForDay(sections.sections, dayKey)
    const el = target ? sectionRefs.current.get(target) : null
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Compteur de cartes pour `priority` : une seule carte au-dessus de la ligne de
  // flottaison sur mobile, la première du mois.
  let cardIndex = 0
  const nextIndex = () => cardIndex++

  return (
    <div>
      {error && !grid ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
          <TriangleAlert className="mx-auto mb-3 size-8 text-red-500" />
          <p className="font-medium text-red-800">Impossible de charger l&apos;agenda</p>
          <p className="mt-1 text-sm text-red-600">Vérifiez votre connexion, puis réessayez.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-red-300 bg-white px-5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-ring"
          >
            Réessayer
          </button>
        </div>
      ) : !grid || !sections ? (
        <MonthViewSkeleton listClassName={listClassName} />
      ) : (
        <div className={cn('transition-opacity', loading && 'opacity-60 pointer-events-none')}>
          {error && (
            <div role="alert" className="mb-3 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1">Le chargement a échoué. Le mois affiché peut être périmé.</p>
              <button type="button" onClick={onRetry} className="font-medium underline focus-ring">Réessayer</button>
            </div>
          )}

          {/*
            Bandeau des jours, collé sous la barre de navigation. Une rangée qui défile
            horizontalement : 31 pastilles de 44 px ne tiennent pas sur un téléphone, et
            sur ordinateur elles tiennent presque — le défilement ne sert alors qu'à la
            marge. `-mx-4 px-4` : le bandeau prend toute la largeur sur mobile, pour que
            la première et la dernière pastille s'alignent sur les cartes.
          */}
          <nav
            aria-label={`Jours du mois, ${label}`}
            className="sticky top-[var(--header-h)] z-10 -mx-4 mb-4 border-b border-gray-100 bg-white px-4 py-2 sm:mx-0 sm:px-0"
          >
            <div ref={stripRef} className="scrollbar-hide flex gap-1 overflow-x-auto">
              {days.map((cell) => (
                <DayPill
                  key={cell.key}
                  ref={registerDayButton(cell.key)}
                  cell={cell}
                  isToday={cell.key === todayKey}
                  isActive={cell.key === activeKey}
                  onClick={() => scrollToDay(cell.key)}
                />
              ))}
            </div>
          </nav>

          {/*
            Événements longs d'abord : une exposition sur quatre mois est « en cours »
            tout le mois, la ranger sous un jour précis serait un contresens — même
            raisonnement que « Aujourd'hui » dans la liste.
          */}
          {sections.longRunning.length > 0 && (
            <section id={LONG_RUNNING_ID} className={cn('mb-8', SECTION_SCROLL_MARGIN)} aria-label="En cours ce mois">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">En cours ce mois</h2>
              <div className={listClassName}>
                {sections.longRunning.map((article) => renderCard(article, nextIndex()))}
              </div>
            </section>
          )}

          {sections.sections.map((section) => (
            <section
              key={section.key}
              ref={registerSection(section.key)}
              data-day={section.key}
              className={cn('mb-8', SECTION_SCROLL_MARGIN)}
              aria-label={formatDayHeader(section.key)}
            >
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {formatDayHeader(section.key)}
              </h2>
              <div className={listClassName}>
                {section.articles.map((article) => renderCard(article, nextIndex()))}
              </div>
            </section>
          ))}

          {grid.total === 0 && (
            <p className="mt-6 text-center text-sm text-gray-500">Aucun événement en {label}.</p>
          )}
        </div>
      )}
    </div>
  )
}

interface DayPillProps {
  cell: MonthCell
  isToday: boolean
  isActive: boolean
  onClick: () => void
  ref: (el: HTMLButtonElement | null) => void
}

/** Une pastille du bandeau : lettre du jour, numéro, points de catégorie. */
function DayPill({ cell, isToday, isActive, onClick, ref }: DayPillProps) {
  const count = cell.events.length
  const slugs = [...new Set(cell.events.map((e) => e.category?.slug))].slice(0, DOTS_PER_DAY)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={count === 0}
      aria-current={isActive ? 'date' : undefined}
      aria-label={`${formatDayHeader(cell.key)}, ${countLabel(count)}`}
      className={cn(
        'flex min-w-11 shrink-0 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors focus-ring',
        count > 0 ? 'hover:bg-gray-100' : 'cursor-default'
      )}
    >
      <span className={cn('text-[10px] font-medium uppercase leading-none', count > 0 ? 'text-gray-500' : 'text-gray-300')}>
        {weekdayLetter(cell.key)}
      </span>
      <span
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-full text-sm font-medium',
          isToday
            ? 'bg-brand-600 text-white'
            : isActive
              ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300'
              : count > 0
                ? 'text-gray-900'
                : 'text-gray-300'
        )}
      >
        {cell.day}
      </span>
      <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
        {slugs.map((slug, i) => (
          <span key={i} className={cn('size-1.5 rounded-full bg-current', categoryTextClass(slug))} />
        ))}
      </span>
    </button>
  )
}

/** Même géométrie que la vraie vue : bandeau de jours, en-tête de jour, six cartes fantômes. */
export function MonthViewSkeleton({
  listClassName = 'flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4',
}: {
  listClassName?: string
}) {
  return (
    <div aria-hidden="true">
      <div className="mb-4 flex gap-1 overflow-hidden py-2">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-14 min-w-11 shrink-0 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
      <div className="mb-3 h-4 w-48 rounded bg-gray-100 animate-pulse" />
      <div className={listClassName}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
