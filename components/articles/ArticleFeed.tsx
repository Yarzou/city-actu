'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, RefreshCw, Search, TriangleAlert, X } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { ArticleCard } from './ArticleCard'
import { SkeletonCard } from './SkeletonCard'
import { DateFilter } from './DateFilter'
import { useIsDesktop } from '@/lib/hooks/use-media-query'
import { queryArticles, resolveFeedContext, type FeedContext } from '@/lib/feed/query'
import { parisHorizonISO, buildCivilFromDate } from '@/lib/feed/paris-time'
import {
  deserializeRangeBounds,
  parseDateParam,
  serializeDateRange,
  buildSingleDayRange,
  type DateRange,
  type SerializedDateRange,
} from '@/lib/feed/date-params'
import {
  parseCategoryParam,
  serializeCategoryParam,
  toggleCategory,
} from '@/lib/feed/category-params'
import type { FeedArticle, Category as CategoryType } from '@/lib/types'
import { cn, groupByDay, formatDayHeader, normalizeSearchText } from '@/lib/utils'

// Chargé à la demande : le mini-calendrier est une commande desktop, il tire la
// locale française de date-fns et une grille de 42 jours. Il était auparavant monté
// sur mobile puis masqué en CSS (`hidden sm:block`).
const MiniCalendar = dynamic(() => import('./MiniCalendar').then((m) => m.MiniCalendar), {
  ssr: false,
})

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 250
const EXTERNAL_LINK_SCROLL_KEY = 'ville-actu:external-link-scroll'
const EXTERNAL_LINK_SCROLL_TTL_MS = 30 * 60 * 1000
/**
 * Nombre de pages chargées automatiquement au scroll avant de repasser à un bouton
 * explicite. Sans cette limite, le pied de page et la barre de navigation basse
 * deviennent inatteignables sur un feed fourni.
 */
const AUTO_LOAD_LIMIT = 3

type ExternalLinkScrollSnapshot = {
  context: string
  y: number
  ts: number
  expectedCount?: number
  pendingExternalReturn?: boolean
}

function buildScrollContext(
  citySlug: string,
  categorySlugs: string[],
  range?: DateRange | null,
  searchTerm = ''
) {
  // Les slugs arrivent déjà triés (voir serializeCategoryParam) : sans ça,
  // « sports,agenda » et « agenda,sports » produiraient deux clés pour le même feed.
  const category = categorySlugs.length > 0 ? categorySlugs.join(',') : 'all'
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

const GRID_CLASSES = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
const LIST_CLASSES =
  'flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4'

interface ArticleFeedProps {
  citySlug: string
  categorySlug?: string
  excludeCategorySlug?: string
  canManageContent?: boolean
  hideHeader?: boolean
  hideMiniCalendar?: boolean
  hideCategoryTabs?: boolean

  /**
   * Données du premier rendu, produites par le composant serveur de la page.
   * Quand `initialArticles` est fourni, le feed ne lance aucune requête au montage :
   * le contenu est déjà dans le HTML. Absent (changement d'onglet côté client), on
   * retombe sur l'ancien chemin : résolution du contexte puis chargement.
   */
  categories?: CategoryType[]
  userId?: string | null
  feedContext?: FeedContext
  horizon?: string
  initialArticles?: FeedArticle[] | null
  initialHasMore?: boolean
  initialError?: string | null
  initialFavorites?: number[]
  initialRange?: SerializedDateRange | null
  initialSearch?: string
  /** Slugs sélectionnés au premier rendu. Absent : lus depuis `?cat=`. */
  initialCategories?: string[]
}

export function ArticleFeed({
  citySlug,
  categorySlug,
  excludeCategorySlug,
  canManageContent = false,
  hideHeader = false,
  hideMiniCalendar = false,
  hideCategoryTabs = false,
  categories: categoryList,
  userId: initialUserId = null,
  feedContext,
  horizon,
  initialArticles = null,
  initialHasMore = false,
  initialError = null,
  initialFavorites,
  initialRange = null,
  initialSearch = '',
  initialCategories,
}: ArticleFeedProps) {
  const isHydrated = initialArticles !== null && Boolean(feedContext)

  // Lu tôt : la sélection de catégories s'initialise depuis l'URL quand le serveur ne
  // l'a pas fournie (cas d'un changement d'onglet côté client).
  const searchParams = useSearchParams()

  const [articles, setArticles] = useState<FeedArticle[]>(initialArticles ?? [])
  const [categories, setCategories] = useState<CategoryType[]>(categoryList ?? [])
  const [cityName, setCityName] = useState<string>(feedContext?.cityName ?? '')
  const [userId, setUserId] = useState<string | null>(initialUserId)
  const [favorites, setFavorites] = useState<Set<number>>(new Set(initialFavorites ?? []))
  // `loading` = premier remplissage, écran encore vide → squelettes.
  const [loading, setLoading] = useState(!isHydrated)
  // `refetching` = la liste est déjà affichée et un filtre change → on l'atténue
  // sans la vider. C'est ce qui évite de perdre sa place à chaque frappe.
  const [refetching, setRefetching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [error, setError] = useState<string | null>(initialError)
  const [offset, setOffset] = useState(initialArticles?.length ?? 0)
  const [dateRange, setDateRange] = useState<DateRange | null>(() =>
    deserializeRangeBounds(initialRange)
  )
  const [activeDates, setActiveDates] = useState<string[]>([])
  const [calendarMonth, setCalendarMonth] = useState(() => deserializeRangeBounds(initialRange)?.from ?? new Date())
  const [searchInput, setSearchInput] = useState(initialSearch)
  const [searchQuery, setSearchQuery] = useState(() => normalizeSearchText(initialSearch))
  // Sélection cumulative de catégories. Les guinguettes ont leur propre onglet avec
  // une catégorie fixe : dans ce mode, `hideCategoryTabs` est posé et la sélection
  // reste vide.
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    () => initialCategories ?? parseCategoryParam(searchParams.get('cat') ?? undefined, categoryList ?? [])
  )
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFeedback, setRefreshFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [deletingArticleId, setDeletingArticleId] = useState<number | null>(null)

  const hasInitializedRef = useRef(isHydrated)
  const contextRef = useRef<FeedContext | null>(feedContext ?? null)
  // Miroir de `offset` : permet aux requêtes de lire la pagination sans avoir
  // `offset` en dépendance de leur useCallback (qui se recréait à chaque page).
  const offsetRef = useRef(initialArticles?.length ?? 0)
  // Jeton de séquence : une réponse qui arrive après un nouveau reset est ignorée,
  // sinon un filtre abandonné peut écraser l'affichage courant.
  const generationRef = useRef(0)
  // Gelée pour que toutes les pages d'un même feed partagent la même borne basse.
  // Vient du serveur quand il existe, pour que les deux côtés cadrent identiquement.
  const horizonRef = useRef(horizon ?? parisHorizonISO())
  const restoredContextRef = useRef<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  // Nombre de pages déjà chargées automatiquement. En état et non en ref : la valeur
  // décide de l'affichage du bouton, donc elle est lue pendant le rendu.
  const [autoLoads, setAutoLoads] = useState(0)

  const isDesktop = useIsDesktop()
  const showMiniCalendar = !hideMiniCalendar && isDesktop

  const scrollContext = useMemo(
    () => buildScrollContext(citySlug, categorySlug ? [categorySlug] : selectedCategories, dateRange, searchQuery),
    [citySlug, categorySlug, selectedCategories, dateRange, searchQuery]
  )

  // ─── Synchronisation avec l'URL ───────────────────────────────────────────────
  // Les filtres vivaient en state local : ni lien partageable, ni bouton retour, et
  // tout était perdu au rafraîchissement. On écrit désormais `?d=`, `?q=` et `?cat=`
  // avec l'API History native, qui s'intègre au routeur Next sans aller-retour serveur.
  const urlDate = searchParams.get('d') ?? ''
  const urlSearch = searchParams.get('q') ?? ''
  const urlCategories = searchParams.get('cat') ?? ''
  // Dernier état que *nous* avons appliqué. Une divergence signifie que l'URL a
  // bougé sans nous — c'est-à-dire un retour ou une avance dans l'historique.
  const appliedUrlRef = useRef({
    d: serializeDateRange(deserializeRangeBounds(initialRange)) ?? '',
    q: initialSearch,
    cat: serializeCategoryParam(initialCategories ?? parseCategoryParam(urlCategories, categoryList ?? [])) ?? '',
  })
  // Dernière valeur de recherche déjà répercutée en requête. Distincte de l'état :
  // le débounce fait passer `searchQuery` par la même valeur au montage, et sans ce
  // repère le feed relançait une requête identique juste après le rendu serveur.
  const searchSyncedRef = useRef(normalizeSearchText(initialSearch))

  const writeUrl = useCallback(
    (next: { d: string; q: string; cat: string }, mode: 'push' | 'replace') => {
      if (typeof window === 'undefined') return
      appliedUrlRef.current = next

      const params = new URLSearchParams(window.location.search)
      for (const [key, value] of [['d', next.d], ['q', next.q], ['cat', next.cat]] as const) {
        if (value) params.set(key, value)
        else params.delete(key)
      }

      const query = params.toString()
      const url = `${window.location.pathname}${query ? `?${query}` : ''}`
      if (mode === 'push') window.history.pushState(null, '', url)
      else window.history.replaceState(null, '', url)
    },
    []
  )

  /**
   * Slugs → identifiants, sans requête : la liste complète des catégories (avec leurs
   * `id`) est déjà en mémoire. C'est ce qui permet à un clic de pastille de filtrer
   * sur place, là où l'ancienne pastille-lien déclenchait une navigation de route.
   *
   * Passe par une ref pour que `runQuery` reste stable : en dépendance directe, il
   * serait recréé à l'arrivée des catégories et relancerait l'observateur de scroll.
   */
  const categoriesRef = useRef<CategoryType[]>(categoryList ?? [])
  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  const resolveCategoryIds = useCallback((slugs: string[]) => {
    const bySlug = new Map(categoriesRef.current.map((c) => [c.slug, c.id]))
    return slugs
      .map((slug) => bySlug.get(slug))
      .filter((id): id is number => typeof id === 'number')
  }, [])

  const runQuery = useCallback(
    async (opts: {
      reset: boolean
      range: DateRange | null
      search: string
      categorySlugs: string[]
      targetCount?: number
    }) => {
      const context = contextRef.current
      if (!context) return

      const { reset, range, search, categorySlugs, targetCount = PAGE_SIZE } = opts
      const supabase = createClient()
      const currentOffset = reset ? 0 : offsetRef.current
      const limit = reset ? Math.max(PAGE_SIZE, targetCount) : PAGE_SIZE

      // Un reset ouvre une nouvelle génération ; une pagination reste dans la courante.
      const generation = reset ? ++generationRef.current : generationRef.current

      // Mode « catégorie unique fixe » (onglet Guinguettes) : le contexte du serveur
      // fait foi, la sélection de pastilles n'existe pas dans ce mode.
      let effectiveContext = context
      if (!categorySlug) {
        const ids = resolveCategoryIds(categorySlugs)
        effectiveContext = {
          ...context,
          categoryIds: ids,
          // Une sélection explicite rend l'exclusion des guinguettes sans objet :
          // elles ne figurent pas dans les pastilles, donc pas dans la sélection.
          excludeCategoryId: ids.length > 0 ? null : context.excludeCategoryId,
        }
      }

      const result = await queryArticles(supabase, {
        context: effectiveContext,
        range: range ? { from: range.from.toISOString(), to: range.to.toISOString() } : null,
        horizon: horizonRef.current,
        search,
        offset: currentOffset,
        limit,
      })

      // Réponse d'une génération abandonnée (filtre ou recherche changé entre-temps) :
      // l'appliquer ferait réapparaître des résultats obsolètes.
      if (generation !== generationRef.current) return

      if (result.error) {
        // Le `error` de PostgREST était jusqu'ici jeté : une panne réseau s'affichait
        // en « Aucun article dans cette catégorie », faux vide indiscernable d'un vrai.
        setError(result.error.message)
        if (reset) setHasMore(false)
        return
      }

      setError(null)
      setHasMore(result.hasMore)
      if (reset) {
        setArticles(result.articles)
        setAutoLoads(0)
      } else {
        setArticles((prev) => [...prev, ...result.articles])
      }
      offsetRef.current = currentOffset + result.articles.length
      setOffset(offsetRef.current)
    },
    [categorySlug, resolveCategoryIds]
  )

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
    if (!data) return

    setActiveDates([
      ...new Set(data.map((a) => format(new Date(a.published_at!), 'yyyy-MM-dd'))),
    ])
    // Aucune dépendance : les identifiants viennent de contextRef.
  }, [])

  /**
   * Point d'entrée unique des filtres : état local, URL et requête bougent ensemble.
   *
   * Les faire bouger séparément est ce qui rendait `resetFilters` faux — il posait
   * `searchInput` à vide puis appelait le gestionnaire de date, qui réécrivait
   * l'URL avec l'ancienne valeur de recherche capturée dans sa closure.
   */
  const applyFilters = useCallback(
    (
      range: DateRange | null,
      searchText: string,
      categorySlugs: string[],
      mode: 'push' | 'replace'
    ) => {
      const normalized = normalizeSearchText(searchText)
      const canonicalCategories = [...new Set(categorySlugs)].sort()

      setDateRange(range)
      setSearchInput(searchText)
      setSearchQuery(normalized)
      setSelectedCategories(canonicalCategories)
      searchSyncedRef.current = normalized
      setOffset(0)
      writeUrl(
        {
          d: serializeDateRange(range) ?? '',
          q: searchText,
          cat: serializeCategoryParam(canonicalCategories) ?? '',
        },
        mode
      )

      setRefetching(true)
      void runQuery({ reset: true, range, search: normalized, categorySlugs: canonicalCategories })
        .finally(() => setRefetching(false))
    },
    [runQuery, writeUrl]
  )

  // Débounce de la recherche.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(normalizeSearchText(searchInput))
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [searchInput])

  // ─── Montage ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()

    async function init() {
      const snapshot = readExternalScrollSnapshot()
      const initialContext = buildScrollContext(citySlug, categorySlug ? [categorySlug] : selectedCategories, dateRange, searchQuery)
      const hasValidExternalReturn =
        Boolean(snapshot?.pendingExternalReturn) &&
        snapshot?.context === initialContext &&
        Date.now() - snapshot.ts <= EXTERNAL_LINK_SCROLL_TTL_MS

      // Le retour d'un lien externe a besoin de re-matérialiser toute la liste
      // parcourue avant de sauter à la position mémorisée. Seul cas où le rendu
      // serveur ne suffit pas : il n'a produit que la première page.
      const requestedCount = hasValidExternalReturn
        ? Math.min(Math.max(PAGE_SIZE, snapshot?.expectedCount ?? PAGE_SIZE), 200)
        : PAGE_SIZE

      if (isHydrated) {
        hasInitializedRef.current = true
        if (hasValidExternalReturn && requestedCount > (initialArticles?.length ?? 0)) {
          setRefetching(true)
          await runQuery({ reset: true, range: dateRange, search: searchQuery, categorySlugs: selectedCategories, targetCount: requestedCount })
          setRefetching(false)
        }
        if (showMiniCalendar) void fetchActiveDates(calendarMonth)
        return
      }

      // Chemin non hydraté : changement d'onglet côté client, la page serveur n'a
      // pas préparé ce feed.
      hasInitializedRef.current = false
      const [context, { data: cats }, { data: auth }] = await Promise.all([
        resolveFeedContext(supabase, citySlug, categorySlug ? [categorySlug] : selectedCategories, excludeCategorySlug),
        categoryList
          ? Promise.resolve({ data: categoryList })
          : supabase.from('categories').select('*').order('display_order').order('name'),
        initialUserId !== null ? Promise.resolve({ data: { user: null } }) : supabase.auth.getUser(),
      ])

      setCategories(cats ?? [])
      const resolvedUserId = initialUserId ?? auth?.user?.id ?? null
      setUserId(resolvedUserId)

      if (!context) {
        setLoading(false)
        return
      }

      contextRef.current = context
      setCityName(context.cityName)

      await Promise.all([
        runQuery({ reset: true, range: dateRange, search: searchQuery, categorySlugs: selectedCategories, targetCount: requestedCount }),
        showMiniCalendar ? fetchActiveDates(calendarMonth) : Promise.resolve(),
        resolvedUserId && !initialFavorites
          ? supabase
              .from('user_favorites')
              .select('article_id')
              .eq('user_id', resolvedUserId)
              .then(({ data: favs }) =>
                setFavorites(new Set((favs ?? []).map((f: { article_id: number }) => f.article_id)))
              )
          : Promise.resolve(),
      ])

      hasInitializedRef.current = true
      setLoading(false)
    }

    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citySlug, categorySlug, excludeCategorySlug])

  // Le mini-calendrier n'apparaît qu'après hydratation sur desktop : ses dates
  // actives ne peuvent donc pas être chargées au montage.
  useEffect(() => {
    if (!showMiniCalendar) return
    if (!hasInitializedRef.current) return
    if (activeDates.length > 0) return
    void fetchActiveDates(calendarMonth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMiniCalendar])

  // Recherche débouncée → requête + URL. En `replace` : un `push` par frappe
  // remplirait l'historique d'états intermédiaires que personne ne veut revisiter.
  useEffect(() => {
    if (!hasInitializedRef.current) return
    if (searchQuery === searchSyncedRef.current) return
    applyFilters(dateRange, searchInput, selectedCategories, 'replace')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // Retour / avance dans l'historique : l'URL a changé sans passer par nos
  // gestionnaires, il faut adopter son état.
  useEffect(() => {
    if (!hasInitializedRef.current) return
    if (
      urlDate === appliedUrlRef.current.d &&
      urlSearch === appliedUrlRef.current.q &&
      urlCategories === appliedUrlRef.current.cat
    ) return

    // `replace` : l'entrée d'historique visée existe déjà, on ne fait que la rejouer.
    applyFilters(
      parseDateParam(urlDate || undefined),
      urlSearch,
      parseCategoryParam(urlCategories, categoriesRef.current),
      'replace'
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDate, urlSearch, urlCategories])

  // ─── Restauration de scroll au retour d'un lien externe ───────────────────────
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

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistLatestScrollPosition()
    }

    window.addEventListener('pagehide', persistLatestScrollPosition)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', persistLatestScrollPosition)
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

  // ─── Pagination ───────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    await runQuery({ reset: false, range: dateRange, search: searchQuery, categorySlugs: selectedCategories })
    setLoadingMore(false)
  }, [loadingMore, hasMore, runQuery, dateRange, searchQuery, selectedCategories])

  // Scroll infini, plafonné : au-delà de AUTO_LOAD_LIMIT pages, l'utilisateur
  // reprend la main avec le bouton — sinon le pied de page devient inatteignable.
  const autoLoadExhausted = autoLoads >= AUTO_LOAD_LIMIT

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    if (!hasMore || loading || refetching) return
    if (autoLoadExhausted) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setAutoLoads((n) => n + 1)
        void loadMore()
      },
      // Marge généreuse : sur mobile la carte fait toute la largeur, la fin de liste
      // arrive vite et une pré-charge tardive se voit comme un à-coup.
      { rootMargin: '600px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, refetching, loadMore, autoLoadExhausted, articles.length])

  // ─── Filtres ──────────────────────────────────────────────────────────────────
  // Un changement de date est une intention explicite : `push`, pour que le retour
  // arrière défasse le filtre au lieu de quitter la page.
  const applyDateRange = useCallback(
    (range: DateRange | null) => applyFilters(range, searchInput, selectedCategories, 'push'),
    [applyFilters, searchInput, selectedCategories]
  )

  function handleCalendarSelect(date: Date) {
    applyDateRange(buildSingleDayRange(buildCivilFromDate(date)))
  }

  function handleMonthChange(month: Date) {
    setCalendarMonth(month)
    void fetchActiveDates(month)
  }

  function resetFilters() {
    applyFilters(null, '', [], 'push')
  }

  // Cumulatif : chaque appui ajoute ou retire la catégorie de la sélection, sans
  // navigation de route — la liste reste affichée, simplement atténuée.
  function toggleCategoryFilter(slug: string) {
    applyFilters(dateRange, searchInput, toggleCategory(selectedCategories, slug), 'push')
  }

  function clearCategoryFilter() {
    applyFilters(dateRange, searchInput, [], 'push')
  }

  function retry() {
    setError(null)
    setRefetching(true)
    void runQuery({ reset: true, range: dateRange, search: searchQuery, categorySlugs: selectedCategories }).finally(() =>
      setRefetching(false)
    )
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
        setRefetching(true)
        await runQuery({ reset: true, range: dateRange, search: searchQuery, categorySlugs: selectedCategories })
        setRefetching(false)
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
        // « Masquée » et non « supprimée » : la ligne reste en base avec is_duplicate=true,
        // sinon le prochain cron la recréerait tant que l'URL est dans le flux source.
        setRefreshFeedback({ ok: true, msg: 'Actu masquée.' })
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

  // Mémoïsé : reparser toutes les dates du tableau à chaque render était inutile,
  // et le coût grandit avec le nombre de pages chargées.
  const grouped = useMemo(() => (dateRange ? groupByDay(articles) : null), [dateRange, articles])
  const hasActiveFilters =
    Boolean(dateRange) || Boolean(searchQuery) || selectedCategories.length > 0
  const selectedCategorySet = useMemo(() => new Set(selectedCategories), [selectedCategories])

  function renderCard(article: FeedArticle, absoluteIndex: number) {
    return (
      <ArticleCard
        key={article.id}
        article={article}
        // Une seule carte est au-dessus de la ligne de flottaison sur mobile (une
        // colonne) : sortir les quatre premières du lazy-loading, comme avant, faisait
        // concurrence au LCP au lieu de le servir.
        priority={absoluteIndex === 0}
        userId={userId}
        isFavorited={favorites.has(article.id)}
        canDelete={Boolean(userId && canManageContent)}
        deleting={deletingArticleId === article.id}
        onDelete={handleDeleteArticle}
        scrollRestoreContext={scrollContext}
        scrollRestoreCount={articles.length}
      />
    )
  }

  const paginationFooter = hasMore ? (
    <div ref={sentinelRef} className="mt-8 text-center">
      {(autoLoadExhausted || loadingMore) && (
        <button
          type="button"
          onClick={() => { setAutoLoads(0); void loadMore() }}
          disabled={loadingMore}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 focus-ring sm:w-auto"
        >
          {loadingMore ? 'Chargement…' : 'Voir plus'}
          {!loadingMore && <ChevronDown className="size-4" />}
        </button>
      )}
    </div>
  ) : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      {!hideHeader && (
        <div className="mb-6">
          {/*
            Plus de fil d'Ariane ni de titre de catégorie : une catégorie n'est plus un
            segment de route, le feed n'a donc jamais « une » catégorie courante — il a
            une sélection, éventuellement multiple, affichée par les pastilles.
          */}
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900">{cityName || citySlug}</h1>
            {userId && canManageContent && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Rafraîchir les sources"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 focus-ring"
              >
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                <span className="hidden sm:inline">{refreshing ? 'Rafraîchissement…' : 'Rafraîchir'}</span>
              </button>
            )}
          </div>
          {refreshFeedback && (
            <p role="status" className={cn('mt-2 text-sm', refreshFeedback.ok ? 'text-brand-700' : 'text-red-600')}>
              {refreshFeedback.ok ? '✅' : '❌'} {refreshFeedback.msg}
            </p>
          )}
        </div>
      )}
      {hideHeader && refreshFeedback && (
        <p role="status" className={cn('mb-4 text-sm', refreshFeedback.ok ? 'text-brand-700' : 'text-red-600')}>
          {refreshFeedback.ok ? '✅' : '❌'} {refreshFeedback.msg}
        </p>
      )}

      {/* Main layout: calendar (desktop) + content */}
      <div className="flex gap-6 items-start">
        {showMiniCalendar && (
          <MiniCalendar
            selected={dateRange ? dateRange.from : null}
            onChange={handleCalendarSelect}
            activeDates={activeDates}
            onMonthChange={handleMonthChange}
          />
        )}

        {/* Right: filters + feed */}
        <div className="flex-1 min-w-0">
          <div className="mb-4">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Rechercher dans le titre ou le contenu…"
                // `text-base` (16px) et non `text-sm` : sous 16px, Safari iOS zoome
                // automatiquement à la prise de focus et l'utilisateur doit
                // repincer pour revoir la page.
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-9 pr-12 text-base text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                aria-label="Rechercher des articles"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-ring"
                  aria-label="Effacer la recherche"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <DateFilter value={dateRange} onChange={applyDateRange} />
          </div>

          {/*
            Filtre de catégories : cumulatif, et surtout de simples boutons.

            C'étaient des `<Link>` vers `/[citySlug]/[categorySlug]` : chaque appui
            déclenchait une navigation de segment, donc `loading.tsx`, donc une grille
            de squelettes et une attente serveur complète — d'où l'impression de bug
            sur un réseau mobile. Et un segment ne portant qu'une catégorie, le cumul
            était impossible par construction.

            `aria-pressed` et non `aria-current="page"` : ce ne sont plus des liens
            mais des interrupteurs.
          */}
          {!hideCategoryTabs && (
            <div
              role="group"
              aria-label="Filtrer par catégorie"
              className="edge-fade flex flex-nowrap snap-x snap-mandatory overflow-x-auto scrollbar-hide gap-2 mb-6 sm:flex-wrap sm:snap-none"
            >
              <button
                type="button"
                onClick={clearCategoryFilter}
                aria-pressed={selectedCategories.length === 0}
                className={cn(
                  'shrink-0 snap-start min-h-11 inline-flex items-center px-4 py-2 rounded-full text-sm border transition-colors focus-ring',
                  selectedCategories.length === 0
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50'
                )}
              >
                Tout
              </button>
              {categories.filter((cat) => cat.slug !== excludeCategorySlug).map((cat) => {
                const active = selectedCategorySet.has(cat.slug)
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategoryFilter(cat.slug)}
                    aria-pressed={active}
                    className={cn(
                      'shrink-0 snap-start min-h-11 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm border transition-colors focus-ring',
                      active
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50'
                    )}
                  >
                    <span aria-hidden="true">{cat.icon || '📰'}</span>
                    {cat.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Bandeau d'erreur quand la liste courante reste affichable (échec de
              pagination, par exemple) : on ne jette pas ce qui est déjà lu. */}
          {error && articles.length > 0 && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1">Le chargement a échoué. Certaines actus peuvent manquer.</p>
              <button type="button" onClick={retry} className="font-medium underline focus-ring">
                Réessayer
              </button>
            </div>
          )}

          {/* Feed */}
          <div role="status" aria-live="polite" aria-busy={loading || refetching}>
            {loading ? (
              <div className={grouped ? LIST_CLASSES : GRID_CLASSES} aria-hidden="true">
                {/* Six et non douze : sur mobile une colonne, douze cartes fantômes
                    c'était trois écrans de peinture inutile. */}
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
                <TriangleAlert className="mx-auto mb-3 size-8 text-red-500" />
                <p className="font-medium text-red-800">Impossible de charger les actualités</p>
                <p className="mt-1 text-sm text-red-600">
                  Vérifiez votre connexion, puis réessayez.
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-red-300 bg-white px-5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-ring"
                >
                  Réessayer
                </button>
              </div>
            ) : articles.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-4xl mb-4" aria-hidden="true">📰</p>
                <p className="font-medium text-gray-600">
                  {/* L'ancien message parlait de « catégorie » quelle que soit la
                      cause : une pastille de date ou une recherche pouvait vider le
                      feed sans que rien ne le dise. */}
                  {searchQuery
                    ? 'Aucun article ne correspond à cette recherche'
                    : dateRange
                      ? `Aucun article pour ${dateRange.label}`
                      : selectedCategories.length > 0
                        ? selectedCategories.length === 1
                          ? 'Aucun article dans cette catégorie'
                          : 'Aucun article dans ces catégories'
                        : 'Aucun article pour le moment'}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-ring"
                  >
                    Réinitialiser les filtres
                  </button>
                )}
              </div>
            ) : (
              <div className={cn('transition-opacity', refetching && 'opacity-60 pointer-events-none')}>
                {grouped ? (
                  <>
                    {(() => {
                      let cursor = 0
                      return [...grouped.entries()].map(([dayKey, dayArticles]) => {
                        const startIndex = cursor
                        cursor += dayArticles.length
                        return (
                          <div key={dayKey} className="mb-8">
                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 capitalize">
                              {formatDayHeader(dayKey)}
                            </h2>
                            <div className={LIST_CLASSES}>
                              {dayArticles.map((article, i) => renderCard(article, startIndex + i))}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </>
                ) : (
                  <div className={GRID_CLASSES}>
                    {articles.map((article, index) => renderCard(article, index))}
                  </div>
                )}
                {paginationFooter}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
