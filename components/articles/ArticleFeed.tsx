'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ArticleCard } from './ArticleCard'
import { SkeletonCard } from './SkeletonCard'
import { CATEGORY_ICONS } from '@/lib/types'
import type { Article as ArticleType, Category as CategoryType } from '@/lib/types'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

interface ArticleFeedProps {
  citySlug: string
  categorySlug?: string
}

export function ArticleFeed({ citySlug, categorySlug }: ArticleFeedProps) {
  const [articles, setArticles]     = useState<ArticleType[]>([])
  const [categories, setCategories] = useState<CategoryType[]>([])
  const [cityName, setCityName]     = useState<string>('')
  const [userId, setUserId]         = useState<string | null>(null)
  const [favorites, setFavorites]   = useState<Set<number>>(new Set())
  const [loading, setLoading]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore]       = useState(false)
  const [offset, setOffset]         = useState(0)

  const fetchArticles = useCallback(async (reset: boolean) => {
    const supabase = createClient()
    const currentOffset = reset ? 0 : offset

    const { data: city } = await supabase
      .from('cities').select('id,name').eq('slug', citySlug).single()
    if (!city) return

    setCityName(city.name)

    let query = supabase
      .from('articles')
      .select('*, source:sources(name), category:categories(id,name,slug), city:cities(id,name,slug)')
      .eq('city_id', city.id)
      .eq('is_duplicate', false)

    if (categorySlug) {
      const { data: cat } = await supabase
        .from('categories').select('id').eq('slug', categorySlug).single()
      if (cat) query = query.eq('category_id', cat.id)
    }

    const { data } = await query
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('fetched_at', { ascending: false })
      .range(currentOffset, currentOffset + PAGE_SIZE - 1)

    const results = data ?? []
    setHasMore(results.length === PAGE_SIZE)
    if (reset) {
      setArticles(results)
    } else {
      setArticles(prev => [...prev, ...results])
    }
    setOffset(currentOffset + results.length)
  }, [citySlug, categorySlug, offset])

  useEffect(() => {
    const supabase = createClient()

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data: cats } = await supabase.from('categories').select('*').order('name')
      setCategories(cats ?? [])

      await fetchArticles(true)

      if (user) {
        const { data: favs } = await supabase
          .from('user_favorites').select('article_id').eq('user_id', user.id)
        setFavorites(new Set((favs ?? []).map((f: { article_id: number }) => f.article_id)))
      }

      setLoading(false)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citySlug, categorySlug])

  async function loadMore() {
    setLoadingMore(true)
    await fetchArticles(false)
    setLoadingMore(false)
  }

  const currentCategory = categories.find(c => c.slug === categorySlug)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/" className="hover:text-brand-600 transition-colors">Accueil</Link>
          <span>/</span>
          <Link href={`/${citySlug}`} className="hover:text-brand-600 transition-colors">{cityName || citySlug}</Link>
          {currentCategory && (
            <>
              <span>/</span>
              <span className="text-gray-700">{currentCategory.name}</span>
            </>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {currentCategory
            ? `${CATEGORY_ICONS[currentCategory.slug] ?? '📰'} ${currentCategory.name}`
            : cityName || citySlug}
        </h1>
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href={`/${citySlug}`}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm border transition-colors',
            !categorySlug
              ? 'bg-brand-600 text-white border-brand-600'
              : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50'
          )}
        >
          Tout
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/${citySlug}/${cat.slug}`}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition-colors',
              categorySlug === cat.slug
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50'
            )}
          >
            <span>{CATEGORY_ICONS[cat.slug] ?? '📰'}</span>
            {cat.name}
          </Link>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">📰</p>
          <p className="font-medium text-gray-600">Aucun article dans cette catégorie</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                userId={userId}
                isFavorited={favorites.has(article.id)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-8 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Chargement…' : 'Voir plus'}
                {!loadingMore && <ChevronDown className="size-4" />}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
