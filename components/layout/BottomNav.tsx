'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Newspaper, Heart, Sparkles, Settings, Star, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CityListItem } from '@/lib/feed/cities'

/**
 * Navigation principale au pouce.
 *
 * Elle remplace un menu hamburger qui n'ouvrait qu'une seule entrée : `NAV_LINKS`
 * ne contenait que le lien vers la ville, et les catégories comme les onglets
 * n'étaient joignables que par des rangées à défilement horizontal au milieu de la
 * page. Elle n'existe que parce que les onglets ont désormais de vraies URLs
 * (`?tab=`) — sans ça, il n'y aurait rien vers quoi pointer.
 */

/** Chemins où la barre gênerait plus qu'elle n'aiderait. */
const HIDDEN_PREFIXES = ['/auth']

/**
 * Onglets fixes de la page ville. L'onglet thématique n'y figure pas : il dépend de la
 * ville (`cities.spotlight_category_id`) et s'insère en deuxième position quand elle en
 * désigne une — voir `spotlightLabel`.
 *
 * À 20% chacune, ~75px sur un écran de 375px, ce que les libellés courts absorbent.
 */
const TAB_ITEMS = [
  { tab: null,      label: 'Actus',   icon: Newspaper },
  { tab: 'favoris', label: 'Favoris', icon: Heart },
  { tab: 'ia',      label: 'IA',      icon: Sparkles },
] as const

interface BottomNavProps {
  /**
   * Résolu côté serveur dans le layout racine. Conditionne l'entrée « Admin » :
   * `/profil` renvoie 404 aux non-administrateurs, la barre ne doit jamais mener à une
   * impasse. C'est aussi le seul accès à l'administration sur mobile depuis qu'elle a
   * été retirée du menu hamburger — les deux points d'entrée faisaient doublon.
   */
  isAdmin?: boolean
  /**
   * Ville à viser quand la route n'en porte pas (`/profil`, `/a-propos`, `/article/:id`).
   * Résolue par le layout depuis le cookie de dernière ville visitée : la barre pointait
   * auparavant vers un slug codé en dur, donc toujours vers la même commune.
   */
  fallbackCitySlug?: string | null
  /**
   * Villes joignables, avec le libellé de leur onglet thématique. La barre y retrouve
   * la ville de l'URL : le layout, composant serveur, n'a pas accès au chemin, il ne
   * peut donc pas résoudre l'onglet thématique lui-même.
   */
  cities?: CityListItem[]
}

interface NavEntry {
  key: string
  href: string
  label: string
  icon: LucideIcon
  isActive: boolean
}

export function BottomNav({
  isAdmin = false,
  fallbackCitySlug = null,
  cities = [],
}: BottomNavProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  // Le slug de ville se lit dans l'URL : la barre vit dans le layout racine, elle
  // n'a pas accès aux props de la page. Hors page ville, repli sur la ville mémorisée.
  const firstSegment = pathname.split('/').filter(Boolean)[0]
  const citySlug =
    firstSegment && !['profil', 'admin', 'article', 'a-propos', 'offline'].includes(firstSegment)
      ? firstSegment
      : fallbackCitySlug

  // Aucune ville joignable : rien à quoi renvoyer, la barre s'efface plutôt que de
  // proposer des liens morts.
  if (!citySlug) return null

  const cityRoot = `/${citySlug}`
  const onCityRoot = pathname === cityRoot
  const activeTab = onCityRoot ? searchParams.get('tab') : null
  // Onglet thématique de la ville affichée, pas de la ville mémorisée : sur une page
  // ville le slug vient de l'URL, donc le libellé est juste dès la première visite.
  const spotlightLabel = cities.find((c) => c.slug === citySlug)?.spotlightLabel ?? null

  const entries: NavEntry[] = TAB_ITEMS.map(({ tab, label, icon }) => ({
    key: label,
    href: tab ? `${cityRoot}?tab=${tab}` : cityRoot,
    label,
    icon,
    isActive: onCityRoot && activeTab === tab,
  }))

  // Inséré juste après « Actus », à la place qu'occupait l'onglet Guinguettes.
  if (spotlightLabel) {
    entries.splice(1, 0, {
      key: 'spotlight',
      href: `${cityRoot}?tab=spotlight`,
      label: spotlightLabel,
      icon: Star,
      isActive: onCityRoot && activeTab === 'spotlight',
    })
  }

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
