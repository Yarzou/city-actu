import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/authz'
import { resolveFeedContext, queryArticles } from '@/lib/feed/query'
import { parisHorizonISO } from '@/lib/feed/paris-time'
import { parseDateParam, serializeRangeBounds } from '@/lib/feed/date-params'
import { normalizeSearchText } from '@/lib/utils'
import { ArticleFeed } from '@/components/articles/ArticleFeed'

const PAGE_SIZE = 20

function readParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export async function generateMetadata(
  props: PageProps<'/[citySlug]/[categorySlug]'>
): Promise<Metadata> {
  const { citySlug, categorySlug } = await props.params
  const supabase = await createClient()

  const [{ data: city }, { data: category }] = await Promise.all([
    supabase.from('cities').select('name').eq('slug', citySlug).maybeSingle(),
    supabase.from('categories').select('name').eq('slug', categorySlug).maybeSingle(),
  ])

  if (!city || !category) return {}

  const cityName = (city as { name: string }).name
  const categoryName = (category as { name: string }).name
  const title = `${categoryName} — ${cityName}`
  const description = `${categoryName} à ${cityName} : les dernières actualités et dates à retenir.`

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
  }
}

export default async function CategoryPage(props: PageProps<'/[citySlug]/[categorySlug]'>) {
  const { citySlug, categorySlug } = await props.params
  const searchParams = await props.searchParams

  const search = normalizeSearchText(readParam(searchParams.q))
  const range = parseDateParam(searchParams.d)
  const horizon = parisHorizonISO()

  const supabase = await createClient()

  const [context, { data: categories }, { data: auth }] = await Promise.all([
    resolveFeedContext(supabase, citySlug, categorySlug),
    supabase.from('categories').select('*').order('display_order').order('name'),
    supabase.auth.getUser(),
  ])

  // Ville inconnue, ou catégorie inconnue : sans ce garde, une URL erronée rendait un
  // feed « toutes catégories » sous un titre vide.
  if (!context || context.categoryId === null) notFound()

  const user = auth?.user ?? null

  const [feed, isAdmin, favorites] = await Promise.all([
    queryArticles(supabase, {
      context,
      range: range ? { from: range.from.toISOString(), to: range.to.toISOString() } : null,
      horizon,
      search,
      offset: 0,
      limit: PAGE_SIZE,
    }),
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
    <ArticleFeed
      citySlug={citySlug}
      categorySlug={categorySlug}
      canManageContent={isAdmin}
      categories={categories ?? []}
      userId={user?.id ?? null}
      feedContext={context}
      horizon={horizon}
      initialArticles={feed.articles}
      initialHasMore={feed.hasMore}
      initialError={feed.error ? feed.error.message : null}
      initialFavorites={favorites}
      initialRange={serializeRangeBounds(range)}
      initialSearch={readParam(searchParams.q)}
    />
  )
}
