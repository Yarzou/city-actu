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
      {/*
        Plus de pastille « × Ce weekend » : elle ne servait à rien, les préréglages se
        désélectionnant déjà d'un second appui.
      */}
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

        Pastille bistable, et c'est ce qui remplace la pastille × supprimée plus haut :
        une date précise n'était annulable que par elle. Au repos, un `<input type="date">`
        transparent est superposé au libellé — et non caché en `sr-only` puis ouvert par
        `showPicker()`, méthode absente de plusieurs navigateurs mobiles, où le bouton
        ne faisait alors strictement rien. Active, la pastille affiche la date et
        redevient un simple bouton d'effacement : sans input par-dessus, l'appui ne
        rouvre pas le sélecteur.
      */}
      {isCustomDay ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed
          aria-label={`Retirer le filtre du ${value?.label}`}
          className={cn(PILL_BASE, 'shrink-0 snap-start sm:hidden', PILL_ACTIVE)}
        >
          <CalendarDays className="size-4" />
          {value?.label}
        </button>
      ) : (
        <div className="relative shrink-0 snap-start sm:hidden">
          <span aria-hidden="true" className={cn(PILL_BASE, PILL_IDLE)}>
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
      )}
    </div>
  )
}
