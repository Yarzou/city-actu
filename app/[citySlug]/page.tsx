import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/authz'
import { resolveCityFeed, queryArticles, type FeedContext } from '@/lib/feed/query'
import { parisHorizonISO } from '@/lib/feed/paris-time'
import { parseDateParam, serializeRangeBounds, type DateRange } from '@/lib/feed/date-params'
import { parseCategoryParam } from '@/lib/feed/category-params'
import { normalizeSearchText } from '@/lib/utils'
import { toHomeTab, type HomeTab } from '@/lib/feed/tabs'
import { CityHomePage } from '@/components/articles/CityHomePage'
import { ArticleFeed } from '@/components/articles/ArticleFeed'
import { SkeletonCard } from '@/components/articles/SkeletonCard'
import type { Category } from '@/lib/types'

const PAGE_SIZE = 20

function readParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export async function generateMetadata(props: PageProps<'/[citySlug]'>): Promise<Metadata> {
  const { citySlug } = await props.params
  const supabase = await createClient()
  const { data: city } = await supabase
    .from('cities')
    .select('name,description')
    .eq('slug', citySlug)
    .maybeSingle()

  // Ville inconnue ou dépubliée (la RLS ne la rend qu'aux administrateurs) : pas de
  // métadonnées à produire, la page renverra 404.
  if (!city) return {}

  const { name, description } = city as { name: string; description: string | null }
  const title = `Actualités de ${name}`
  const desc =
    description ??
    `Toute l'actualité locale de ${name} : infos pratiques, agenda, sorties, travaux et emploi, agrégés au même endroit.`

  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: 'website' },
  }
}

export default async function CityPage(props: PageProps<'/[citySlug]'>) {
  const { citySlug } = await props.params
  const searchParams = await props.searchParams

  const tab = toHomeTab(readParam(searchParams.tab))
  const supabase = await createClient()

  // Étage 1 — la coquille. Une seule requête : la ville, ses catégories et sa catégorie
  // mise en avant arrivent ensemble (voir `resolveCityFeed`). Tout le reste part en
  // streaming.
  const resolution = await resolveCityFeed(supabase, citySlug)

  // Slug inconnu, ou ville dépubliée vue par un non-administrateur : la RLS ne l'a pas
  // rendue, donc `resolution` est null. Avant, la page affichait le slug brut en titre
  // au-dessus d'un feed vide.
  if (!resolution) notFound()

  const { categories, spotlight } = resolution
  // Sans catégorie mise en avant, la ville n'a pas d'onglet thématique : une demande
  // `?tab=spotlight` doit retomber sur Actus plutôt que rendre un onglet fantôme.
  const effectiveTab: HomeTab = tab === 'spotlight' && !spotlight ? 'actus' : tab
  const isSpotlight = effectiveTab === 'spotlight'

  // La catégorie mise en avant a son propre onglet : elle ne doit apparaître ni dans les
  // pastilles du feed Actus, ni pouvoir y être sélectionnée via l'URL.
  const selectableCategories = spotlight
    ? categories.filter((c) => c.id !== spotlight.id)
    : categories

  const selectedCategories = isSpotlight
    ? []
    : parseCategoryParam(searchParams.cat, selectableCategories)

  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user ?? null
  const isAdmin = user ? await isAdminUser(supabase, user.id) : false

  const search = normalizeSearchText(readParam(searchParams.q))
  const range = parseDateParam(searchParams.d)
  const horizon = parisHorizonISO()

  // Les onglets Favoris et Résumés IA ont leur propre chargement : pas de slot de feed
  // à préparer pour eux.
  const needsFeed = effectiveTab === 'actus' || isSpotlight

  // Le contexte du slot dépend de l'onglet : l'onglet thématique ne garde que sa
  // catégorie, l'onglet Actus l'exclut (ou applique la sélection de pastilles).
  const context: FeedContext = isSpotlight
    ? { ...resolution.context, categoryIds: spotlight ? [spotlight.id] : [], excludeCategoryId: null }
    : {
        ...resolution.context,
        categoryIds: selectedCategories
          .map((slug) => categories.find((c) => c.slug === slug)?.id)
          .filter((id): id is number => typeof id === 'number'),
      }

  return (
    <CityHomePage
      citySlug={citySlug}
      cityName={resolution.context.cityName}
      tab={effectiveTab}
      categories={selectableCategories}
      spotlight={spotlight}
      userId={user?.id ?? null}
      isAdmin={isAdmin}
      horizon={horizon}
    >
      {needsFeed && (
        // Étage 2 — la liste. La coquille est déjà envoyée au navigateur pendant que
        // cette requête tourne ; avant, la page entière attendait son résultat avant
        // d'émettre le moindre octet de HTML.
        <Suspense fallback={<FeedSkeleton />}>
          <FeedSlot
            citySlug={citySlug}
            context={context}
            categories={selectableCategories}
            spotlightSlug={spotlight?.slug}
            userId={user?.id ?? null}
            isAdmin={isAdmin}
            horizon={horizon}
            range={range}
            search={search}
            rawSearch={readParam(searchParams.q)}
            selectedCategories={selectedCategories}
            isSpotlight={isSpotlight}
          />
        </Suspense>
      )}
    </CityHomePage>
  )
}

/**
 * Squelette du seul bloc encore en attente : la liste et ses filtres.
 *
 * Le conteneur reprend exactement celui d'`ArticleFeed` — sans ça, le contenu se
 * décale horizontalement au moment où le vrai feed remplace le squelette.
 */
function FeedSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-hidden="true">
      <div className="mb-3 h-12 rounded-xl bg-gray-100 animate-pulse" />
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-11 w-28 shrink-0 rounded-full bg-gray-100 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}

interface FeedSlotProps {
  citySlug: string
  context: FeedContext
  categories: Category[]
  spotlightSlug?: string
  userId: string | null
  isAdmin: boolean
  horizon: string
  range: DateRange | null
  search: string
  rawSearch: string
  selectedCategories: string[]
  isSpotlight: boolean
}

async function FeedSlot({
  citySlug,
  context,
  categories,
  spotlightSlug,
  userId,
  isAdmin,
  horizon,
  range,
  search,
  rawSearch,
  selectedCategories,
  isSpotlight,
}: FeedSlotProps) {
  const supabase = await createClient()

  const [feed, favorites] = await Promise.all([
    queryArticles(supabase, {
      context,
      range: range ? { from: range.from.toISOString(), to: range.to.toISOString() } : null,
      horizon,
      search,
      offset: 0,
      limit: PAGE_SIZE,
    }),
    userId
      ? supabase
          .from('user_favorites')
          .select('article_id')
          .eq('user_id', userId)
          .then(({ data }) => (data ?? []).map((f: { article_id: number }) => f.article_id))
      : Promise.resolve([] as number[]),
  ])

  return (
    <ArticleFeed
      citySlug={citySlug}
      categorySlug={isSpotlight ? spotlightSlug : undefined}
      excludeCategorySlug={isSpotlight ? undefined : spotlightSlug}
      canManageContent={isAdmin}
      hideHeader
      hideMiniCalendar
      hideCategoryTabs={isSpotlight}
      categories={categories}
      userId={userId}
      feedContext={context}
      horizon={horizon}
      initialArticles={feed.articles}
      initialHasMore={feed.hasMore}
      initialError={feed.error ? feed.error.message : null}
      initialFavorites={favorites}
      initialRange={serializeRangeBounds(range)}
      initialSearch={rawSearch}
      initialCategories={selectedCategories}
    />
  )
}
