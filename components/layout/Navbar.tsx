'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Menu, X, Newspaper, Monitor, Moon, Sun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTheme, type ThemeChoice } from '@/components/theme/ThemeProvider'
import { cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

const NAV_LINKS = [
  { href: '/la-chapelle-sur-erdre', label: 'La Chapelle-sur-Erdre' },
]

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { value: 'light',  label: 'Clair',  icon: <Sun className="size-4" /> },
  { value: 'dark',   label: 'Sombre', icon: <Moon className="size-4" /> },
  { value: 'system', label: 'Auto',   icon: <Monitor className="size-4" /> },
]

interface NavbarProps {
  /** Résolu par le layout serveur : évite un aller-retour d'auth de plus au montage. */
  initialUser?: { id: string } | null
}

export function Navbar({ initialUser = null }: NavbarProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<Pick<User, 'id'> | null>(initialUser)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const supabase = createClient()
    // Plus de `getUser()` au montage : la session est déjà résolue côté serveur et
    // passée en prop. Trois composants la redemandaient en parallèle à chaque
    // chargement de page. On ne garde que l'abonnement, pour les transitions
    // (connexion, déconnexion, expiration) survenues pendant la session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Close menu on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/*
        `h-[var(--header-h)]` et un padding haut égal à l'encoche : en PWA standalone
        sur iPhone, `viewportFit: cover` fait passer le contenu sous la barre d'état,
        et l'en-tête était figé à `h-16`.

        Les insets latéraux sont repris ici alors qu'ils sont déjà posés sur `body` :
        un élément `position: fixed` ignore le padding de son ancêtre, l'en-tête
        n'était donc pas décalé en paysage.
      */}
      <header
        data-chrome
        className="fixed top-0 inset-x-0 z-50 h-[var(--header-h)] bg-white border-b border-gray-200 shadow-sm"
        style={{ paddingTop: 'var(--sat)', paddingLeft: 'var(--sal)', paddingRight: 'var(--sar)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/la-chapelle-sur-erdre" className="flex items-center gap-2 shrink-0 font-semibold text-brand-700 hover:text-brand-900 transition-colors focus-ring">
            <Newspaper className="size-5" />
            <span>Ville Actu</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
                className={cn(
                  'px-3 py-2 rounded-lg transition-colors focus-ring',
                  pathname === href
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Auth buttons */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <ThemeSwitch theme={theme} setTheme={setTheme} />
            {user ? (
              <Link href="/profil" className="text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors focus-ring">
                Mon profil
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2 focus-ring">
                  Connexion
                </Link>
                <Link href="/auth/signup" className="text-sm px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors focus-ring">
                  Inscription
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden inline-flex size-11 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors focus-ring"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile menu panel — aligné sur la hauteur réelle de l'en-tête, encoche incluse */}
      <div
        className={cn(
          'md:hidden fixed top-[var(--header-h)] inset-x-0 z-40 bg-white border-b border-gray-200 shadow-lg transition-all duration-200 ease-out overflow-hidden',
          open ? 'max-h-screen opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
        )}
      >
        <nav className="px-4 py-3 flex flex-col gap-1 text-sm pb-safe">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className={cn(
                'px-3 py-3 rounded-lg font-medium focus-ring',
                pathname === href
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              {label}
            </Link>
          ))}
          <div className="border-t border-gray-100 mt-2 pt-2 flex flex-col gap-1">
            {user ? (
              <Link href="/profil" className="px-3 py-3 rounded-lg text-gray-700 hover:bg-gray-100 font-medium focus-ring">
                Mon profil
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className="px-3 py-3 rounded-lg text-gray-700 hover:bg-gray-100 font-medium focus-ring">
                  Connexion
                </Link>
                <Link href="/auth/signup" className="px-3 py-3 rounded-lg bg-brand-600 text-white text-center font-medium focus-ring">
                  Inscription
                </Link>
              </>
            )}
          </div>
          {/*
            Le sélecteur de thème n'était consommé que par le panneau d'administration :
            un visiteur ordinaire n'avait aucun moyen de basculer clair/sombre, alors
            que la feuille de styles sombre existe et se déclenche sur la préférence
            système.
          */}
          <div className="border-t border-gray-100 mt-2 pt-3">
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Thème</p>
            <ThemeSwitch theme={theme} setTheme={setTheme} expanded />
          </div>
        </nav>
      </div>
    </>
  )
}

function ThemeSwitch({
  theme,
  setTheme,
  expanded = false,
}: {
  theme: ThemeChoice
  setTheme: (t: ThemeChoice) => void
  expanded?: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Thème de l'interface"
      className={cn(
        'flex items-center gap-1 rounded-lg border border-gray-200 p-1',
        expanded && 'mx-3'
      )}
    >
      {THEME_OPTIONS.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          aria-label={label}
          className={cn(
            'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-ring',
            expanded && 'flex-1',
            theme === value
              ? 'bg-brand-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          {icon}
          {expanded && label}
        </button>
      ))}
    </div>
  )
}
