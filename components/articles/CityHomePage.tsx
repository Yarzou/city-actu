'use client'

import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Sparkles, UserRound } from 'lucide-react'
import { ArticleFeed } from './ArticleFeed'
import { TabPanel } from './TabPanel'
import { GlassIconLink, PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/utils'
import {
  FEED_TABS,
  SPOTLIGHT_SLUG,
  forgetTabMemory,
  rememberTabParams,
  rememberedScrollY,
  toHomeTab,
  type HomeTab,
} from '@/lib/feed/tabs'
import type { LatestDigest } from '@/lib/digest/latest'
import type { Category } from '@/lib/types'

// Chargés à la demande : « Actus » est l'onglet par défaut, les autres corps n'ont pas
// à peser sur le chunk initial. Le préchargement des onglets les télécharge ensuite.
const FavoritesTab = dynamic(() => import('./FavoritesTab').then((m) => m.FavoritesTab))
// `loading` fourni ici et pas pour les favoris : le résumé IA est souvent servi dans le
// HTML par la page (prop `initialDigest`), donc le seul temps d'attente restant est le
// téléchargement du chunk — sans repli, la zone était simplement vide. Le squelette
// reprend la carte d'en-tête d'`AIDigestTab`, sinon le contenu se décale au remplacement.
const AIDigestTab = dynamic(() => import('./AIDigestTab').then((m) => m.AIDigestTab), {
  loading: () => (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="rounded-[22px] bg-card p-4 shadow-lift">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-fill text-white">
            <Sparkles className="size-[22px]" />
          </span>
          <div>
            <p className="text-headline text-ink">La semaine à La Chap’</p>
            <p className="text-footnote text-ink-muted">Chargement du dernier résumé…</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-fill-soft" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-fill-soft" />
        </div>
      </div>
    </div>
  ),
})

interface CityHomePageProps {
  citySlug: string
  cityName: string
  /** L'onglet que le serveur a effectivement rendu — celui dont `children` porte le feed. */
  tab: HomeTab
  categories: Category[]
  userId: string | null
  isAdmin: boolean
  horizon: string
  /** « jeudi 8 octobre », calculé par le serveur en heure de Paris. */
  todayLabel: string
  /** « Du 5 au 11 octobre » : la semaine du résumé, même provenance. */
  weekLabel: string
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
   * Le feed rendu par le serveur, derrière un `<Suspense>`. Il occupe le panneau de
   * l'onglet que le serveur a rendu ; l'autre fil se charge côté client.
   */
  children?: React.ReactNode
}

/**
 * Délai avant de précharger les onglets non affichés : la page visible passe d'abord,
 * ses images et son hydratation ne doivent pas partager le réseau avec des onglets
 * qu'on n'ouvrira peut-être pas.
 */
const PREFETCH_DELAY_MS = 1500

/** Titre et sous-titre de chaque onglet : l'écran dit où l'on est, comme sur iOS. */
function tabHeading(tab: HomeTab, cityName: string): { title: string; subtitle: string } {
  switch (tab) {
    case 'metropole':
      return { title: 'Autour de la Chap’', subtitle: 'Nantes, Ancenis, Angers et alentours' }
    case 'favoris':
      return { title: 'Favoris', subtitle: 'Vos actus gardées sous la main' }
    case 'ia':
      return { title: 'Résumé', subtitle: `La semaine à ${cityName}, écrite par l’IA` }
    default:
      return { title: 'Actus', subtitle: cityName }
  }
}

export function CityHomePage({
  citySlug,
  cityName,
  tab: serverTab,
  categories,
  userId,
  isAdmin,
  horizon,
  todayLabel,
  weekLabel,
  initialDigest,
  children,
}: CityHomePageProps) {
  // L'onglet vit dans l'URL (`?tab=`) et non en state local : il est partageable,
  // survit au rafraîchissement, se défait au bouton retour, et sert de cible aux
  // raccourcis du manifeste PWA. Il change par la barre d'onglets flottante (`TabBar`),
  // seule navigation depuis la refonte : la rangée d'onglets desktop a disparu.
  const searchParams = useSearchParams()
  const isAuthenticated = Boolean(userId)
  // Même relecture que côté serveur, alias `?tab=guinguettes` compris : les deux
  // doivent tomber sur le même onglet, sinon le feed rendu par le serveur ne serait pas
  // celui que le client affiche.
  const tab: HomeTab = toHomeTab(searchParams.get('tab'))
  const { title, subtitle } = tabHeading(tab, cityName)

  // ─── Onglets gardés en vie ────────────────────────────────────────────────────
  // Un onglet ouvert reste monté, caché quand on en change (`TabPanel`). Avant, chaque
  // changement démontait l'onglet quitté et remontait le nouveau à vide : squelettes,
  // puis toutes ses requêtes, à chaque aller-retour Actus → Autour → Actus.
  //
  // Mis à jour pendant le rendu et non dans un effet : l'onglet demandé doit être monté
  // dès ce rendu-ci, sans passer par une image vide.
  const [mounted, setMounted] = useState<ReadonlySet<HomeTab>>(() => new Set([tab]))
  if (!mounted.has(tab)) setMounted(new Set([...mounted, tab]))

  // Préchargement : une fois la page affichée, les autres onglets sont montés cachés et
  // font leurs requêtes en arrière-plan. Le premier passage sur « Autour » ou « Favoris »
  // est alors aussi instantané que les suivants. Rien en mode économiseur de données.
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return

    let idleId: number | undefined
    const mountAll = () => startTransition(() => setMounted(new Set(FEED_TABS)))
    const timer = window.setTimeout(() => {
      // Safari n'a pas `requestIdleCallback` : le délai seul y fait office d'attente.
      if (typeof window.requestIdleCallback === 'function') idleId = window.requestIdleCallback(mountAll, { timeout: 2000 })
      else mountAll()
    }, PREFETCH_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      if (idleId !== undefined) window.cancelIdleCallback(idleId)
    }
  }, [])

  // Paramètres de fil de l'onglet affiché, que `pushTab` lui rendra au retour.
  useEffect(() => {
    rememberTabParams(tab, searchParams)
  }, [tab, searchParams])
  useEffect(() => forgetTabMemory, [])

  // Chaque onglet retrouve sa position de défilement, un onglet jamais ouvert le haut de
  // page. En effet de mise en page : le défilement doit avoir lieu avant que l'écran
  // soit peint avec le nouvel onglet, sinon on le voit sauter.
  const shownTabRef = useRef(tab)
  useLayoutEffect(() => {
    if (shownTabRef.current === tab) return
    shownTabRef.current = tab
    // `auto` et non `instant`, valeur que d'anciens Safari refusent : sans
    // `scroll-behavior` dans le CSS, `auto` est déjà immédiat.
    window.scrollTo({ top: rememberedScrollY(tab), behavior: 'auto' })
  }, [tab])

  function renderTab(panel: HomeTab) {
    switch (panel) {
      case 'actus':
      case 'metropole':
        // Le fil de l'onglet rendu par le serveur est dans `children`, déjà rempli ;
        // l'autre se charge lui-même.
        if (panel === serverTab && children) return children
        return (
          <ArticleFeed
            citySlug={citySlug}
            categorySlug={panel === 'metropole' ? SPOTLIGHT_SLUG : undefined}
            excludeCategorySlug={panel === 'metropole' ? undefined : SPOTLIGHT_SLUG}
            canManageContent={isAdmin}
            hideCategoryTabs={panel === 'metropole'}
            categories={categories}
            userId={userId}
            horizon={horizon}
          />
        )
      case 'favoris':
        return <FavoritesTab citySlug={citySlug} />
      case 'ia':
        // Trois droits distincts : `isAuthenticated` ouvre l'historique et l'envoi par
        // mail, `canGenerate` autorise une dépense LLM, `canManageContent` une
        // suppression. Les deux derniers valent `isAdmin` aujourd'hui.
        return (
          <AIDigestTab
            citySlug={citySlug}
            cityName={cityName}
            isAuthenticated={isAuthenticated}
            canManageContent={isAdmin}
            canGenerate={isAdmin}
            initialDigest={initialDigest}
          />
        )
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-safe sm:px-6 lg:px-8">
      {/*
        Le compte est un bouton rond en verre dans le coin, comme dans les applis
        d'Apple : il mène à « Compte » (Face ID, apparence, administration) une fois
        connecté, à la connexion sinon. Il remplace la barre haute et son menu.
      */}
      <PageHeader
        eyebrow={tab === 'ia' ? weekLabel : todayLabel}
        title={title}
        subtitle={subtitle}
        trailing={
          <GlassIconLink
            href={isAuthenticated ? '/compte' : '/auth/login'}
            label={isAuthenticated ? 'Compte' : 'Se connecter'}
            className="size-10"
          >
            <UserRound className={cn('size-5', isAuthenticated && 'text-accent')} strokeWidth={2.2} aria-hidden="true" />
          </GlassIconLink>
        }
      />

      {/* Ordre et clés fixes : un panneau garde son identité, donc son état, quel que
          soit l'onglet affiché. */}
      {FEED_TABS.map((panel) =>
        mounted.has(panel) ? (
          <TabPanel key={panel} active={panel === tab}>
            {renderTab(panel)}
          </TabPanel>
        ) : null
      )}
    </div>
  )
}
