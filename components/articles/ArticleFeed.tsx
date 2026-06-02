'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { ArticleCard } from './ArticleCard'
import { SkeletonCard } from './SkeletonCard'
import { DateFilter, type DateRange } from './DateFilter'
import { MiniCalendar } from './MiniCalendar'
import { CATEGORY_ICONS } from '@/lib/types'
import type { Article as ArticleType, Category as CategoryType } from '@/lib/types'
import { cn, groupByDay, formatDayHeader } from '@/lib/utils'

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
  const [dateRange, setDateRange]   = useState<DateRange | null>(null)
  const [activeDates, setActiveDates] = useState<string[]>([])
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  const fetchArticles = useCallback(async (reset: boolean, range: DateRange | null = dateRange) => {
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

    if (range) {
      query = query
        .gte('published_at', range.from.toISOString())
        .lte('published_at', range.to.toISOString())
    }

    const { data } = await query
      .order('published_at', { ascending: range ? true : false, nullsFirst: false })
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
  }, [citySlug, categorySlug, offset, dateRange])

  const fetchActiveDates = useCallback(async (month: Date) => {
    const supabase = createClient()
    const { data: city } = await supabase
      .from('cities').select('id').eq('slug', citySlug).single()
    if (!city) return

    const { data } = await supabase
      .from('articles')
      .select('published_at')
      .eq('city_id', city.id)
      .eq('is_duplicate', false)
      .gte('published_at', startOfMonth(month).toISOString())
      .lte('published_at', endOfMonth(month).toISOString())
      .not('published_at', 'is', null)

    const dates = [...new Set((data ?? []).map(a =>
      format(new Date(a.published_at!), 'yyyy-MM-dd')
    ))]
    setActiveDates(dates)
  }, [citySlug])

  useEffect(() => {
    const supabase = createClient()

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data: cats } = await supabase.from('categories').select('*').order('name')
      setCategories(cats ?? [])

      await fetchArticles(true, null)
      await fetchActiveDates(calendarMonth)

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

  function handleDateChange(range: DateRange | null) {
    setDateRange(range)
    setOffset(0)
    setLoading(true)
    fetchArticles(true, range).then(() => setLoading(false))
  }

  function handleCalendarSelect(date: Date) {
    const range: DateRange = {
      from: startOfDay(date),
      to: endOfDay(date),
      label: format(date, 'dd/MM/yyyy'),
    }
    handleDateChange(range)
  }

  function handleMonthChange(month: Date) {
    setCalendarMonth(month)
    fetchActiveDates(month)
  }

  const currentCategory = categories.find(c => c.slug === categorySlug)
  const grouped = dateRange ? groupByDay(articles) : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400 mb-2">
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

      {/* Main layout: calendar (desktop) + content */}
      <div className="flex gap-6 items-start">
        {/* Mini calendar — desktop only */}
        <MiniCalendar
          selected={dateRange ? dateRange.from : null}
          onChange={handleCalendarSelect}
          activeDates={activeDates}
          onMonthChange={handleMonthChange}
        />

        {/* Right: filters + feed */}
        <div className="flex-1 min-w-0">
          {/* Date filter pills */}
          <div className="mb-4">
            <DateFilter value={dateRange} onChange={handleDateChange} />
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
          ) : grouped ? (
            // Chronological grouped view
            <>
              {[...grouped.entries()].map(([dayKey, dayArticles]) => (
                <div key={dayKey} className="mb-8">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 capitalize">
                    {formatDayHeader(dayKey)}
                  </h2>
                  {/* Mobile: list, Desktop: grid */}
                  <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
                    {dayArticles.map((article) => (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        userId={userId}
                        isFavorited={favorites.has(article.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
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
          ) : (
            // Default grid view (no date filter)
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
      </div>
    </div>
  )
}

