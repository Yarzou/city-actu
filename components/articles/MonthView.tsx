'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, formatDayHeader } from '@/lib/utils'
import { categoryStyle } from '@/lib/category-style'
import type { FeedArticle } from '@/lib/types'
import { addMonths, formatMonthLabel, formatMonthLabelShort, isSameMonth, type CivilMonth } from '@/lib/feed/view-params'
import { sectionKeyForDay, type MonthCell, type MonthGrid, type MonthSections } from '@/lib/feed/month-grid'
import { Notice } from '@/components/ui/Notice'
import { SkeletonCard } from './SkeletonCard'
import { DayHeader, SectionTitle } from './DayHeader'

/**
 * Le mois comme cadre, les cartes comme contenu.
 *
 * Un bandeau de jours en verre en tête, collé sous la barre d'état, puis les cartes du
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
 * Hauteur du bandeau collant (et de la barre d'état au-dessus) : ce qu'une section doit
 * laisser au-dessus d'elle quand on y défile, et la marge haute de l'observateur qui
 * décide quel jour est « visible ».
 */
const SECTION_SCROLL_MARGIN = 'scroll-mt-[calc(var(--header-h)+6.5rem)]'
const OBSERVER_TOP_PX = 130

const NAV_BUTTON =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-fill text-ink transition-opacity active:opacity-70 focus-ring'

interface MonthNavProps {
  month: CivilMonth
  currentMonth: CivilMonth
  onMonthChange: (month: CivilMonth) => void
}

/**
 * Navigation de mois : flèches rondes, nom du mois, retour au mois en cours. Rendue par
 * `ArticleFeed` **à la place du menu « Quand »**, sur la rangée du sélecteur
 * « Liste | Mois » : une plage de dates n'a pas de sens sur un mois qui en est déjà une.
 * Libellé court sous 640 px (« oct. 2026 ») pour que la rangée tienne sur une ligne.
 */
export function MonthNav({ month, currentMonth, onMonthChange }: MonthNavProps) {
  const label = formatMonthLabel(month)
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button type="button" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="Mois précédent" className={NAV_BUTTON}>
        <ChevronLeft className="size-5" strokeWidth={2.4} />
      </button>
      <h2 className="min-w-0 truncate px-0.5 text-headline capitalize text-ink" aria-live="polite">
        <span className="sm:hidden">{formatMonthLabelShort(month)}</span>
        <span className="hidden sm:inline">{label}</span>
      </h2>
      <button type="button" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Mois suivant" className={NAV_BUTTON}>
        <ChevronRight className="size-5" strokeWidth={2.4} />
      </button>
      {!isSameMonth(month, currentMonth) && (
        <button
          type="button"
          onClick={() => onMonthChange(currentMonth)}
          aria-label="Revenir au mois en cours"
          className="inline-flex h-9 shrink-0 items-center rounded-full px-2 text-subhead font-semibold text-accent focus-ring"
        >
          Ce mois-ci
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

  // Jour surligné, ramené à null quand il n'appartient plus au mois affiché : dérivé au
  // rendu plutôt que remis à zéro dans l'effet (un setState synchrone en début d'effet
  // rend en cascade).
  const shownKey = activeKey && sectionKeys.includes(activeKey) ? activeKey : null

  useEffect(() => {
    visibleRef.current.clear()
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
    if (!shownKey) return
    const strip = stripRef.current
    const button = dayButtonRefs.current.get(shownKey)
    if (!strip || !button) return
    const target = button.offsetLeft - strip.clientWidth / 2 + button.clientWidth / 2
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [shownKey])

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
        <Notice
          tone="danger"
          action={
            <button type="button" onClick={onRetry} className="font-semibold underline focus-ring">
              Réessayer
            </button>
          }
        >
          Impossible de charger l&apos;agenda. Vérifiez votre connexion, puis réessayez.
        </Notice>
      ) : !grid || !sections ? (
        <MonthViewSkeleton listClassName={listClassName} />
      ) : (
        <div className={cn('transition-opacity', loading && 'opacity-60 pointer-events-none')}>
          {error && (
            <Notice
              tone="danger"
              className="mb-3"
              action={
                <button type="button" onClick={onRetry} className="font-semibold underline focus-ring">
                  Réessayer
                </button>
              }
            >
              Le chargement a échoué. Le mois affiché peut être périmé.
            </Notice>
          )}

          {/*
            Bandeau des jours, en verre, collé sous la barre d'état : les cartes passent
            dessous en transparence. Une rangée qui défile horizontalement : 31 pastilles
            ne tiennent pas sur un téléphone.
          */}
          <nav
            aria-label={`Jours du mois, ${label}`}
            className="glass sticky top-[calc(var(--header-h)+0.5rem)] z-10 mb-5 rounded-[22px] px-1.5 py-1.5"
          >
            <div ref={stripRef} className="scrollbar-hide flex gap-0.5 overflow-x-auto">
              {days.map((cell) => (
                <DayPill
                  key={cell.key}
                  ref={registerDayButton(cell.key)}
                  cell={cell}
                  isToday={cell.key === todayKey}
                  isActive={cell.key === shownKey}
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
            <section id={LONG_RUNNING_ID} className={cn('mb-7', SECTION_SCROLL_MARGIN)} aria-label="En cours ce mois">
              <SectionTitle>En cours ce mois</SectionTitle>
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
              className={cn('mb-7', SECTION_SCROLL_MARGIN)}
              aria-label={formatDayHeader(section.key)}
            >
              <DayHeader dayKey={section.key} />
              <div className={listClassName}>
                {section.articles.map((article) => renderCard(article, nextIndex()))}
              </div>
            </section>
          ))}

          {grid.total === 0 && (
            <p className="mt-6 text-center text-subhead text-ink-muted">Aucun événement en {label}.</p>
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

/**
 * Une pastille du bandeau : lettre du jour, numéro, points de catégorie. Le jour même
 * est plein, dans le corail de la palette (comme le rouge de Calendrier) ; le jour
 * dont les cartes sont sous le doigt est cerclé d'accent.
 */
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
        'flex min-w-11 shrink-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-1 transition-colors focus-ring',
        count === 0 && 'cursor-default'
      )}
    >
      <span className={cn('text-caption font-semibold', count > 0 ? 'text-ink-muted' : 'text-ink-faint opacity-60')}>
        {weekdayLetter(cell.key)}
      </span>
      <span
        className={cn(
          'inline-flex size-[34px] items-center justify-center rounded-full text-body',
          isToday
            ? 'bg-hl-ink font-bold text-white'
            : isActive
              ? 'font-semibold text-accent ring-2 ring-accent'
              : count > 0
                ? 'font-medium text-ink'
                : 'text-ink-faint opacity-60'
        )}
      >
        {cell.day}
      </span>
      <span className="flex h-1.5 items-center gap-[3px]" aria-hidden="true">
        {slugs.map((slug, i) => (
          <span key={i} className="size-[5px] rounded-full" style={{ backgroundColor: categoryStyle(slug).color }} />
        ))}
      </span>
    </button>
  )
}

/** Même géométrie que la vraie vue : bandeau de jours, en-tête de jour, cartes fantômes. */
export function MonthViewSkeleton({
  listClassName = 'flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4',
}: {
  listClassName?: string
}) {
  return (
    <div aria-hidden="true">
      <div className="mb-5 flex gap-0.5 overflow-hidden rounded-[22px] bg-card px-1.5 py-1.5">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-[62px] min-w-11 shrink-0 animate-pulse rounded-2xl bg-fill-soft" />
        ))}
      </div>
      <div className="mb-2.5 h-6 w-48 animate-pulse rounded-lg bg-fill" />
      <div className={listClassName}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
