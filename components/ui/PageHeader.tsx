import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  /** Petite ligne en capitales au-dessus du titre, en corail (« Jeudi 8 octobre »). */
  eyebrow?: ReactNode
  subtitle?: ReactNode
  /** Rangée de 44 px au-dessus du titre, à gauche : retour. */
  leading?: ReactNode
  /** Même rangée, à droite : bouton compte, bouton rond « + »… */
  trailing?: ReactNode
  className?: string
}

/**
 * Grand titre façon iOS : rangée d'actions de 44 px, sur-titre, titre de 34 px,
 * sous-titre. Il remplace la barre haute fixe, supprimée avec la refonte « Givre » :
 * chaque écran porte son propre titre, et le compte est un bouton rond en verre dans
 * le coin, comme dans les applis d'Apple.
 *
 * Sans `leading`, le sur-titre prend la place de gauche de la rangée, à hauteur du
 * bouton compte : le titre remonte d'autant.
 */
export function PageHeader({ title, eyebrow, subtitle, leading, trailing, className }: PageHeaderProps) {
  const eyebrowNode = eyebrow ? (
    <p className="truncate text-footnote font-bold uppercase tracking-[0.5px] text-hl-ink">{eyebrow}</p>
  ) : null
  return (
    <header className={cn('flex flex-col', className)}>
      <div className="flex h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center">{leading ?? eyebrowNode}</div>
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      </div>
      {leading && eyebrowNode && <div className="mt-1.5">{eyebrowNode}</div>}
      <h1 className="mt-1 text-large-title">{title}</h1>
      {subtitle && <p className="mt-0.5 text-subhead text-ink-muted">{subtitle}</p>}
    </header>
  )
}

/** Bouton rond en verre (44 px), lien. Icône seule : `label` est obligatoire. */
export function GlassIconLink({
  href,
  label,
  children,
  className,
}: {
  href: string
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn('glass inline-flex size-11 items-center justify-center rounded-full text-ink focus-ring', className)}
    >
      {children}
    </Link>
  )
}

/** Retour, en verre, dans la rangée haute de `PageHeader`. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <GlassIconLink href={href} label={label}>
      <ChevronLeft className="size-6" strokeWidth={2.4} aria-hidden="true" />
    </GlassIconLink>
  )
}
