'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { ChevronDown, RefreshCw, Search, X } from 'lucide-react'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { ArticleCard } from './ArticleCard'
import { SkeletonCard } from './SkeletonCard'
import { DateFilter, type DateRange } from './DateFilter'
import { MiniCalendar } from './MiniCalendar'
import type { FeedArticle, Category as CategoryType } from '@/lib/types'
import { cn, groupByDay, formatDayHeader, normalizeSearchText } from '@/lib/utils'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 250
const EXTERNAL_LINK_SCROLL_KEY = 'ville-actu:external-link-scroll'
const EXTERNAL_LINK_SCROLL_TTL_MS = 30 * 60 * 1000

type ExternalLinkScrollSnapshot = {
  context: string
  y: number
  ts: number
  expectedCount?: number
  pendingExternalReturn?: boolean
}

function buildScrollContext(citySlug: string, categorySlug?: string, range?: DateRange | null, searchTerm = '') {
  const category = categorySlug ?? 'all'
  const from = range?.from ? range.from.toISOString() : 'none'
  const to = range?.to ? range.to.toISOString() : 'none'
  const search = searchTerm || 'none'
  return `${citySlug}|${category}|${from}|${to}|${search}`
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
    if (parsed.expectedCount != null && typeof parsed.expectedCount !== 'number') {
      window.sessionStorage.removeItem(EXTERNAL_LINK_SCROLL_KEY)
      return null
    }
    if (parsed.pendingExternalReturn != null && typeof parsed.pendingExternalReturn !== 'boolean') {
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

/** Identifiants résolus une fois au montage, réutilisés par toutes les requêtes du feed. */
interface FeedContext {
  cityId: number
  cityName: string
  categoryId: number | null
  excludeCategoryId: number | null
}

interface ArticleFeedProps {
  citySlug: string
  categorySlug?: string
  excludeCategorySlug?: string
  canManageContent?: boolean
  hideHeader?: boolean
  hideMiniCalendar?: boolean
  hideCategoryTabs?: boolean
}

export function ArticleFeed({ citySlug, categorySlug, excludeCategorySlug, canManageContent = false, hideHeader = false, hideMiniCalendar = false, hideCategoryTabs = false }: ArticleFeedProps) {
  const [articles, setArticles]     = useState<FeedArticle[]>([])
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
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFeedback, setRefreshFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [deletingArticleId, setDeletingArticleId] = useState<number | null>(null)
  const hasInitializedRef = useRef(false)
  // Ville et catégories résolues une seule fois au montage : ce sont des props,
  // elles ne changent pas en cours de session. Avant, chaque appel de fetchArticles
  // et de fetchActiveDates les re-résolvait par une requête dédiée — jusqu'à trois
  // requêtes `cities` pour un seul affichage.
  const contextRef = useRef<FeedContext | null>(null)
  // Miroir de `offset` : permet à fetchArticles de lire la pagination sans avoir
  // `offset` en dépendance de son useCallback (qui se recréait à chaque page).
  const offsetRef = useRef(0)
  // Jeton de séquence : une réponse qui arrive après un nouveau reset est ignorée,
  // sinon un filtre abandonné peut écraser l'affichage courant.
  const generationRef = useRef(0)
  // Frozen at mount so every page of the default feed shares the same lower bound.
  const horizonRef = useRef(startOfDay(new Date()).toISOString())
  const restoredContextRef = useRef<string | null>(null)
  const scrollContext = useMemo(
    () => buildScrollContext(citySlug, categorySlug, dateRange, searchQuery),
    [citySlug, categorySlug, dateRange, searchQuery]
  )

  const fetchArticles = useCallback(async (reset: boolean, range: DateRange | null = dateRange, resetTargetCount = PAGE_SIZE) => {
    const context = contextRef.current
    if (!context) return

    const supabase = createClient()
    const currentOffset = reset ? 0 : offsetRef.current
    const effectiveTargetCount = reset ? Math.max(PAGE_SIZE, resetTargetCount) : PAGE_SIZE
    const rangeEnd = reset
      ? currentOffset + effectiveTargetCount - 1
      : currentOffset + PAGE_SIZE - 1

    // Un reset ouvre une nouvelle génération ; une pagination reste dans la courante.
    const generation = reset ? ++generationRef.current : generationRef.current

    // Colonnes explicites plutôt que `*` : title_search et content_preview_search sont
    // des copies normalisées du titre et de la description (colonnes générées de la
    // migration 010), utiles au ilike côté serveur et jamais lues ici — les ramener
    // doublait presque le poids utile. La jointure `city` n'était pas lue non plus.
    let query = supabase
      .from('articles')
      .select('id, title, content_preview, url, image_url, published_at, event_end_date, source:sources(name), category:categories(id,name,slug,icon)')
      .eq('city_id', context.cityId)
      .eq('is_duplicate', false)

    if (context.categoryId !== null) {
      query = query.eq('category_id', context.categoryId)
    } else if (context.excludeCategoryId !== null) {
      query = query.neq('category_id', context.excludeCategoryId)
    }

    if (range) {
      query = query
        .gte('published_at', range.from.toISOString())
        .lte('published_at', range.to.toISOString())
    } else {
      // Default feed: today onwards, plus events still running and undated articles.
      const horizon = horizonRef.current
      query = query.or(
        `published_at.gte.${horizon},event_end_date.gte.${horizon},published_at.is.null`
      )
    }

    if (searchQuery) {
      const searchPattern = searchQuery.split(' ').filter(Boolean).join('%')
      query = query.or(`title_search.ilike.%${searchPattern}%,content_preview_search.ilike.%${searchPattern}%`)
    }

    const { data } = await query
      .order('published_at', { ascending: true, nullsFirst: false })
      .order('fetched_at', { ascending: false })
      .range(currentOffset, rangeEnd)

    // Réponse d'une génération abandonnée (filtre ou recherche changé entre-temps) :
    // l'appliquer ferait réapparaître des résultats obsolètes.
    if (generation !== generationRef.current) return

    // PostgREST type les jointures « vers-un » comme des tableaux ; `source` et
    // `category` sont bien des objets uniques ici (relations par clé étrangère).
    const results = (data ?? []) as unknown as FeedArticle[]
    const requestedSize = reset ? effectiveTargetCount : PAGE_SIZE
    setHasMore(results.length === requestedSize)
    if (reset) {
      setArticles(results)
    } else {
      setArticles(prev => [...prev, ...results])
    }
    offsetRef.current = currentOffset + results.length
    setOffset(offsetRef.current)
  }, [dateRange, searchQuery])

  const fetchActiveDates = useCallback(async (month: Date) => {
    const context = contextRef.current
    if (!context) return

    const supabase = createClient()
    let query = supabase
      .from('articles')
      .select('published_at')
      .eq('city_id', context.cityId)
      .eq('is_duplicate', false)
      .gte('published_at', startOfMonth(month).toISOString())
      .lte('published_at', endOfMonth(month).toISOString())
      .not('published_at', 'is', null)

    if (context.excludeCategoryId !== null) {
      query = query.neq('category_id', context.excludeCategoryId)
    }

    const { data } = await query

    const dates = [...new Set((data ?? []).map(a =>
      format(new Date(a.published_at!), 'yyyy-MM-dd')
    ))]
    setActiveDates(dates)
    // Aucune dépendance : les identifiants viennent de contextRef, résolu au montage.
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(normalizeSearchText(searchInput))
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const supabase = createClient()

    async function init() {
      hasInitializedRef.current = false
      const initialContext = buildScrollContext(citySlug, categorySlug, null, searchQuery)
      const snapshot = readExternalScrollSnapshot()
      const hasValidExternalReturn =
        Boolean(snapshot?.pendingExternalReturn) &&
        snapshot?.context === initialContext &&
        Date.now() - snapshot.ts <= EXTERNAL_LINK_SCROLL_TTL_MS

      const requestedInitialCount = hasValidExternalReturn
        ? Math.min(Math.max(PAGE_SIZE, snapshot?.expectedCount ?? PAGE_SIZE), 200)
        : PAGE_SIZE

      // Le slug de catégorie à résoudre : soit celui qu'on filtre, soit celui qu'on
      // exclut — jamais les deux, le rendu ne combine pas les deux modes.
      const categorySlugToResolve = categorySlug ?? excludeCategorySlug
      const noCategory = Promise.resolve({ data: null as { id: number } | null })

      // Vague 1 — rien ici ne dépend de rien d'autre : tout part ensemble.
      const [{ data: { user } }, { data: cats }, { data: city }, { data: cat }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('categories').select('*').order('display_order').order('name'),
        supabase.from('cities').select('id,name').eq('slug', citySlug).single(),
        categorySlugToResolve
          ? supabase.from('categories').select('id').eq('slug', categorySlugToResolve).single()
          : noCategory,
      ])

      setUserId(user?.id ?? null)
      setCategories(cats ?? [])

      if (!city) {
        setLoading(false)
        return
      }

      contextRef.current = {
        cityId: city.id,
        cityName: city.name,
        categoryId: categorySlug ? (cat?.id ?? null) : null,
        excludeCategoryId: !categorySlug && excludeCategorySlug ? (cat?.id ?? null) : null,
      }
      setCityName(city.name)

      // Vague 2 — dépend du contexte résolu ci-dessus, mais pas les unes des autres.
      // fetchActiveDates n'alimente que le mini-calendrier : quand il est masqué
      // (c'est le cas des deux onglets de CityHomePage, donc de la page d'accueil),
      // la requête ramenait tous les articles du mois pour rien.
      await Promise.all([
        fetchArticles(true, null, requestedInitialCount),
        hideMiniCalendar ? Promise.resolve() : fetchActiveDates(calendarMonth),
        user
          ? supabase.from('user_favorites').select('article_id').eq('user_id', user.id)
              .then(({ data: favs }) =>
                setFavorites(new Set((favs ?? []).map((f: { article_id: number }) => f.article_id)))
              )
          : Promise.resolve(),
      ])

      hasInitializedRef.current = true
      setLoading(false)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citySlug, categorySlug, excludeCategorySlug])

  useEffect(() => {
    if (!hasInitializedRef.current) return
    setOffset(0)
    setLoading(true)
    fetchArticles(true, dateRange).then(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  useEffect(() => {
    const persistLatestScrollPosition = () => {
      const snapshot = readExternalScrollSnapshot()
      if (!snapshot || snapshot.context !== scrollContext || !snapshot.pendingExternalReturn) return
      writeExternalScrollSnapshot({
        ...snapshot,
        y: window.scrollY,
        ts: Date.now(),
        expectedCount: Math.max(offset, articles.length),
      })
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
  }, [scrollContext, offset, articles.length])

  useEffect(() => {
    if (loading) return
    if (restoredContextRef.current === scrollContext) return

    const snapshot = readExternalScrollSnapshot()
    if (!snapshot) return
    if (snapshot.context !== scrollContext) return
    if (!snapshot.pendingExternalReturn) return
    if (Date.now() - snapshot.ts > EXTERNAL_LINK_SCROLL_TTL_MS) {
      clearExternalScrollSnapshot()
      return
    }
    if (articles.length < Math.max(PAGE_SIZE, snapshot.expectedCount ?? PAGE_SIZE)) return

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

  // Identité stable : ArticleCard est mémoïsé, une fonction recréée à chaque render
  // invaliderait la mémoïsation de toutes les cartes.
  const handleDeleteArticle = useCallback(async (articleId: number) => {
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
  }, [userId, canManageContent])

  const currentCategory = categories.find(c => c.slug === categorySlug)
  // Mémoïsé : reparser toutes les dates du tableau à chaque render était inutile,
  // et le coût grandit avec le nombre de pages chargées.
  const grouped = useMemo(() => (dateRange ? groupByDay(articles) : null), [dateRange, articles])

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
                ? `${currentCategory.icon || '📰'} ${currentCategory.name}`
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
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Rechercher dans le titre ou le contenu…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-10 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                aria-label="Rechercher des articles"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Effacer la recherche"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <DateFilter value={dateRange} onChange={handleDateChange} />
          </div>

          {/* Category filter tabs */}
          {!hideCategoryTabs && (
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
            {categories.filter((cat) => cat.slug !== excludeCategorySlug).map((cat) => (
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
                <span>{cat.icon || '📰'}</span>
                {cat.name}
              </Link>
            ))}
          </div>
          )}

          {/* Feed */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">📰</p>
              <p className="font-medium text-gray-600">
                {searchQuery ? 'Aucun article ne correspond à cette recherche' : 'Aucun article dans cette catégorie'}
              </p>
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
                        scrollRestoreCount={articles.length}
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
                {articles.map((article, index) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    // Les premières cartes sont l'image la plus grande de la vue initiale
                    // (le LCP) : les sortir du lazy-loading évite d'attendre un second
                    // aller-retour après le premier rendu.
                    priority={index < 4}
                    userId={userId}
                    isFavorited={favorites.has(article.id)}
                    canDelete={Boolean(userId && canManageContent)}
                    deleting={deletingArticleId === article.id}
                    onDelete={handleDeleteArticle}
                    scrollRestoreContext={scrollContext}
                    scrollRestoreCount={articles.length}
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
