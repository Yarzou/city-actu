import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Liste groupée façon Réglages d'iOS, reprise de Fridge : en-tête en petites
 * capitales, carte arrondie, séparateurs en retrait, note de bas de section.
 */
export function ListSection({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col', className)}>
      {header && (
        <h2 className="mb-2 ml-4 text-footnote font-normal uppercase tracking-[0.3px] text-ink-muted">{header}</h2>
      )}
      <div className="overflow-hidden rounded-[14px] bg-card">{children}</div>
      {footer && <p className="mx-4 mt-2 text-footnote text-ink-muted">{footer}</p>}
    </section>
  )
}

interface ListRowProps {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  href?: string
  onClick?: () => void
  /** Ligne d'action (texte d'accent) ou destructive (texte rouge). */
  tone?: 'default' | 'accent' | 'danger'
  /** Titre centré, sans icône : « Se déconnecter ». */
  centered?: boolean
  disabled?: boolean
}

/**
 * Ligne de liste. Avec `href` c'est un lien (chevron ajouté), avec `onClick` un
 * bouton, sinon une ligne inerte. Le séparateur part après l'icône, comme sur iOS.
 */
export function ListRow({ title, subtitle, leading, trailing, href, onClick, tone = 'default', centered, disabled }: ListRowProps) {
  const content = (
    <>
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-t border-separator py-2 pr-4 [*:first-child>&]:border-t-0">
        <span className={cn('flex min-w-0 flex-1 flex-col', centered && 'items-center')}>
          <span className={cn('text-body', tone === 'accent' && 'text-accent', tone === 'danger' && 'text-danger')}>
            {title}
          </span>
          {subtitle && <span className="text-footnote text-ink-muted">{subtitle}</span>}
        </span>
        {trailing}
        {href && <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-ink-faint" aria-hidden="true" />}
      </span>
    </>
  )

  const base = 'flex w-full items-stretch gap-3 pl-4 text-left focus-ring'

  if (href) {
    return (
      <Link href={href} className={cn(base, 'active:bg-fill-soft')}>
        {content}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cn(base, 'active:bg-fill-soft disabled:opacity-50')}>
        {content}
      </button>
    )
  }
  return <div className={base}>{content}</div>
}

/** Tuile d'icône carrée et colorée (30 px), en tête de ligne. Icône blanche dessus. */
export function IconTile({ children, className, color }: { children: ReactNode; className?: string; color?: string }) {
  return (
    <span
      className={cn('my-[11px] flex size-[30px] items-center justify-center rounded-lg text-white', className)}
      style={color ? { backgroundColor: color } : undefined}
    >
      {children}
    </span>
  )
}
