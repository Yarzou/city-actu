'use client'

import { useState } from 'react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek,
  isSameDay, isSameMonth, isToday,
  addMonths, subMonths,
  format,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MiniCalendarProps {
  selected: Date | null
  onChange: (date: Date) => void
  activeDates?: string[]
  onMonthChange?: (month: Date) => void
}

/**
 * Deux « M » consécutifs (mardi, mercredi) sont indiscernables à la lecture d'écran :
 * l'abréviation visible reste courte, le nom complet part dans `aria-label`.
 */
const WEEKDAYS = [
  { short: 'L', full: 'lundi' },
  { short: 'M', full: 'mardi' },
  { short: 'M', full: 'mercredi' },
  { short: 'J', full: 'jeudi' },
  { short: 'V', full: 'vendredi' },
  { short: 'S', full: 'samedi' },
  { short: 'D', full: 'dimanche' },
]

export function MiniCalendar({ selected, onChange, activeDates = [], onMonthChange }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(selected ?? new Date())

  function changeMonth(delta: (m: Date) => Date) {
    const next = delta(viewMonth)
    setViewMonth(next)
    onMonthChange?.(next)
  }

  const monthStart = startOfMonth(viewMonth)
  const monthEnd   = endOfMonth(viewMonth)
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd     = endOfWeek(monthEnd,    { weekStartsOn: 1 })
  const days       = eachDayOfInterval({ start: calStart, end: calEnd })

  const activeSet = new Set(activeDates)

  // Plus de `hidden sm:block` : le composant n'est plus monté du tout sur mobile
  // (chargé dynamiquement derrière une media query dans ArticleFeed), au lieu
  // d'être calculé puis masqué en CSS sur chaque téléphone.
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 w-64 shrink-0">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => changeMonth(m => subMonths(m, 1))}
          className="inline-flex items-center justify-center size-9 rounded-lg hover:bg-gray-100 text-gray-500 focus-ring"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800 capitalize" aria-live="polite">
          {format(viewMonth, 'MMMM yyyy', { locale: fr })}
        </span>
        <button
          onClick={() => changeMonth(m => addMonths(m, 1))}
          className="inline-flex items-center justify-center size-9 rounded-lg hover:bg-gray-100 text-gray-500 focus-ring"
          aria-label="Mois suivant"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div role="grid" aria-label="Calendrier">
        {/* Weekday headers */}
        <div role="row" className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(({ short, full }, i) => (
            <div
              key={i}
              role="columnheader"
              aria-label={full}
              className="text-center text-xs font-medium text-gray-500 py-1"
            >
              <span aria-hidden="true">{short}</span>
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div role="row" className="grid grid-cols-7 gap-y-0.5">
          {days.map((day) => {
            const key      = format(day, 'yyyy-MM-dd')
            const inMonth  = isSameMonth(day, viewMonth)
            const isActive = activeSet.has(key)
            const isSel    = selected ? isSameDay(day, selected) : false
            const isTod    = isToday(day)

            // Le point « a des actus » était purement visuel : son équivalent
            // textuel passe par le nom accessible du bouton.
            const label = [
              format(day, 'EEEE d MMMM yyyy', { locale: fr }),
              isActive ? '— des actus ce jour-là' : null,
            ].filter(Boolean).join(' ')

            return (
              <div key={key} role="gridcell" className="flex items-center justify-center py-0.5">
                <button
                  onClick={() => onChange(day)}
                  disabled={!inMonth}
                  aria-label={label}
                  aria-current={isTod ? 'date' : undefined}
                  aria-pressed={isSel}
                  className={cn(
                    // 36px : les cellules faisaient 24px (`w-6 h-6`) et la règle CSS
                    // globale `min-width: 44px` les forçait à 44, soit 7 × 44 = 308px
                    // dans un conteneur de 256px — la grille débordait.
                    'relative flex flex-col items-center justify-center size-9 rounded-full text-xs transition-colors focus-ring',
                    !inMonth && 'text-gray-300 cursor-default',
                    inMonth && !isSel && !isTod && 'text-gray-700 hover:bg-brand-50',
                    isTod && !isSel && 'border border-brand-400 text-brand-600 font-semibold',
                    isSel && 'bg-brand-600 text-white font-semibold',
                  )}
                >
                  <span aria-hidden="true">{format(day, 'd')}</span>
                  {isActive && inMonth && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute bottom-1 size-1 rounded-full',
                        isSel ? 'bg-white/70' : 'bg-brand-400'
                      )}
                    />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
