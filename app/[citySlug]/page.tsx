import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/authz'
import { resolveFeedContext, queryArticles, type FeedContext } from '@/lib/feed/query'
import { parisHorizonISO } from '@/lib/feed/paris-time'
import { parseDateParam, serializeRangeBounds, type DateRange } from '@/lib/feed/date-params'
import { parseCategoryParam } from '@/lib/feed/category-params'
import { normalizeSearchText } from '@/lib/utils'
import { GUINGUETTES_SLUG, isHomeTab, type HomeTab } from '@/lib/feed/tabs'
import { CityHomePage } from '@/components/articles/CityHomePage'
import { ArticleFeed } from '@/components/articles/ArticleFeed'
import { SkeletonCard } from '@/components/articles/SkeletonCard'
import type { Category } from '@/lib/types'

const PAGE_SIZE = 20

function readParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function readTab(value: string | string[] | undefined): HomeTab {
  const raw = readParam(value)
  return isHomeTab(raw) ? raw : 'actus'
}

export async function generateMetadata(props: PageProps<'/[citySlug]'>): Promise<Metadata> {
  const { citySlug } = await props.params
  const supabase = await createClient()
  const { data: city } = await supabase
    .from('cities')
    .select('name,description')
    .eq('slug', citySlug)
    .maybeSingle()

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

  const tab = readTab(searchParams.tab)
  const isGuinguettes = tab === 'guinguettes'

  const supabase = await createClient()

  // Étage 1 — la coquille. Deux requêtes courtes seulement : sans elles on ne peut ni
  // titrer la page ni dessiner les pastilles. Tout le reste part en streaming.
  const [{ data: categories }, { data: auth }] = await Promise.all([
    supabase.from('categories').select('*').order('display_order').order('name'),
    supabase.auth.getUser(),
  ])

  const categoryList = (categories ?? []) as Category[]
  // Sur l'onglet Actus, les guinguettes ont leur propre onglet : elles ne doivent pas
  // apparaître dans les pastilles, ni pouvoir être sélectionnées via l'URL.
  const selectableCategories = isGuinguettes
    ? categoryList
    : categoryList.filter((c) => c.slug !== GUINGUETTES_SLUG)

  const selectedCategories = isGuinguettes
    ? []
    : parseCategoryParam(searchParams.cat, selectableCategories)

  const user = auth?.user ?? null

  // Résolution du contexte et statut admin en parallèle : ni l'un ni l'autre ne dépend
  // du résultat de l'autre, les enchaîner ajoutait un aller-retour au chemin critique.
  const [context, isAdmin] = await Promise.all([
    resolveFeedContext(
      supabase,
      citySlug,
      isGuinguettes ? [GUINGUETTES_SLUG] : selectedCategories,
      isGuinguettes ? undefined : GUINGUETTES_SLUG
    ),
    user ? isAdminUser(supabase, user.id) : Promise.resolve(false),
  ])

  // Slug de ville inconnu : avant, la page affichait le slug brut en titre au-dessus
  // d'un feed vide, indiscernable d'une ville sans actualité.
  if (!context) notFound()

  const search = normalizeSearchText(readParam(searchParams.q))
  const range = parseDateParam(searchParams.d)
  const horizon = parisHorizonISO()

  // Les onglets Favoris et Résumés IA ont leur propre chargement : pas de slot de feed
  // à préparer pour eux.
  const needsFeed = tab === 'actus' || isGuinguettes

  return (
    <CityHomePage
      citySlug={citySlug}
      cityName={context.cityName}
      tab={tab}
      categories={categoryList}
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
            categories={categoryList}
            userId={user?.id ?? null}
            isAdmin={isAdmin}
            horizon={horizon}
            range={range}
            search={search}
            rawSearch={readParam(searchParams.q)}
            selectedCategories={selectedCategories}
            isGuinguettes={isGuinguettes}
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
  userId: string | null
  isAdmin: boolean
  horizon: string
  range: DateRange | null
  search: string
  rawSearch: string
  selectedCategories: string[]
  isGuinguettes: boolean
}

async function FeedSlot({
  citySlug,
  context,
  categories,
  userId,
  isAdmin,
  horizon,
  range,
  search,
  rawSearch,
  selectedCategories,
  isGuinguettes,
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
      categorySlug={isGuinguettes ? GUINGUETTES_SLUG : undefined}
      excludeCategorySlug={isGuinguettes ? undefined : GUINGUETTES_SLUG}
      canManageContent={isAdmin}
      hideHeader
      hideMiniCalendar
      hideCategoryTabs={isGuinguettes}
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
