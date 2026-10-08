'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { chipClass } from '@/components/ui/Chip'
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  buildPresetRange,
  buildSingleDayRange,
  type DateRange,
} from '@/lib/feed/date-params'
import { parseCivilDate } from '@/lib/feed/paris-time'

// Réexport : le type était historiquement défini ici et reste importé sous ce nom
// par plusieurs composants. Sa définition, elle, a rejoint lib/feed/date-params
// pour que le rendu serveur puisse l'utiliser (un composant 'use client' ne peut
// pas servir de source de vérité partagée).
export type { DateRange }

interface DateFilterProps {
  value: DateRange | null
  onChange: (range: DateRange | null) => void
}

/**
 * Filtre de date : une seule pastille « Quand » qui ouvre un menu en verre, au lieu
 * de la rangée de quatre pastilles d'avant (Aujourd'hui, Ce weekend, 7 jours, Date…).
 * Elle libère une ligne d'en-tête, et la pastille dit en permanence ce qui est
 * filtré (« Ce weekend », « 12/10/2026 ») — la rangée, elle, demandait de repérer
 * laquelle était allumée.
 *
 * Même contrat qu'avant (`value` / `onChange`), donc rien ne change pour le feed ni
 * pour l'URL (`?d=`).
 */
export function DateFilter({ value, onChange }: DateFilterProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const activePreset = DATE_PRESETS.find((p) => value?.label === DATE_PRESET_LABELS[p]) ?? null
  const isCustomDay = Boolean(value) && activePreset === null

  // Fermeture au toucher hors du menu et à Échap, comme un menu iOS.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function choose(range: DateRange | null) {
    setOpen(false)
    onChange(range)
  }

  function handleDateInput(event: React.ChangeEvent<HTMLInputElement>) {
    const civil = parseCivilDate(event.target.value)
    choose(civil ? buildSingleDayRange(civil) : null)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={chipClass(Boolean(value), 'pl-3')}
      >
        <CalendarDays className={cn('size-[17px]', !value && 'text-accent')} aria-hidden="true" />
        {value?.label ?? 'Toutes les dates'}
        <ChevronDown className={cn('size-4', value ? 'opacity-80' : 'text-ink-muted')} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Quand"
          className="glass glass-strong absolute left-0 top-full z-30 mt-2 w-64 rounded-3xl py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.22)]"
        >
          <MenuItem checked={!value} onSelect={() => choose(null)}>Toutes les dates</MenuItem>
          {DATE_PRESETS.map((preset) => (
            <MenuItem key={preset} checked={activePreset === preset} onSelect={() => choose(buildPresetRange(preset))}>
              {DATE_PRESET_LABELS[preset]}
            </MenuItem>
          ))}
          <div role="separator" className="my-1 h-2 bg-fill-soft/70" />
          {/*
            Date précise. Un `<input type="date">` transparent est superposé à la ligne —
            et non caché puis ouvert par `showPicker()`, méthode absente de plusieurs
            navigateurs mobiles, où l'appui ne faisait alors strictement rien.
          */}
          <label className="relative flex min-h-11 cursor-pointer items-center gap-2.5 px-4 text-body text-ink">
            <span className="flex size-[18px] shrink-0 items-center justify-center text-accent">
              {isCustomDay && <Check className="size-[18px]" strokeWidth={2.6} aria-hidden="true" />}
            </span>
            <span className={cn('flex-1', isCustomDay && 'font-semibold')}>
              {isCustomDay ? value?.label : 'Choisir une date…'}
            </span>
            <CalendarDays className="size-5 text-ink-muted" aria-hidden="true" />
            <input
              type="date"
              aria-label="Choisir une date précise"
              onChange={handleDateInput}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      )}
    </div>
  )
}

function MenuItem({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-body text-ink active:bg-fill-soft focus-ring"
    >
      <span className="flex size-[18px] shrink-0 items-center justify-center text-accent">
        {checked && <Check className="size-[18px]" strokeWidth={2.6} aria-hidden="true" />}
      </span>
      <span className={cn(checked && 'font-semibold')}>{children}</span>
    </button>
  )
}
