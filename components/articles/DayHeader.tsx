import type { ReactNode } from 'react'
import { cn, dayHeaderParts } from '@/lib/utils'

/**
 * En-tête de journée du fil, partagé par la liste et la vue mois : le libellé fort en
 * gras (« Aujourd'hui », « Samedi »), la date en gris à côté. « Aujourd'hui » prend le
 * corail de la palette — c'est le repère qu'on cherche en ouvrant l'appli.
 */
export function DayHeader({ dayKey, className }: { dayKey: string; className?: string }) {
  const { relative, long, isToday } = dayHeaderParts(dayKey)
  return (
    <SectionTitle className={className}>
      <span className={cn(isToday && 'text-hl-ink')}>{relative}</span>
      {long && <span className="text-subhead font-normal text-ink-muted">{long}</span>}
    </SectionTitle>
  )
}

/** Titre de section du fil (20 px, gras) : « En cours ce mois », ou un jour. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('mb-2.5 flex flex-wrap items-baseline gap-x-2 text-title text-ink', className)}>{children}</h2>
}
