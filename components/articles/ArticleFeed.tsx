'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { ChevronDown, RefreshCw } from 'lucide-react'
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
const EXTERNAL_LINK_SCROLL_KEY = 'ville-actu:external-link-scroll'
const EXTERNAL_LINK_SCROLL_TTL_MS = 30 * 60 * 1000

type ExternalLinkScrollSnapshot = {
  context: string
  y: number
  ts: number
}

function buildScrollContext(citySlug: string, categorySlug?: string, range?: DateRange | null) {
  const category = categorySlug ?? 'all'
  const from = range?.from ? range.from.toISOString() : 'none'
  const to = range?.to ? range.to.toISOString() : 'none'
  return `${citySlug}|${category}|${from}|${to}`
}

function readExternalScrollSnapshot(): ExternalLinkScrollSnapshot | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(EXTERNAL_LINK_SCROLL_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<ExternalLinkScrollSnapshot>
    if (
      typeof parsed.context !== 'string' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.ts !== 'number'
    ) {
      window.sessionStorage.removeItem(EXTERNAL_LINK_SCROLL_KEY)
      return null
    }
    return parsed as ExternalLinkScrollSnapshot
  } catch {
    window.sessionStorage.removeItem(EXTERNAL_LINK_SCROLL_KEY)
    return null
  }
}

function writeExternalScrollSnapshot(snapshot: ExternalLinkScrollSnapshot) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(EXTERNAL_LINK_SCROLL_KEY, JSON.stringify(snapshot))
}

function clearExternalScrollSnapshot() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(EXTERNAL_LINK_SCROLL_KEY)
}

/**
 * Sorts articles for the default (no date filter) view:
 * 1. Upcoming events (published_at >= now) → ascending (nearest first)
 * 2. Past articles (published_at < now or null) → descending (most recent first)
 */
function sortByProximity(items: ArticleType[]): ArticleType[] {
  const now = Date.now()
  const future = items
    .filter(a => a.published_at && new Date(a.published_at).getTime() >= now)
    .sort((a, b) => new Date(a.published_at!).getTime() - new Date(b.published_at!).getTime())
  const past = items
    .filter(a => !a.published_at || new Date(a.published_at).getTime() < now)
    .sort((a, b) => {
      const ta = a.published_at ? new Date(a.published_at).getTime() : new Date(a.fetched_at).getTime()
      const tb = b.published_at ? new Date(b.published_at).getTime() : new Date(b.fetched_at).getTime()
      return tb - ta
    })
  return [...future, ...past]
}

interface ArticleFeedProps {
  citySlug: string
  categorySlug?: string
  canManageContent?: boolean
  hideHeader?: boolean
  hideMiniCalendar?: boolean
}

export function ArticleFeed({ citySlug, categorySlug, canManageContent = false, hideHeader = false, hideMiniCalendar = false }: ArticleFeedProps) {
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
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFeedback, setRefreshFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [deletingArticleId, setDeletingArticleId] = useState<number | null>(null)
  const restoredContextRef = useRef<string | null>(null)
  const scrollContext = useMemo(
    () => buildScrollContext(citySlug, categorySlug, dateRange),
    [citySlug, categorySlug, dateRange]
  )

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
      setArticles(range ? results : sortByProximity(results))
    } else {
      setArticles(prev => {
        const next = range ? results : sortByProximity(results)
        return [...prev, ...next]
      })
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

  useEffect(() => {
    const persistLatestScrollPosition = () => {
      const snapshot = readExternalScrollSnapshot()
      if (!snapshot || snapshot.context !== scrollContext) return
      writeExternalScrollSnapshot({ ...snapshot, y: window.scrollY, ts: Date.now() })
    }

    const onPageHide = () => {
      persistLatestScrollPosition()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistLatestScrollPosition()
      }
    }

    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [scrollContext])

  useEffect(() => {
    if (loading) return
    if (restoredContextRef.current === scrollContext) return

    const snapshot = readExternalScrollSnapshot()
    if (!snapshot) return
    if (snapshot.context !== scrollContext) return
    if (Date.now() - snapshot.ts > EXTERNAL_LINK_SCROLL_TTL_MS) {
      clearExternalScrollSnapshot()
      return
    }

    restoredContextRef.current = scrollContext
    const targetY = Math.max(0, snapshot.y)
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'auto' })
      clearExternalScrollSnapshot()
    })
  }, [loading, articles.length, scrollContext])

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

  async function handleRefresh() {
    if (!canManageContent) return
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
        setOffset(0)
        setLoading(true)
        await fetchArticles(true, dateRange)
        setLoading(false)
      } else {
        setRefreshFeedback({ ok: false, msg: data.error ?? 'Erreur inconnue' })
      }
    } catch {
      setRefreshFeedback({ ok: false, msg: 'Erreur réseau' })
    }
    setRefreshing(false)
    setTimeout(() => setRefreshFeedback(null), 5000)
  }

  async function handleDeleteArticle(articleId: number) {
    if (!userId || !canManageContent) {
      setRefreshFeedback({ ok: false, msg: 'Vous devez être connecté.' })
      return
    }

    setDeletingArticleId(articleId)
    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'articles', id: articleId }),
      })
      const data = await res.json()
      if (res.status === 401) {
        setRefreshFeedback({ ok: false, msg: 'Vous devez être connecté.' })
      } else if (data.ok) {
        setArticles(prev => prev.filter(article => article.id !== articleId))
        setFavorites(prev => {
          const next = new Set(prev)
          next.delete(articleId)
          return next
        })
        setRefreshFeedback({ ok: true, msg: 'Actu supprimée.' })
      } else {
        setRefreshFeedback({ ok: false, msg: data.error ?? 'Erreur inconnue' })
      }
    } catch {
      setRefreshFeedback({ ok: false, msg: 'Erreur réseau' })
    } finally {
      setDeletingArticleId(null)
      setTimeout(() => setRefreshFeedback(null), 5000)
    }
  }

  const currentCategory = categories.find(c => c.slug === categorySlug)
  const grouped = dateRange ? groupByDay(articles) : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      {!hideHeader && (
        <div className="mb-6">
          {currentCategory && (
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400 mb-2">
              <Link href="/" className="hover:text-brand-600 transition-colors">Accueil</Link>
              <span>/</span>
              <Link href={`/${citySlug}`} className="hover:text-brand-600 transition-colors">{cityName || citySlug}</Link>
              <span>/</span>
              <span className="text-gray-700">{currentCategory.name}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900">
              {currentCategory
                ? `${CATEGORY_ICONS[currentCategory.slug] ?? '📰'} ${currentCategory.name}`
                : cityName || citySlug}
            </h1>
            {userId && canManageContent && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Rafraîchir les sources"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-600 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                <span className="hidden sm:inline">{refreshing ? 'Rafraîchissement…' : 'Rafraîchir'}</span>
              </button>
            )}
          </div>
          {refreshFeedback && (
            <p className={cn('mt-2 text-sm', refreshFeedback.ok ? 'text-brand-700' : 'text-red-600')}>
              {refreshFeedback.ok ? '✅' : '❌'} {refreshFeedback.msg}
            </p>
          )}
        </div>
      )}
      {hideHeader && refreshFeedback && (
        <p className={cn('mb-4 text-sm', refreshFeedback.ok ? 'text-brand-700' : 'text-red-600')}>
          {refreshFeedback.ok ? '✅' : '❌'} {refreshFeedback.msg}
        </p>
      )}

      {/* Main layout: calendar (desktop) + content */}
      <div className="flex gap-6 items-start">
        {/* Mini calendar — desktop only */}
        {!hideMiniCalendar && (
          <MiniCalendar
            selected={dateRange ? dateRange.from : null}
            onChange={handleCalendarSelect}
            activeDates={activeDates}
            onMonthChange={handleMonthChange}
          />
        )}

        {/* Right: filters + feed */}
        <div className="flex-1 min-w-0">
          {/* Date filter pills */}
          <div className="mb-4">
            <DateFilter value={dateRange} onChange={handleDateChange} />
          </div>

          {/* Category filter tabs */}
          <div className="flex flex-nowrap overflow-x-auto scrollbar-hide gap-2 mb-6 sm:flex-wrap">
            <Link
              href={`/${citySlug}`}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-sm border transition-colors',
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
                  'shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition-colors',
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
                        canDelete={Boolean(userId && canManageContent)}
                        deleting={deletingArticleId === article.id}
                        onDelete={handleDeleteArticle}
                        scrollRestoreContext={scrollContext}
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
                    canDelete={Boolean(userId && canManageContent)}
                    deleting={deletingArticleId === article.id}
                    onDelete={handleDeleteArticle}
                    scrollRestoreContext={scrollContext}
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
