'use client'

import { useRef } from 'react'
import {
  startOfDay, endOfDay, addDays,
  nextSaturday, nextSunday,
  isSaturday, isSunday,
  format,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'

export interface DateRange {
  from: Date
  to: Date
  label?: string
}

interface DateFilterProps {
  value: DateRange | null
  onChange: (range: DateRange | null) => void
}

function buildRange(label: string): DateRange {
  const now = new Date()
  if (label === "Aujourd'hui") {
    return { from: startOfDay(now), to: endOfDay(now), label }
  }
  if (label === 'Ce weekend') {
    const sat = isSaturday(now) ? now : nextSaturday(now)
    const sun = isSunday(now) ? now : nextSunday(sat)
    return { from: startOfDay(sat), to: endOfDay(sun), label }
  }
  if (label === '7 prochains jours') {
    return { from: startOfDay(now), to: endOfDay(addDays(now, 6)), label }
  }
  return { from: startOfDay(now), to: endOfDay(now), label }
}

const PILLS = ["Aujourd'hui", 'Ce weekend', '7 prochains jours'] as const

export function DateFilter({ value, onChange }: DateFilterProps) {
  const dateInputRef = useRef<HTMLInputElement>(null)

  function handlePill(label: string) {
    if (value?.label === label) {
      onChange(null)
    } else {
      onChange(buildRange(label))
    }
  }

  function handleDateInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) {
      onChange(null)
      return
    }
    const date = new Date(e.target.value + 'T12:00:00')
    onChange({
      from: startOfDay(date),
      to: endOfDay(date),
      label: format(date, 'dd/MM/yyyy'),
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* × clear button — only when a filter is active */}
      {value && (
        <button
          onClick={() => onChange(null)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border border-brand-600 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
        >
          <span>×</span>
          {value.label}
        </button>
      )}

      {PILLS.map((label) => (
        <button
          key={label}
          onClick={() => handlePill(label)}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm border transition-colors',
            value?.label === label
              ? 'bg-brand-600 text-white border-brand-600'
              : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50'
          )}
        >
          {label}
        </button>
      ))}

      {/* Custom date button — mobile only (calendar handles this on desktop) */}
      <button
        onClick={() => dateInputRef.current?.showPicker?.()}
        className={cn(
          'sm:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors',
          value && !PILLS.includes(value.label as typeof PILLS[number])
            ? 'bg-brand-600 text-white border-brand-600'
            : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50'
        )}
      >
        <CalendarDays className="size-3.5" />
        Date…
      </button>
      <input
        ref={dateInputRef}
        type="date"
        className="sr-only"
        onChange={handleDateInput}
      />
    </div>
  )
}
