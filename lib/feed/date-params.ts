/**
 * Plages de dates du feed : définition unique, partagée par le serveur (qui rend le
 * premier lot) et le client (qui pagine et refiltre).
 *
 * Avant, `buildRange` et `PILLS` vivaient dans `DateFilter.tsx`, donc dans un
 * composant `'use client'` : le serveur n'avait aucun moyen d'honorer un filtre
 * présent dans l'URL. Le déplacement ici est ce qui rend les liens filtrés
 * partageables.
 *
 * Toutes les bornes passent par `paris-time` : voir l'en-tête de ce module pour la
 * raison (le serveur tourne en UTC, le téléphone en Europe/Paris).
 */

import {
  addCivilDays,
  civilDateToISO,
  civilDayOfWeek,
  parisCivilDate,
  parisEndOfDay,
  parisStartOfDay,
  parseCivilDate,
  type CivilDate,
} from './paris-time'

export interface DateRange {
  from: Date
  to: Date
  label?: string
}

/** Forme sérialisable : ce qui traverse la frontière serveur → client. */
export interface SerializedDateRange {
  from: string
  to: string
  label?: string
}

/** Les trois raccourcis affichés en pastilles, dans l'ordre. */
export const DATE_PRESETS = ['today', 'weekend', '7d'] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Aujourd'hui",
  weekend: 'Ce weekend',
  '7d': '7 prochains jours',
}

function rangeFromCivil(from: CivilDate, to: CivilDate, label: string): DateRange {
  return { from: parisStartOfDay(from), to: parisEndOfDay(to), label }
}

/**
 * Le weekend « courant ou à venir ».
 *
 * L'ancienne implémentation faisait `sat = isSaturday(now) ? now : nextSaturday(now)`
 * et `sun = isSunday(now) ? now : nextSunday(sat)`. Un dimanche, elle produisait
 * `from` = samedi **prochain** et `to` = aujourd'hui, soit une plage inversée qui ne
 * remontait jamais rien : le filtre « Ce weekend » était cassé un jour sur sept.
 */
function weekendRange(today: CivilDate): DateRange {
  const dow = civilDayOfWeek(today)
  const label = DATE_PRESET_LABELS.weekend

  if (dow === 6) {
    // Samedi : le weekend court d'aujourd'hui à demain.
    return rangeFromCivil(today, addCivilDays(today, 1), label)
  }
  if (dow === 0) {
    // Dimanche : il ne reste que la journée en cours — proposer le samedi passé
    // ferait remonter des événements terminés.
    return rangeFromCivil(today, today, label)
  }
  // En semaine : le prochain samedi et le dimanche qui le suit.
  const saturday = addCivilDays(today, 6 - dow)
  return rangeFromCivil(saturday, addCivilDays(saturday, 1), label)
}

export function buildPresetRange(preset: DatePreset, now: Date = new Date()): DateRange {
  const today = parisCivilDate(now)

  switch (preset) {
    case 'today':
      return rangeFromCivil(today, today, DATE_PRESET_LABELS.today)
    case 'weekend':
      return weekendRange(today)
    case '7d':
      return rangeFromCivil(today, addCivilDays(today, 6), DATE_PRESET_LABELS['7d'])
  }
}

/** Une journée précise, choisie au calendrier ou passée dans l'URL. */
export function buildSingleDayRange(civil: CivilDate): DateRange {
  return {
    from: parisStartOfDay(civil),
    to: parisEndOfDay(civil),
    label: `${String(civil.d).padStart(2, '0')}/${String(civil.m).padStart(2, '0')}/${civil.y}`,
  }
}

function isPreset(value: string): value is DatePreset {
  return (DATE_PRESETS as readonly string[]).includes(value)
}

/**
 * Lit le paramètre `d` de l'URL. Accepte un raccourci (`today` | `weekend` | `7d`)
 * ou une date `YYYY-MM-DD`. Toute autre valeur est ignorée plutôt que rejetée :
 * une URL bricolée doit dégrader vers le feed par défaut, pas casser la page.
 */
export function parseDateParam(value: string | string[] | undefined, now: Date = new Date()): DateRange | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null

  if (isPreset(raw)) return buildPresetRange(raw, now)

  const civil = parseCivilDate(raw)
  return civil ? buildSingleDayRange(civil) : null
}

/** L'inverse : la valeur à écrire dans `?d=`. Null quand aucun filtre n'est actif. */
export function serializeDateRange(range: DateRange | null): string | null {
  if (!range) return null

  for (const preset of DATE_PRESETS) {
    if (range.label === DATE_PRESET_LABELS[preset]) return preset
  }

  // Journée précise : on repart de `from`, seule source fiable (le label est en
  // format français d'affichage).
  return civilDateToISO(parisCivilDate(range.from))
}

/** Pour le passage serveur → client, où seules les chaînes survivent. */
export function serializeRangeBounds(range: DateRange | null): SerializedDateRange | null {
  if (!range) return null
  return { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label }
}

export function deserializeRangeBounds(range: SerializedDateRange | null | undefined): DateRange | null {
  if (!range) return null
  return { from: new Date(range.from), to: new Date(range.to), label: range.label }
}
