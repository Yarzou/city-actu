'use client'

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Newspaper, MapPin, Heart, Sparkles, RefreshCw } from 'lucide-react'
import { ArticleFeed } from './ArticleFeed'
import { cn } from '@/lib/utils'
import { SPOTLIGHT_SLUG, pushTab, toHomeTab, type HomeTab } from '@/lib/feed/tabs'
import type { LatestDigest } from '@/lib/digest/latest'
import type { Category } from '@/lib/types'

// Chargés à la demande : un seul onglet est rendu à la fois, et « Actus » est celui
// par défaut. Les trois corps d'onglet partaient jusqu'ici dans le chunk initial.
const FavoritesTab = dynamic(() => import('./FavoritesTab').then((m) => m.FavoritesTab))
// `loading` fourni ici et pas pour les favoris : le résumé IA est souvent servi dans le
// HTML par la page (prop `initialDigest`), donc le seul temps d'attente restant est le
// téléchargement du chunk — sans repli, la zone était simplement vide. Le squelette
// reprend le conteneur et la carte d'en-tête d'`AIDigestTab`, comme celui de `FeedSlot`
// reprend le conteneur d'`ArticleFeed` : sinon le contenu se décale au remplacement.
const AIDigestTab = dynamic(() => import('./AIDigestTab').then((m) => m.AIDigestTab), {
  loading: () => (
    <div className="max-w-2xl mx-auto px-1 py-6">
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100">
            <Sparkles className="size-5 text-brand-700" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Résumé hebdomadaire IA</h2>
            <p className="text-xs text-gray-500">Dernier résumé à la demande, généré sur la semaine en cours (lundi à dimanche)</p>
          </div>
        </div>
        <div className="h-4 w-3/4 rounded bg-gray-100" />
      </div>
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Chargement du dernier résumé…
      </div>
    </div>
  ),
})

// « Autour de la Chap' » remplace « Guinguettes » : l'onglet mis en avant porte
// désormais la catégorie `metropole`, alimentée par fest.fr, dont les événements sont
// ceux des communes voisines (voir `SPOTLIGHT_SLUG`). Le libellé est plus long que les
// autres et c'est assumé ici — il y a la place au-delà de 640px ; la barre basse, elle,
// le raccourcit (voir `BottomNav`).
const TABS: { id: HomeTab; label: string; icon: React.ReactNode }[] = [
  { id: 'actus',     label: 'Actus',              icon: <Newspaper className="size-4" /> },
  { id: 'metropole', label: "Autour de la Chap'", icon: <MapPin className="size-4" /> },
  { id: 'favoris',   label: 'Favoris',            icon: <Heart className="size-4" /> },
  { id: 'ia',        label: 'Résumés IA',         icon: <Sparkles className="size-4" /> },
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
   * Dernier résumé IA, préparé par le serveur quand on arrive directement sur
   * `?tab=ia`. `undefined` = rien de préparé (autre onglet à l'arrivée, ou lecture en
   * échec) et l'onglet charge lui-même ; `null` = le serveur a regardé, il n'y a pas
   * encore de résumé.
   *
   * Une prop et non un slot `<Suspense>` comme le feed : `children` n'est rendu que
   * lorsque `tab === serverTab`, et le corps de l'onglet IA est un composant client — il
   * ne peut pas être un enfant serveur.
   */
  initialDigest?: LatestDigest | null
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
  initialDigest,
  children,
}: CityHomePageProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFeedback, setRefreshFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  // L'onglet vit dans l'URL (`?tab=`) et non plus en state local : il est désormais
  // partageable, survit au rafraîchissement, se défait au bouton retour, et peut
  // servir de cible aux raccourcis du manifeste PWA.
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab')
  const isAuthenticated = Boolean(userId)
  // Même relecture que côté serveur, alias `?tab=guinguettes` compris : les deux
  // doivent tomber sur le même onglet, sinon le feed rendu par le serveur ne serait pas
  // celui que le client affiche.
  const tab: HomeTab = toHomeTab(urlTab)

  // Mécanique partagée avec la barre de navigation basse : voir `pushTab`.
  const selectTab = useCallback((next: HomeTab) => pushTab(next), [])

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

  // Le rafraîchissement manuel est réservé à l'administration : c'est la seule action
  // du panneau accessible depuis le feed.
  const canRefresh = Boolean(userId && isAdmin)

  const isServerRenderedTab = tab === serverTab
  const isFeedTab = tab === 'actus' || tab === 'metropole'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-12">
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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 focus-ring"
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
        est retirée, quatre onglets — trois pour un visiteur anonyme, qui n'a pas
        « Résumés IA » — tiennent sans déborder au-delà de 640px.
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
          categorySlug={tab === 'metropole' ? SPOTLIGHT_SLUG : undefined}
          excludeCategorySlug={tab === 'metropole' ? undefined : SPOTLIGHT_SLUG}
          canManageContent={isAdmin}
          hideHeader
          hideMiniCalendar
          hideCategoryTabs={tab === 'metropole'}
          categories={categories}
          userId={userId}
          horizon={horizon}
        />
      )}
      {tab === 'favoris' && <FavoritesTab citySlug={citySlug} />}
      {tab === 'ia' && (
        // Trois droits distincts : `isAuthenticated` ouvre l'historique et l'envoi par
        // mail, `canGenerate` autorise une dépense LLM, `canManageContent` une
        // suppression. Les deux derniers valent `isAdmin` aujourd'hui.
        <AIDigestTab
          citySlug={citySlug}
          isAuthenticated={isAuthenticated}
          canManageContent={isAdmin}
          canGenerate={isAdmin}
          initialDigest={initialDigest}
        />
      )}
    </div>
  )
}
