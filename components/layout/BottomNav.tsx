'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Newspaper, Wine, Heart, User } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Navigation principale au pouce.
 *
 * Elle remplace un menu hamburger qui n'ouvrait qu'une seule entrée : `NAV_LINKS`
 * ne contenait que le lien vers la ville, et les catégories comme les onglets
 * n'étaient joignables que par des rangées à défilement horizontal au milieu de la
 * page. Elle n'existe que parce que les onglets ont désormais de vraies URLs
 * (`?tab=`) — sans ça, il n'y aurait rien vers quoi pointer.
 */

const DEFAULT_CITY_SLUG = 'la-chapelle-sur-erdre'

/** Chemins où la barre gênerait plus qu'elle n'aiderait. */
const HIDDEN_PREFIXES = ['/auth']

const ITEMS = [
  { tab: null,          label: 'Actus',       icon: Newspaper },
  { tab: 'guinguettes', label: 'Guinguettes', icon: Wine },
  { tab: 'favoris',     label: 'Favoris',     icon: Heart },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  // Le slug de ville se lit dans l'URL : la barre vit dans le layout racine, elle
  // n'a pas accès aux props de la page. Repli sur la seule ville seedée pour les
  // routes hors ville (`/profil`, `/a-propos`).
  const firstSegment = pathname.split('/').filter(Boolean)[0]
  const citySlug =
    firstSegment && !['profil', 'admin', 'article', 'a-propos', 'offline'].includes(firstSegment)
      ? firstSegment
      : DEFAULT_CITY_SLUG

  const cityRoot = `/${citySlug}`
  const onCityRoot = pathname === cityRoot
  const activeTab = onCityRoot ? searchParams.get('tab') : null
  const onProfile = pathname.startsWith('/profil')

  return (
    <nav
      data-chrome
      aria-label="Navigation principale"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white pb-safe sm:hidden"
      style={{ paddingLeft: 'var(--sal)', paddingRight: 'var(--sar)' }}
    >
      <ul className="flex items-stretch">
        {ITEMS.map(({ tab, label, icon: Icon }) => {
          const isActive = onCityRoot && activeTab === tab
          const href = tab ? `${cityRoot}?tab=${tab}` : cityRoot

          return (
            <li key={label} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors focus-ring',
                  isActive ? 'text-brand-700' : 'text-gray-500'
                )}
              >
                <Icon className={cn('size-5', isActive && 'fill-brand-100')} />
                {label}
              </Link>
            </li>
          )
        })}
        <li className="flex-1">
          <Link
            href="/profil"
            aria-current={onProfile ? 'page' : undefined}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors focus-ring',
              onProfile ? 'text-brand-700' : 'text-gray-500'
            )}
          >
            <User className="size-5" />
            Profil
          </Link>
        </li>
      </ul>
    </nav>
  )
}
