'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Newspaper, Wine, Heart, Sparkles, Settings, type LucideIcon } from 'lucide-react'
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

/**
 * Onglets de la page ville. Quatre entrées pour tout le monde, cinq pour un
 * administrateur (voir `isAdmin`) : à 20% chacune, ~75px sur un écran de 375px, ce
 * que les libellés courts absorbent.
 */
const TAB_ITEMS = [
  { tab: null,          label: 'Actus',       icon: Newspaper },
  { tab: 'guinguettes', label: 'Guinguettes', icon: Wine },
  { tab: 'favoris',     label: 'Favoris',     icon: Heart },
  { tab: 'ia',          label: 'IA',          icon: Sparkles },
] as const

interface BottomNavProps {
  /**
   * Résolu côté serveur dans le layout racine. Conditionne l'entrée « Admin » :
   * `/profil` renvoie 404 aux non-administrateurs, la barre ne doit jamais mener à une
   * impasse. C'est aussi le seul accès à l'administration sur mobile depuis qu'elle a
   * été retirée du menu hamburger — les deux points d'entrée faisaient doublon.
   */
  isAdmin?: boolean
}

interface NavEntry {
  key: string
  href: string
  label: string
  icon: LucideIcon
  isActive: boolean
}

export function BottomNav({ isAdmin = false }: BottomNavProps) {
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

  const entries: NavEntry[] = TAB_ITEMS.map(({ tab, label, icon }) => ({
    key: label,
    href: tab ? `${cityRoot}?tab=${tab}` : cityRoot,
    label,
    icon,
    isActive: onCityRoot && activeTab === tab,
  }))

  if (isAdmin) {
    entries.push({
      key: 'admin',
      href: '/profil',
      label: 'Admin',
      icon: Settings,
      isActive: pathname.startsWith('/profil'),
    })
  }

  return (
    <nav
      data-chrome
      aria-label="Navigation principale"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white pb-safe sm:hidden"
      style={{ paddingLeft: 'var(--sal)', paddingRight: 'var(--sar)' }}
    >
      <ul className="flex items-stretch">
        {entries.map(({ key, href, label, icon: Icon, isActive }) => (
          <li key={key} className="flex-1">
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
        ))}
      </ul>
    </nav>
  )
}
