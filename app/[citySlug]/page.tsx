import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionIsAdmin, getSessionUser } from '@/lib/auth/session'
import { resolveFeedContext, queryArticles, queryMonthEvents, type FeedContext } from '@/lib/feed/query'
import { formatParisTodayLabel, parisHorizonISO } from '@/lib/feed/paris-time'
import { getCurrentParisWeekRangeLabel } from '@/lib/week'
import { parseDateParam, serializeRangeBounds, type DateRange } from '@/lib/feed/date-params'
import { monthBounds, parseMonthParam, parseViewParam, serializeMonth, type CivilMonth, type FeedView } from '@/lib/feed/view-params'
import { parseCategoryParam } from '@/lib/feed/category-params'
import { normalizeSearchText } from '@/lib/utils'
import { SPOTLIGHT_SLUG, toHomeTab, type HomeTab } from '@/lib/feed/tabs'
import { fetchLatestDigest } from '@/lib/digest/latest'
import { fetchLastFetchAt } from '@/lib/feed/last-update'
import { CityHomePage } from '@/components/articles/CityHomePage'
import { ArticleFeed } from '@/components/articles/ArticleFeed'
import { FeedSkeleton } from '@/components/articles/FeedSkeleton'
import type { Category } from '@/lib/types'

const PAGE_SIZE = 20

function readParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function readTab(value: string | string[] | undefined): HomeTab {
  // `toHomeTab` porte le repli sur « Actus » et l'alias déprécié `?tab=guinguettes`,
  // que les PWA déjà installées gardent dans leurs raccourcis.
  return toHomeTab(readParam(value))
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

  const supabase = await createClient()

  // Étage 1 — la coquille. Deux requêtes courtes seulement : sans elles on ne peut ni
  // titrer la page ni dessiner les pastilles. Tout le reste part en streaming. La
  // session vient du cache par requête (`lib/auth/session.ts`) : `getSessionIsAdmin`,
  // plus bas, la relit sans second aller-retour vers le serveur Auth.
  const [{ data: categories }, user] = await Promise.all([
    supabase.from('categories').select('*').order('display_order').order('name'),
    getSessionUser(),
  ])

  // Tous les onglets sont proposables à tout le monde : « Résumés IA » affiche le
  // dernier résumé enregistré même sans session (voir `lib/feed/tabs.ts`). L'onglet ne
  // dépend donc plus de la session — seul son contenu s'ajuste aux droits.
  const tab = readTab(searchParams.tab)
  const isSpotlight = tab === 'metropole'

  const categoryList = (categories ?? []) as Category[]
  // La catégorie mise en avant a son propre onglet : elle ne doit pas apparaître dans
  // les pastilles du feed Actus, ni pouvoir y être sélectionnée via l'URL.
  const selectableCategories = isSpotlight
    ? categoryList
    : categoryList.filter((c) => c.slug !== SPOTLIGHT_SLUG)

  const selectedCategories = isSpotlight
    ? []
    : parseCategoryParam(searchParams.cat, selectableCategories)

  // Résolution du contexte et statut admin en parallèle : ni l'un ni l'autre ne dépend
  // du résultat de l'autre, les enchaîner ajoutait un aller-retour au chemin critique.
  //
  // Le dernier résumé IA embarque dans la même vague, mais **seulement** sur son onglet :
  // sinon on paierait sa lecture à chaque affichage du feed. Sans ça, l'onglet ne pouvait
  // l'obtenir qu'après le clic — chunk, montage, puis un aller-retour HTTP qui rouvrait
  // lui-même deux à trois requêtes Supabase en série.
  const [context, isAdmin, latestDigest] = await Promise.all([
    resolveFeedContext(
      supabase,
      citySlug,
      isSpotlight ? [SPOTLIGHT_SLUG] : selectedCategories,
      isSpotlight ? undefined : SPOTLIGHT_SLUG
    ),
    getSessionIsAdmin(),
    tab === 'ia' ? fetchLatestDigest(supabase, citySlug) : Promise.resolve(null),
  ])

  // Slug de ville inconnu : avant, la page affichait le slug brut en titre au-dessus
  // d'un feed vide, indiscernable d'une ville sans actualité.
  if (!context) notFound()

  const search = normalizeSearchText(readParam(searchParams.q))
  const horizon = parisHorizonISO()
  // Mode d'affichage : en vue mensuelle, la plage de dates n'a pas de sens et c'est le
  // mois qui est lu. Le squelette prend la forme de ce qui va le remplacer.
  const view = parseViewParam(searchParams.v)
  const month = parseMonthParam(searchParams.m)
  const range = view === 'mois' ? null : parseDateParam(searchParams.d)

  // Les onglets Favoris et Résumés IA ont leur propre chargement : pas de slot de feed
  // à préparer pour eux.
  const needsFeed = tab === 'actus' || isSpotlight

  // `undefined` = le serveur n'a rien préparé (on n'est pas sur l'onglet, ou la lecture a
  // échoué) et l'onglet charge lui-même ; `null` = le serveur a bien regardé, il n'y a
  // pas encore de résumé. La distinction évite d'afficher « Chargement… » indéfiniment
  // dans le second cas.
  const initialDigest = latestDigest?.ok ? latestDigest.digest : undefined

  return (
    <CityHomePage
      citySlug={citySlug}
      cityName={context.cityName}
      tab={tab}
      categories={categoryList}
      userId={user?.id ?? null}
      isAdmin={isAdmin}
      horizon={horizon}
      todayLabel={formatParisTodayLabel()}
      weekLabel={getCurrentParisWeekRangeLabel()}
      initialDigest={initialDigest}
    >
      {needsFeed && (
        // Étage 2 — la liste. La coquille est déjà envoyée au navigateur pendant que
        // cette requête tourne ; avant, la page entière attendait son résultat avant
        // d'émettre le moindre octet de HTML.
        <Suspense fallback={<FeedSkeleton view={view} />}>
          <FeedSlot
            citySlug={citySlug}
            context={context}
            categories={categoryList}
            userId={user?.id ?? null}
            isAdmin={isAdmin}
            horizon={horizon}
            view={view}
            month={month}
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

interface FeedSlotProps {
  citySlug: string
  context: FeedContext
  categories: Category[]
  userId: string | null
  isAdmin: boolean
  horizon: string
  view: FeedView
  month: CivilMonth
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
  userId,
  isAdmin,
  horizon,
  view,
  month,
  range,
  search,
  rawSearch,
  selectedCategories,
  isSpotlight,
}: FeedSlotProps) {
  const supabase = await createClient()
  const bounds = monthBounds(month)

  // Une seule des deux requêtes part : celle du mode demandé. L'autre lot sera chargé
  // par le client au premier passage sur l'autre mode, s'il a lieu.
  const [feed, monthResult, favorites, lastFetchAt] = await Promise.all([
    view === 'liste'
      ? queryArticles(supabase, {
          context,
          range: range ? { from: range.from.toISOString(), to: range.to.toISOString() } : null,
          horizon,
          search,
          offset: 0,
          limit: PAGE_SIZE,
        })
      : Promise.resolve(null),
    view === 'mois'
      ? queryMonthEvents(supabase, { context, start: bounds.start.toISOString(), end: bounds.end.toISOString(), search })
      : Promise.resolve(null),
    userId
      ? supabase
          .from('user_favorites')
          .select('article_id')
          .eq('user_id', userId)
          .then(({ data }) => (data ?? []).map((f: { article_id: number }) => f.article_id))
      : Promise.resolve([] as number[]),
    fetchLastFetchAt(supabase, context.cityId),
  ])

  return (
    <ArticleFeed
      citySlug={citySlug}
      categorySlug={isSpotlight ? SPOTLIGHT_SLUG : undefined}
      excludeCategorySlug={isSpotlight ? undefined : SPOTLIGHT_SLUG}
      canManageContent={isAdmin}
      hideCategoryTabs={isSpotlight}
      categories={categories}
      userId={userId}
      feedContext={context}
      horizon={horizon}
      initialArticles={feed?.articles ?? []}
      initialHasMore={feed?.hasMore ?? false}
      initialTotal={feed?.total ?? null}
      initialError={feed?.error ? feed.error.message : null}
      initialFavorites={favorites}
      initialRange={serializeRangeBounds(range)}
      initialSearch={rawSearch}
      initialCategories={selectedCategories}
      lastFetchAt={lastFetchAt}
      initialView={view}
      initialMonth={serializeMonth(month)}
      // Null en cas d'échec : le feed relance la lecture au montage et affiche l'erreur
      // si elle persiste, plutôt qu'une grille vide présentée comme un mois sans rien.
      initialMonthEvents={monthResult && !monthResult.error ? monthResult.events : null}
    />
  )
}
