import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * État vide ou d'erreur d'une liste, centré, à la manière d'iOS : une icône dans un
 * rond, un titre, une phrase, une action. Pour une erreur, `tone="danger"` colore
 * l'icône — le titre dit toujours ce qui se passe, la couleur n'est qu'un renfort.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  tone = 'neutral',
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  tone?: 'neutral' | 'danger'
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-16 text-center', className)}>
      <span
        className={cn(
          'mb-4 flex size-14 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-fill text-ink-muted'
        )}
      >
        <Icon className="size-7" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <p className="text-headline text-ink">{title}</p>
      {children && <div className="mt-1 max-w-xs text-subhead text-ink-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
