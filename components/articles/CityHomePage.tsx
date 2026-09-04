'use client'

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Newspaper, Wine, Heart, Sparkles, RefreshCw } from 'lucide-react'
import { ArticleFeed } from './ArticleFeed'
import { cn } from '@/lib/utils'
import type { FeedContext } from '@/lib/feed/query'
import type { SerializedDateRange } from '@/lib/feed/date-params'
import { GUINGUETTES_SLUG, isHomeTab, type HomeTab } from '@/lib/feed/tabs'
import type { Category, FeedArticle } from '@/lib/types'

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
  /** L'onglet que le serveur a effectivement rendu — celui qui porte les données. */
  tab: HomeTab
  categories: Category[]
  userId: string | null
  isAdmin: boolean
  feedContext: FeedContext
  horizon: string
  initialArticles: FeedArticle[] | null
  initialHasMore: boolean
  initialError: string | null
  initialFavorites: number[]
  initialRange: SerializedDateRange | null
  initialSearch: string
}

export function CityHomePage({
  citySlug,
  cityName,
  tab: serverTab,
  categories,
  userId,
  isAdmin,
  feedContext,
  horizon,
  initialArticles,
  initialHasMore,
  initialError,
  initialFavorites,
  initialRange,
  initialSearch,
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
        setRefreshFeedback({ ok: true, msg: `${s.inserted} nouvel(s) article(s) ajouté(s)` })
      } else {
        setRefreshFeedback({ ok: false, msg: data.error ?? 'Erreur inconnue' })
      }
    } catch {
      setRefreshFeedback({ ok: false, msg: 'Erreur réseau' })
    }
    setRefreshing(false)
    setTimeout(() => setRefreshFeedback(null), 5000)
  }

  // Les données du rendu serveur ne valent que pour l'onglet qu'il a rendu. Après un
  // changement d'onglet côté client, le feed se recharge lui-même (voir le `key`,
  // qui force un montage propre plutôt qu'une réconciliation d'états croisés).
  const isServerRenderedTab = tab === serverTab
  const feedProps = isServerRenderedTab
    ? {
        feedContext,
        initialArticles,
        initialHasMore,
        initialError,
        initialRange,
        initialSearch,
      }
    : {}

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
      {/* City header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{cityName}</h1>
        {userId && isAdmin && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Rafraîchir les sources"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 focus-ring"
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">{refreshing ? 'Rafraîchissement…' : 'Rafraîchir'}</span>
          </button>
        )}
      </div>
      {refreshFeedback && (
        <p role="status" className={cn('mb-4 text-sm', refreshFeedback.ok ? 'text-brand-700' : 'text-red-600')}>
          {refreshFeedback.ok ? '✅' : '❌'} {refreshFeedback.msg}
        </p>
      )}

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Sections"
        className="edge-fade flex snap-x snap-mandatory overflow-x-auto scrollbar-hide border-b border-gray-200 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 sm:snap-none"
      >
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => selectTab(id)}
            className={cn(
              'shrink-0 snap-start inline-flex min-h-11 items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap focus-ring',
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
      {tab === 'actus' && (
        <ArticleFeed
          key="actus"
          citySlug={citySlug}
          excludeCategorySlug={GUINGUETTES_SLUG}
          canManageContent={isAdmin}
          hideHeader
          hideMiniCalendar
          categories={categories}
          userId={userId}
          horizon={horizon}
          initialFavorites={initialFavorites}
          {...feedProps}
        />
      )}
      {tab === 'guinguettes' && (
        <ArticleFeed
          key="guinguettes"
          citySlug={citySlug}
          categorySlug={GUINGUETTES_SLUG}
          canManageContent={isAdmin}
          hideHeader
          hideMiniCalendar
          hideCategoryTabs
          categories={categories}
          userId={userId}
          horizon={horizon}
          initialFavorites={initialFavorites}
          {...feedProps}
        />
      )}
      {tab === 'favoris' && <FavoritesTab citySlug={citySlug} />}
      {tab === 'ia' && <AIDigestTab citySlug={citySlug} canManageContent={isAdmin} />}
    </div>
  )
}
