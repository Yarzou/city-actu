import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/authz'
import { resolveFeedContext, queryArticles } from '@/lib/feed/query'
import { parisHorizonISO } from '@/lib/feed/paris-time'
import { parseDateParam, serializeRangeBounds } from '@/lib/feed/date-params'
import { normalizeSearchText } from '@/lib/utils'
import { GUINGUETTES_SLUG, isHomeTab, type HomeTab } from '@/lib/feed/tabs'
import { CityHomePage } from '@/components/articles/CityHomePage'

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
  const search = normalizeSearchText(readParam(searchParams.q))
  const range = parseDateParam(searchParams.d)
  const horizon = parisHorizonISO()

  const supabase = await createClient()

  // Les deux onglets de feed lisent la même ville mais pas la même catégorie :
  // « Actus » exclut les guinguettes, « Guinguettes » ne garde qu'elles.
  const isGuinguettes = tab === 'guinguettes'
  const [context, { data: categories }, { data: auth }] = await Promise.all([
    resolveFeedContext(
      supabase,
      citySlug,
      isGuinguettes ? GUINGUETTES_SLUG : undefined,
      isGuinguettes ? undefined : GUINGUETTES_SLUG
    ),
    supabase.from('categories').select('*').order('display_order').order('name'),
    supabase.auth.getUser(),
  ])

  // Slug de ville inconnu : avant, la page affichait le slug brut en titre au-dessus
  // d'un feed vide, indiscernable d'une ville sans actualité.
  if (!context) notFound()

  const user = auth?.user ?? null

  // Les onglets Favoris et Résumés IA ont leur propre chargement : ne pas payer une
  // requête d'articles pour un contenu qui ne sera pas rendu.
  const needsFeed = tab === 'actus' || tab === 'guinguettes'

  const [feed, isAdmin, favorites] = await Promise.all([
    needsFeed
      ? queryArticles(supabase, {
          context,
          range: range ? { from: range.from.toISOString(), to: range.to.toISOString() } : null,
          horizon,
          search,
          offset: 0,
          limit: PAGE_SIZE,
        })
      : Promise.resolve(null),
    user ? isAdminUser(supabase, user.id) : Promise.resolve(false),
    user
      ? supabase
          .from('user_favorites')
          .select('article_id')
          .eq('user_id', user.id)
          .then(({ data }) => (data ?? []).map((f: { article_id: number }) => f.article_id))
      : Promise.resolve([] as number[]),
  ])

  return (
    <CityHomePage
      citySlug={citySlug}
      cityName={context.cityName}
      tab={tab}
      categories={categories ?? []}
      userId={user?.id ?? null}
      isAdmin={isAdmin}
      feedContext={context}
      horizon={horizon}
      initialArticles={feed?.articles ?? null}
      initialHasMore={feed?.hasMore ?? false}
      initialError={feed?.error ? feed.error.message : null}
      initialFavorites={favorites}
      initialRange={serializeRangeBounds(range)}
      initialSearch={readParam(searchParams.q)}
    />
  )
}
