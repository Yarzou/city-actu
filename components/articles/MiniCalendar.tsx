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

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

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

  return (
    <div className="hidden sm:block bg-white border border-gray-200 rounded-2xl p-4 w-64 shrink-0">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => changeMonth(m => subMonths(m, 1))}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800 capitalize">
          {format(viewMonth, 'MMMM yyyy', { locale: fr })}
        </span>
        <button
          onClick={() => changeMonth(m => addMonths(m, 1))}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Mois suivant"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-xs font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const key      = format(day, 'yyyy-MM-dd')
          const inMonth  = isSameMonth(day, viewMonth)
          const isActive = activeSet.has(key)
          const isSel    = selected ? isSameDay(day, selected) : false
          const isTod    = isToday(day)

          return (
            <div key={key} className="flex items-center justify-center py-0.5">
              <button
                onClick={() => onChange(day)}
                disabled={!inMonth}
                className={cn(
                  'relative flex flex-col items-center justify-center w-6 h-6 rounded-full text-xs transition-colors',
                  !inMonth && 'text-gray-200 cursor-default',
                  inMonth && !isSel && !isTod && 'text-gray-700 hover:bg-brand-50',
                  isTod && !isSel && 'border border-brand-400 text-brand-600 font-semibold',
                  isSel && 'bg-brand-600 text-white font-semibold',
                )}
              >
                {format(day, 'd')}
                {isActive && inMonth && (
                  <span className={cn(
                    'absolute -bottom-0.5 size-1 rounded-full',
                    isSel ? 'bg-white/70' : 'bg-brand-400'
                  )} />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
