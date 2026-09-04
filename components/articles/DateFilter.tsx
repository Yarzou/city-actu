'use client'

import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  buildPresetRange,
  buildSingleDayRange,
  type DatePreset,
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

/** Pastille : 44px de haut par vrai padding, plus par une règle CSS globale. */
const PILL_BASE =
  'shrink-0 snap-start min-h-11 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm border transition-colors focus-ring'
const PILL_IDLE =
  'border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50'
const PILL_ACTIVE = 'bg-brand-600 text-white border-brand-600'

export function DateFilter({ value, onChange }: DateFilterProps) {
  const activePreset = DATE_PRESETS.find((p) => value?.label === DATE_PRESET_LABELS[p]) ?? null
  const isCustomDay = Boolean(value) && activePreset === null

  function handlePreset(preset: DatePreset) {
    if (activePreset === preset) {
      onChange(null)
    } else {
      onChange(buildPresetRange(preset))
    }
  }

  function handleDateInput(event: React.ChangeEvent<HTMLInputElement>) {
    const civil = parseCivilDate(event.target.value)
    onChange(civil ? buildSingleDayRange(civil) : null)
  }

  return (
    <div
      className="edge-fade flex flex-nowrap snap-x snap-mandatory overflow-x-auto scrollbar-hide items-center gap-2 sm:flex-wrap sm:snap-none"
      role="group"
      aria-label="Filtrer par date"
    >
      {/* Filtre actif : bouton d'annulation, affiché seulement quand il y a de quoi annuler */}
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Retirer le filtre ${value.label}`}
          className={cn(PILL_BASE, 'border-brand-600 bg-brand-50 text-brand-700 hover:bg-brand-100')}
        >
          <span aria-hidden="true">×</span>
          {value.label}
        </button>
      )}

      {DATE_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => handlePreset(preset)}
          aria-pressed={activePreset === preset}
          className={cn(PILL_BASE, activePreset === preset ? PILL_ACTIVE : PILL_IDLE)}
        >
          {DATE_PRESET_LABELS[preset]}
        </button>
      ))}

      {/*
        Choix d'une date précise — mobile seulement (le mini-calendrier s'en charge
        sur desktop).

        L'input est superposé au bouton en opacité nulle plutôt que caché en `sr-only`
        et ouvert par `showPicker()` : cette méthode n'existe pas sur tous les
        navigateurs mobiles, et le bouton « Date… » ne faisait alors strictement rien.
        Ici c'est l'input lui-même qui reçoit le tap, donc le sélecteur natif s'ouvre
        partout. Le libellé reste visible dessous, et `aria-label` nomme le champ —
        il était jusqu'ici focusable et sans nom.
      */}
      <div className="relative shrink-0 snap-start sm:hidden">
        <span
          aria-hidden="true"
          className={cn(PILL_BASE, isCustomDay ? PILL_ACTIVE : PILL_IDLE)}
        >
          <CalendarDays className="size-4" />
          Date…
        </span>
        <input
          type="date"
          aria-label="Choisir une date précise"
          onChange={handleDateInput}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  )
}
