import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NoticeTone = 'danger' | 'warn' | 'success' | 'info' | 'neutral'

const TONES: Record<NoticeTone, string> = {
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  success: 'bg-accent-soft text-accent',
  info: 'bg-accent-soft text-accent',
  neutral: 'bg-fill-soft text-ink-muted',
}

/**
 * Message dans un encart teinté, repris de Fridge. Toujours une icône en plus de la
 * couleur : un état ne repose jamais sur la seule teinte.
 */
export function Notice({
  tone = 'info',
  children,
  className,
  action,
}: {
  tone?: NoticeTone
  children: ReactNode
  className?: string
  /** Bouton d'action aligné à droite (« Réessayer »). */
  action?: ReactNode
}) {
  const Icon = tone === 'success' ? CircleCheck : tone === 'info' || tone === 'neutral' ? Info : CircleAlert
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-xl px-3.5 py-3 text-subhead', TONES[tone], className)}
    >
      <Icon size={18} className="mt-px shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}
