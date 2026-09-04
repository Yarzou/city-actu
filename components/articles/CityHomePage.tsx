'use client'

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Newspaper, Wine, Heart, Sparkles, RefreshCw } from 'lucide-react'
import { ArticleFeed } from './ArticleFeed'
import { cn } from '@/lib/utils'
import { GUINGUETTES_SLUG, isHomeTab, type HomeTab } from '@/lib/feed/tabs'
import { usePullToRefresh } from '@/lib/hooks/use-pull-to-refresh'
import { useIsDesktop } from '@/lib/hooks/use-media-query'
import type { Category } from '@/lib/types'

// Chargés à la demande : un seul onglet est rendu à la fois, et « Actus » est celui
// par défaut. Les trois corps d'onglet partaient jusqu'ici dans le chunk initial.
const FavoritesTab = dynamic(() => import('./FavoritesTab').then((m) => m.FavoritesTab))
const AIDigestTab = dynamic(() => import('./AIDigestTab').then((m) => m.AIDigestTab))

const TABS: { id: HomeTab; label: string; icon: React.ReactNode }[] = [
  { id: 'actus',       label: 'Actus',       icon: <Newspaper className="size-4" /> },
  { id: 'guinguettes', label: 'Guinguettes', icon: <Wine className="size-4" /> },
  { id: 'favoris',     label: 'Favoris',     icon: <Heart className="size-4" /> },
  { id: 'ia',          label: 'Résumés IA',  icon: <Sparkles className="size-4" /> },
]

interface CityHomePageProps {
  citySlug: string
  cityName: string
  /** L'onglet que le serveur a effectivement rendu — celui dont `children` porte le feed. */
  tab: HomeTab
  categories: Category[]
  userId: string | null
  isAdmin: boolean
  horizon: string
  /**
   * Le feed rendu par le serveur, derrière un `<Suspense>`. N'est affiché que pour
   * l'onglet que le serveur a rendu : après un changement d'onglet côté client, il ne
   * correspond plus à ce qui est demandé.
   */
  children?: React.ReactNode
}

export function CityHomePage({
  citySlug,
  cityName,
  tab: serverTab,
  categories,
  userId,
  isAdmin,
  horizon,
  children,
}: CityHomePageProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFeedback, setRefreshFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  // L'onglet vit dans l'URL (`?tab=`) et non plus en state local : il est désormais
  // partageable, survit au rafraîchissement, se défait au bouton retour, et peut
  // servir de cible aux raccourcis du manifeste PWA.
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab')
  const tab: HomeTab = isHomeTab(urlTab) ? urlTab : 'actus'

  const selectTab = useCallback((next: HomeTab) => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (next === 'actus') params.delete('tab')
    else params.set('tab', next)
    // Changer d'onglet remet les filtres à zéro : ils portent sur un feed précis.
    params.delete('d')
    params.delete('q')
    params.delete('cat')

    const query = params.toString()
    window.history.pushState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshFeedback(null)
    try {
      const res = await fetch('/api/admin/refresh', { method: 'POST' })
      const data = await res.json()
      if (res.status === 401) {
        setRefreshFeedback({ ok: false, msg: 'Vous devez être connecté.' })
      } else if (data.ok) {
        const s = data.summary
        const updated = s.updated ? `, ${s.updated} mis à jour` : ''
        setRefreshFeedback({ ok: true, msg: `${s.inserted} nouvel(s) article(s) ajouté(s)${updated}` })
      } else {
        setRefreshFeedback({ ok: false, msg: data.error ?? 'Erreur inconnue' })
      }
    } catch {
      setRefreshFeedback({ ok: false, msg: 'Erreur réseau' })
    }
    setRefreshing(false)
    setTimeout(() => setRefreshFeedback(null), 5000)
  }

  // Sur mobile, le geste remplace le bouton : même action, même condition d'accès.
  // Il n'est armé que pour qui peut réellement rafraîchir, sinon on neutraliserait le
  // tirer-pour-rafraîchir natif du navigateur sans rien mettre à la place.
  const isDesktop = useIsDesktop()
  const canRefresh = Boolean(userId && isAdmin)
  const pullEnabled = canRefresh && !isDesktop
  const { pull, armed } = usePullToRefresh({ onRefresh: handleRefresh, enabled: pullEnabled })

  // Pendant le rafraîchissement le doigt est relâché, donc `pull` est retombé à zéro :
  // l'indicateur resterait collé sous l'en-tête. On le maintient à hauteur de seuil.
  const indicatorTravel = refreshing ? 64 : pull
  const showIndicator = pullEnabled && (pull > 0 || refreshing)

  const isServerRenderedTab = tab === serverTab
  const isFeedTab = tab === 'actus' || tab === 'guinguettes'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-12">
      {showIndicator && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center transition-[top] duration-150"
          style={{ top: `calc(var(--header-h) + ${indicatorTravel}px - 2.75rem)` }}
        >
          <span className="flex size-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md">
            <RefreshCw
              className={cn('size-5 text-brand-600', refreshing && 'animate-spin')}
              // Tant que le doigt tire, l'icône suit le geste plutôt que de tourner
              // toute seule : c'est ce qui rend le franchissement du seuil lisible.
              style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: armed ? 1 : 0.5 }}
            />
          </span>
        </div>
      )}

      {/*
        City header. Le titre passe en `sr-only` sur mobile : il est repris dans la
        barre haute, à côté de « Ville Actu ». `sr-only` et non `hidden` pour que la
        page garde un <h1> annonçable — et pour ne pas laisser deux titres concurrents
        à l'écran.
      */}
      <div className="flex items-center justify-between gap-4 sm:mb-6">
        <h1 className="sr-only sm:not-sr-only text-3xl font-bold text-gray-900 tracking-tight">{cityName}</h1>
        {canRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Rafraîchir les sources"
            className="hidden min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 focus-ring sm:inline-flex"
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            <span>{refreshing ? 'Rafraîchissement…' : 'Rafraîchir'}</span>
          </button>
        )}
      </div>
      {refreshFeedback && (
        <p role="status" className={cn('mb-4 text-sm', refreshFeedback.ok ? 'text-brand-700' : 'text-red-600')}>
          {refreshFeedback.ok ? '✅' : '❌'} {refreshFeedback.msg}
        </p>
      )}

      {/*
        Onglets : desktop uniquement. Sur mobile, la barre de navigation basse fait le
        même travail, en fixe. Cette rangée était en `overflow-x-auto snap-x`, donc
        elle glissait sous le doigt au moindre appui-déplacé — toute cette mécanique
        est retirée, quatre onglets tiennent sans déborder au-delà de 640px.
      */}
      <div
        role="tablist"
        aria-label="Sections"
        className="hidden sm:flex border-b border-gray-200 mb-6"
      >
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => selectTab(id)}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap focus-ring',
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {isFeedTab && isServerRenderedTab && children}
      {isFeedTab && !isServerRenderedTab && (
        // Onglet atteint par un changement côté client : le serveur n'a pas préparé ce
        // feed, il se charge lui-même. Le `key` force un montage propre plutôt qu'une
        // réconciliation d'états croisés entre les deux feeds.
        <ArticleFeed
          key={tab}
          citySlug={citySlug}
          categorySlug={tab === 'guinguettes' ? GUINGUETTES_SLUG : undefined}
          excludeCategorySlug={tab === 'guinguettes' ? undefined : GUINGUETTES_SLUG}
          canManageContent={isAdmin}
          hideHeader
          hideMiniCalendar
          hideCategoryTabs={tab === 'guinguettes'}
          categories={categories}
          userId={userId}
          horizon={horizon}
        />
      )}
      {tab === 'favoris' && <FavoritesTab citySlug={citySlug} />}
      {tab === 'ia' && <AIDigestTab citySlug={citySlug} canManageContent={isAdmin} />}
    </div>
  )
}
