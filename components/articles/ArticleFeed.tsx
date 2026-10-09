'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, Newspaper, Search, TriangleAlert, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ArticleCard, type CardFeedback } from './ArticleCard'
import { SkeletonCard } from './SkeletonCard'
import { useTabActive } from './TabPanel'
import { DateFilter } from './DateFilter'
import { MonthNav, MonthView } from './MonthView'
import { DayHeader } from './DayHeader'
import { FEED_LIST_CLASSES } from './FeedSkeleton'
import { Segmented } from '@/components/ui/Segmented'
import { Notice } from '@/components/ui/Notice'
import { EmptyState } from '@/components/ui/EmptyState'
import { chipClass } from '@/components/ui/Chip'
import { buttonClass } from '@/components/ui/Button'
import { categoryStyle } from '@/lib/category-style'
import { queryArticles, queryMonthEvents, resolveFeedContext, type FeedContext } from '@/lib/feed/query'
import { fetchLastFetchAt } from '@/lib/feed/last-update'
import { onFavoriteChange } from '@/lib/feed/favorite-events'
import { parisHorizonISO, formatParisFreshness, parisCivilDate } from '@/lib/feed/paris-time'
import { parisDateISO } from '@/lib/fetchers/dates'
import {
  deserializeRangeBounds,
  parseDateParam,
  serializeDateRange,
  type DateRange,
  type SerializedDateRange,
} from '@/lib/feed/date-params'
import {
  currentCivilMonth,
  formatMonthLabel,
  monthBounds,
  parseMonthParam,
  parseViewParam,
  serializeMonth,
  serializeMonthParam,
  serializeViewParam,
  type CivilMonth,
  type FeedView,
} from '@/lib/feed/view-params'
import { buildMonthGrid, buildMonthSections } from '@/lib/feed/month-grid'
import {
  parseCategoryParam,
  serializeCategoryParam,
  toggleCategory,
} from '@/lib/feed/category-params'
import type { FeedArticle, Category as CategoryType } from '@/lib/types'
import { cn, groupByDay, formatDayHeader, normalizeSearchText, UNDATED_DAY_KEY } from '@/lib/utils'

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
  searchTerm = '',
  view: FeedView = 'liste',
  month?: CivilMonth
) {
  // Les slugs arrivent déjà triés (voir serializeCategoryParam) : sans ça,
  // « sports,agenda » et « agenda,sports » produiraient deux clés pour le même feed.
  const category = categorySlugs.length > 0 ? categorySlugs.join(',') : 'all'
  const from = range?.from ? range.from.toISOString() : 'none'
  const to = range?.to ? range.to.toISOString() : 'none'
  const search = searchTerm || 'none'
  const mode = view === 'mois' && month ? `mois:${serializeMonth(month)}` : 'liste'
  return `${citySlug}|${category}|${from}|${to}|${search}|${mode}`
}

/** Clé d'un lot chargé : évite de relancer une requête identique au retour sur un mode. */
function listKey(range: DateRange | null, search: string, categorySlugs: string[]) {
  return `${serializeDateRange(range) ?? ''}|${search}|${categorySlugs.join(',')}`
}

function monthKey(month: CivilMonth, search: string, categorySlugs: string[]) {
  return `${serializeMonth(month)}|${search}|${categorySlugs.join(',')}`
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

// Partagées avec le squelette (`FeedSkeleton`) : la liste et sa silhouette doivent
// avoir la même grille, sinon les cartes sautent au remplacement.
const LIST_CLASSES = FEED_LIST_CLASSES

interface ArticleFeedProps {
  citySlug: string
  categorySlug?: string
  excludeCategorySlug?: string
  canManageContent?: boolean
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
  /** Total retenu par les filtres du premier rendu (voir `FeedQueryResult.total`). */
  initialTotal?: number | null
  initialError?: string | null
  initialFavorites?: number[]
  initialRange?: SerializedDateRange | null
  initialSearch?: string
  /** Slugs sélectionnés au premier rendu. Absent : lus depuis `?cat=`. */
  initialCategories?: string[]
  /** Dernière collecte des sources (ISO), affichée au-dessus de la recherche. */
  lastFetchAt?: string | null
  /**
   * Vue mensuelle préparée par le serveur (`?v=mois`). Absent : lu depuis l'URL.
   * Quand `initialMonthEvents` est fourni, `initialArticles` est un tableau vide et la
   * liste n'est chargée qu'au premier passage en mode liste.
   */
  initialView?: FeedView
  /** `YYYY-MM` du mois rendu par le serveur. */
  initialMonth?: string
  initialMonthEvents?: FeedArticle[] | null
}

export function ArticleFeed({
  citySlug,
  categorySlug,
  excludeCategorySlug,
  canManageContent = false,
  hideCategoryTabs = false,
  categories: categoryList,
  userId: initialUserId = null,
  feedContext,
  horizon,
  initialArticles = null,
  initialHasMore = false,
  initialTotal = null,
  initialError = null,
  initialFavorites,
  initialRange = null,
  initialSearch = '',
  initialCategories,
  lastFetchAt = null,
  initialView,
  initialMonth,
  initialMonthEvents = null,
}: ArticleFeedProps) {
  const isHydrated = initialArticles !== null && Boolean(feedContext)

  // Faux quand le fil vit dans un onglet caché (`TabPanel`) : préchargé avant qu'on
  // l'ouvre, ou gardé en vie après qu'on l'a quitté. L'URL décrit alors un autre onglet.
  const active = useTabActive()

  // Lu tôt : la sélection de catégories s'initialise depuis l'URL quand le serveur ne
  // l'a pas fournie (cas d'un changement d'onglet côté client).
  const searchParams = useSearchParams()
  // Paramètres de départ. Un fil monté caché n'en lit aucun : ceux de l'URL sont les
  // filtres de l'onglet affiché, ils ne le concernent pas — il part sans filtre et en
  // liste, comme `pushTab` le lui demandera à sa première ouverture.
  const [startParams] = useState<Pick<URLSearchParams, 'get'>>(() =>
    active ? searchParams : new URLSearchParams()
  )

  // Mode d'affichage et mois : du serveur quand il les a préparés, sinon de l'URL.
  const startView: FeedView = initialView ?? parseViewParam(startParams.get('v') ?? undefined)
  const startMonth: CivilMonth = parseMonthParam(initialMonth ?? startParams.get('m') ?? undefined)

  const [articles, setArticles] = useState<FeedArticle[]>(initialArticles ?? [])
  const [categories, setCategories] = useState<CategoryType[]>(categoryList ?? [])
  const [userId, setUserId] = useState<string | null>(initialUserId)
  const [favorites, setFavorites] = useState<Set<number>>(new Set(initialFavorites ?? []))
  // `loading` = premier remplissage, écran encore vide → squelettes.
  const [loading, setLoading] = useState(!isHydrated)
  // `refetching` = la liste est déjà affichée et un filtre change → on l'atténue
  // sans la vider. C'est ce qui évite de perdre sa place à chaque frappe.
  const [refetching, setRefetching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialHasMore)
  // Total retenu par les filtres, toutes pages confondues. Null tant qu'inconnu.
  const [total, setTotal] = useState<number | null>(initialTotal)
  const [error, setError] = useState<string | null>(initialError)
  const [offset, setOffset] = useState(initialArticles?.length ?? 0)
  const [dateRange, setDateRange] = useState<DateRange | null>(() =>
    deserializeRangeBounds(initialRange)
  )
  const [searchInput, setSearchInput] = useState(initialSearch)
  const [searchQuery, setSearchQuery] = useState(() => normalizeSearchText(initialSearch))
  // Sélection cumulative de catégories. La catégorie mise en avant a son propre onglet,
  // à catégorie fixe : dans ce mode, `hideCategoryTabs` est posé et la sélection reste
  // vide.
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    () => initialCategories ?? parseCategoryParam(startParams.get('cat') ?? undefined, categoryList ?? [])
  )
  const [refreshFeedback, setRefreshFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [deletingArticleId, setDeletingArticleId] = useState<number | null>(null)

  // ─── Vue mensuelle ────────────────────────────────────────────────────────────
  // Un mode du feed, pas un onglet (voir `lib/feed/view-params.ts`). Les cartes du
  // mois sont gardées avec la clé du mois qu'elles décrivent : au changement de mois, la
  // vue se vide le temps de la requête plutôt que d'afficher les cartes d'un autre mois
  // sous le nouveau libellé.
  const [view, setView] = useState<FeedView>(startView)
  const [month, setMonth] = useState<CivilMonth>(startMonth)
  const [monthData, setMonthData] = useState<{ key: string; events: FeedArticle[] } | null>(
    initialMonthEvents ? { key: serializeMonth(startMonth), events: initialMonthEvents } : null
  )
  const [monthLoading, setMonthLoading] = useState(false)
  const [monthError, setMonthError] = useState<string | null>(null)
  const viewRef = useRef<FeedView>(startView)
  const monthRef = useRef<CivilMonth>(startMonth)
  // Clés des lots déjà chargés, pour ne pas requêter deux fois la même chose en
  // basculant Liste → Mois → Liste. Null = jamais chargé dans cette session.
  const listKeyRef = useRef<string | null>(
    isHydrated && startView === 'liste'
      ? listKey(deserializeRangeBounds(initialRange), normalizeSearchText(initialSearch), initialCategories ?? [])
      : null
  )
  const monthKeyRef = useRef<string | null>(
    initialMonthEvents ? monthKey(startMonth, normalizeSearchText(initialSearch), initialCategories ?? []) : null
  )
  const monthGenerationRef = useRef(0)
  // Calculés une fois : la date civile de Paris est la même des deux côtés, sauf à
  // cheval sur minuit.
  const todayKey = useMemo(() => parisDateISO(new Date()), [])
  const currentMonth = useMemo(() => currentCivilMonth(), [])
  // En état et non en simple prop : sur un onglet atteint côté client, le serveur ne
  // prépare pas cette date (prop `lastFetchAt`) et le feed la lit lui-même au montage.
  const [lastFetch, setLastFetch] = useState<string | null>(lastFetchAt)

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

  const scrollContext = useMemo(
    () => buildScrollContext(citySlug, categorySlug ? [categorySlug] : selectedCategories, dateRange, searchQuery, view, month),
    [citySlug, categorySlug, selectedCategories, dateRange, searchQuery, view, month]
  )

  // Formaté en Europe/Paris (voir formatParisFreshness) : « à 6 h 02 », « hier à 6 h 02 ».
  // La chaîne ne doit pas dépendre du fuseau du client.
  const lastFetchLabel = useMemo(
    () => (lastFetch ? formatParisFreshness(lastFetch) : null),
    [lastFetch]
  )

  // ─── Synchronisation avec l'URL ───────────────────────────────────────────────
  // Les filtres vivaient en state local : ni lien partageable, ni bouton retour, et
  // tout était perdu au rafraîchissement. On écrit désormais `?d=`, `?q=` et `?cat=`
  // avec l'API History native, qui s'intègre au routeur Next sans aller-retour serveur.
  const urlDate = searchParams.get('d') ?? ''
  const urlSearch = searchParams.get('q') ?? ''
  const urlCategories = searchParams.get('cat') ?? ''
  const urlView = searchParams.get('v') ?? ''
  const urlMonth = searchParams.get('m') ?? ''
  // Dernier état que *nous* avons appliqué. Une divergence signifie que l'URL a
  // bougé sans nous — c'est-à-dire un retour ou une avance dans l'historique.
  const appliedUrlRef = useRef({
    d: serializeDateRange(deserializeRangeBounds(initialRange)) ?? '',
    q: initialSearch,
    cat: serializeCategoryParam(initialCategories ?? parseCategoryParam(startParams.get('cat') ?? '', categoryList ?? [])) ?? '',
    v: startParams.get('v') ?? '',
    m: startParams.get('m') ?? '',
  })
  // Dernière valeur de recherche déjà répercutée en requête. Distincte de l'état :
  // le débounce fait passer `searchQuery` par la même valeur au montage, et sans ce
  // repère le feed relançait une requête identique juste après le rendu serveur.
  const searchSyncedRef = useRef(normalizeSearchText(initialSearch))

  const writeUrl = useCallback(
    (next: { d: string; q: string; cat: string; v: string; m: string }, mode: 'push' | 'replace') => {
      if (typeof window === 'undefined') return
      appliedUrlRef.current = next

      const params = new URLSearchParams(window.location.search)
      for (const [key, value] of [['d', next.d], ['q', next.q], ['cat', next.cat], ['v', next.v], ['m', next.m]] as const) {
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

  /**
   * Mode « catégorie unique fixe » (onglet mis en avant) : le contexte du serveur fait
   * foi, la sélection de pastilles n'existe pas dans ce mode. Sinon la sélection
   * remplace les catégories du contexte, et une sélection explicite rend l'exclusion
   * sans objet : la catégorie mise en avant ne figure pas dans les pastilles.
   */
  const effectiveContextFor = useCallback((context: FeedContext, categorySlugs: string[]): FeedContext => {
    if (categorySlug) return context
    const ids = resolveCategoryIds(categorySlugs)
    return { ...context, categoryIds: ids, excludeCategoryId: ids.length > 0 ? null : context.excludeCategoryId }
  }, [categorySlug, resolveCategoryIds])

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
      if (reset) listKeyRef.current = listKey(range, search, categorySlugs)

      const result = await queryArticles(supabase, {
        context: effectiveContextFor(context, categorySlugs),
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
      if (result.total !== null) setTotal(result.total)
      if (reset) {
        setArticles(result.articles)
        setAutoLoads(0)
      } else {
        setArticles((prev) => [...prev, ...result.articles])
      }
      offsetRef.current = currentOffset + result.articles.length
      setOffset(offsetRef.current)
    },
    [effectiveContextFor]
  )

  /**
   * Charge les événements d'un mois. Son propre jeton de génération : un mois abandonné
   * (deux clics rapides sur la flèche) ne doit pas écraser le mois affiché.
   */
  const loadMonth = useCallback(
    async (target: CivilMonth, search: string, categorySlugs: string[]) => {
      const context = contextRef.current
      if (!context) return

      const generation = ++monthGenerationRef.current
      setMonthLoading(true)
      const { start, end } = monthBounds(target)
      const result = await queryMonthEvents(createClient(), {
        context: effectiveContextFor(context, categorySlugs),
        start: start.toISOString(),
        end: end.toISOString(),
        search,
      })
      if (generation !== monthGenerationRef.current) return

      setMonthLoading(false)
      if (result.error) {
        setMonthError(result.error.message)
        return
      }
      setMonthError(null)
      setMonthData({ key: serializeMonth(target), events: result.events })
      monthKeyRef.current = monthKey(target, search, categorySlugs)
    },
    [effectiveContextFor]
  )

  /**
   * Point d'entrée unique des filtres : état local, URL et requête bougent ensemble.
   *
   * Les faire bouger séparément est ce qui rendait `resetFilters` faux — il posait
   * `searchInput` à vide puis appelait le gestionnaire de date, qui réécrivait
   * l'URL avec l'ancienne valeur de recherche capturée dans sa closure.
   *
   * Le mode d'affichage et le mois sont lus dans leurs refs : ils changent par
   * `switchView` / `changeMonth`, qui les posent **avant** d'appeler ici. En mode mois,
   * la plage de dates n'a pas de sens et reste vide.
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
      const currentView = viewRef.current
      const currentMonthValue = monthRef.current
      const effectiveRange = currentView === 'mois' ? null : range

      setDateRange(effectiveRange)
      setSearchInput(searchText)
      setSearchQuery(normalized)
      setSelectedCategories(canonicalCategories)
      searchSyncedRef.current = normalized
      setOffset(0)
      writeUrl(
        {
          d: serializeDateRange(effectiveRange) ?? '',
          q: searchText,
          cat: serializeCategoryParam(canonicalCategories) ?? '',
          v: serializeViewParam(currentView) ?? '',
          m: currentView === 'mois' ? (serializeMonthParam(currentMonthValue) ?? '') : '',
        },
        mode
      )

      if (currentView === 'mois') {
        if (monthKeyRef.current === monthKey(currentMonthValue, normalized, canonicalCategories)) return
        void loadMonth(currentMonthValue, normalized, canonicalCategories)
        return
      }

      if (listKeyRef.current === listKey(effectiveRange, normalized, canonicalCategories)) return
      // Première liste de la session (le serveur avait rendu le mois) : squelettes et
      // non liste atténuée, il n'y a encore rien à atténuer.
      const firstFill = listKeyRef.current === null
      if (firstFill) setLoading(true)
      else setRefetching(true)
      void runQuery({ reset: true, range: effectiveRange, search: normalized, categorySlugs: canonicalCategories })
        .finally(() => { setLoading(false); setRefetching(false) })
    },
    [runQuery, loadMonth, writeUrl]
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
      const initialContext = buildScrollContext(citySlug, categorySlug ? [categorySlug] : selectedCategories, dateRange, searchQuery, view, month)
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
        // Le serveur a rendu la coquille en mode mois mais la lecture du mois a échoué :
        // on la retente ici, c'est l'erreur qui s'affichera si elle persiste.
        if (view === 'mois' && monthData === null) {
          void loadMonth(month, searchQuery, selectedCategories)
          return
        }
        if (view === 'liste' && hasValidExternalReturn && requestedCount > (initialArticles?.length ?? 0)) {
          setRefetching(true)
          await runQuery({ reset: true, range: dateRange, search: searchQuery, categorySlugs: selectedCategories, targetCount: requestedCount })
          setRefetching(false)
        }
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

      await Promise.all([
        view === 'mois'
          ? loadMonth(month, searchQuery, selectedCategories)
          : runQuery({ reset: true, range: dateRange, search: searchQuery, categorySlugs: selectedCategories, targetCount: requestedCount }),
        // La date de dernière collecte est une propriété de la **ville**, pas du feed :
        // elle doit s'afficher sur « Autour de la Chap' » comme sur « Actus ». Le
        // serveur ne la prépare que pour l'onglet qu'il rend (prop `lastFetchAt`) ;
        // sur un onglet atteint côté client, le feed la lit lui-même — une requête
        // d'une ligne sur `sources`, en lecture publique, lancée avec le reste.
        fetchLastFetchAt(supabase, context.cityId).then(setLastFetch),
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
  //
  // Caché, le fil ignore l'URL : elle porte les filtres de l'onglet affiché, et les
  // adopter effacerait les siens. Il la relit en redevenant visible (`active` en
  // dépendance) — `pushTab` y a remis ses paramètres, rien ne bouge ; un retour arrière
  // vers une entrée plus ancienne de cet onglet, lui, est bien rejoué.
  useEffect(() => {
    if (!active) return
    if (!hasInitializedRef.current) return
    if (
      urlDate === appliedUrlRef.current.d &&
      urlSearch === appliedUrlRef.current.q &&
      urlCategories === appliedUrlRef.current.cat &&
      urlView === appliedUrlRef.current.v &&
      urlMonth === appliedUrlRef.current.m
    ) return

    // Mode et mois d'abord, dans les refs que `applyFilters` lit.
    const nextView = parseViewParam(urlView || undefined)
    const nextMonth = parseMonthParam(urlMonth || undefined)
    viewRef.current = nextView
    monthRef.current = nextMonth
    setView(nextView)
    setMonth(nextMonth)

    // `replace` : l'entrée d'historique visée existe déjà, on ne fait que la rejouer.
    applyFilters(
      parseDateParam(urlDate || undefined),
      urlSearch,
      parseCategoryParam(urlCategories, categoriesRef.current),
      'replace'
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, urlDate, urlSearch, urlCategories, urlView, urlMonth])

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
    // En liste, attendre que toute la longueur parcourue soit rematérialisée ; en mode
    // mois la grille a sa hauteur dès le premier rendu.
    if (view === 'liste' && articles.length < Math.max(PAGE_SIZE, snapshot.expectedCount ?? PAGE_SIZE)) return
    if (view === 'mois' && monthData === null) return

    restoredContextRef.current = scrollContext
    const targetY = Math.max(0, snapshot.y)
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'auto' })
      clearExternalScrollSnapshot()
    })
  }, [loading, articles.length, scrollContext, view, monthData])

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

  function resetFilters() {
    applyFilters(null, '', [], 'push')
  }

  // ─── Vue mensuelle : bascule et mois ──────────────────────────────────────────
  function switchView(next: FeedView) {
    if (next === viewRef.current) return
    // Une journée précise filtrée en liste ouvre son mois : c'est elle qu'on veut
    // situer, pas le mois en cours.
    if (next === 'mois' && dateRange) {
      const { y, m } = parisCivilDate(dateRange.from)
      monthRef.current = { y, m }
      setMonth({ y, m })
    }
    viewRef.current = next
    setView(next)
    applyFilters(null, searchInput, selectedCategories, 'push')
  }

  function changeMonth(next: CivilMonth) {
    monthRef.current = next
    setMonth(next)
    applyFilters(null, searchInput, selectedCategories, 'push')
  }

  // Cartes du mois affiché. Des cartes d'un autre mois (requête encore en vol)
  // donneraient des jours faux : on repart d'un mois vide, atténué. `grid` alimente le
  // bandeau de jours et le compteur, `sections` les groupes de cartes.
  const monthEvents = useMemo(
    () => (monthData && monthData.key === serializeMonth(month) ? monthData.events : []),
    [month, monthData]
  )
  const grid = useMemo(() => (monthData ? buildMonthGrid(month, monthEvents) : null), [month, monthData, monthEvents])
  const sections = useMemo(() => (monthData ? buildMonthSections(month, monthEvents) : null), [month, monthData, monthEvents])

  // Cumulatif : chaque appui ajoute ou retire la catégorie de la sélection, sans
  // navigation de route — la liste reste affichée, simplement atténuée.
  function toggleCategoryFilter(slug: string) {
    applyFilters(dateRange, searchInput, toggleCategory(selectedCategories, slug), 'push')
  }

  function clearCategoryFilter() {
    applyFilters(dateRange, searchInput, [], 'push')
  }

  /**
   * Clic sur la commune d'une carte : la recherche devient ce nom, les autres filtres
   * (date, catégories) sont conservés.
   *
   * `push` et non `replace` — c'est une intention explicite, le retour arrière doit
   * défaire la recherche et non quitter la page. L'identité doit rester stable, sinon
   * la mémoïsation de toutes les cartes tombe à chaque changement de filtre : les
   * valeurs courantes passent donc par une ref plutôt que par les dépendances.
   *
   * Remontée en haut de liste, contrairement aux autres filtres : ceux-ci se pilotent
   * depuis la barre au-dessus du feed, alors qu'on peut cliquer un lieu très bas dans
   * la page — le résultat serait invisible.
   */
  const filtersRef = useRef({ dateRange, selectedCategories })
  useEffect(() => {
    filtersRef.current = { dateRange, selectedCategories }
  }, [dateRange, selectedCategories])

  const handleLocationSearch = useCallback((locality: string) => {
    const { dateRange: range, selectedCategories: cats } = filtersRef.current
    applyFilters(range, locality, cats, 'push')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [applyFilters])

  function retry() {
    setError(null)
    setRefetching(true)
    void runQuery({ reset: true, range: dateRange, search: searchQuery, categorySlugs: selectedCategories }).finally(() =>
      setRefetching(false)
    )
  }

  // Bandeau de retour, effacé après cinq secondes. Une seule porte d'entrée pour le
  // masquage, les favoris et le partage — chacun posait son propre timer avant.
  const notify = useCallback((feedback: CardFeedback) => {
    setRefreshFeedback(feedback)
    window.setTimeout(() => setRefreshFeedback(null), 5000)
  }, [])

  // Le jeu des favoris suit les écritures réussies : sinon un article redevenu visible
  // après un changement de filtre repartait avec l'état du premier rendu. Toutes les
  // écritures, d'où qu'elles viennent : ce fil reste monté pendant qu'on retire un
  // favori depuis l'onglet « Favoris », son cœur doit se vider aussi.
  useEffect(() => onFavoriteChange(({ articleId, favorited }) => {
    setFavorites((prev) => {
      if (prev.has(articleId) === favorited) return prev
      const next = new Set(prev)
      if (favorited) next.add(articleId)
      else next.delete(articleId)
      return next
    })
  }), [])

  // Identité stable : ArticleCard est mémoïsé, une fonction recréée à chaque render
  // invaliderait la mémoïsation de toutes les cartes.
  const handleDeleteArticle = useCallback(async (articleId: number) => {
    if (!userId || !canManageContent) {
      notify({ ok: false, msg: 'Vous devez être connecté.' })
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
        notify({ ok: false, msg: 'Vous devez être connecté.' })
      } else if (data.ok) {
        setArticles(prev => prev.filter(article => article.id !== articleId))
        setFavorites(prev => {
          const next = new Set(prev)
          next.delete(articleId)
          return next
        })
        setTotal((prev) => (prev === null ? prev : Math.max(0, prev - 1)))
        // « Masquée » et non « supprimée » : la ligne reste en base avec is_duplicate=true,
        // sinon le prochain cron la recréerait tant que l'URL est dans le flux source.
        notify({ ok: true, msg: 'Actu masquée.' })
      } else {
        notify({ ok: false, msg: data.error ?? 'Erreur inconnue' })
      }
    } catch {
      notify({ ok: false, msg: 'Erreur réseau' })
    } finally {
      setDeletingArticleId(null)
    }
  }, [userId, canManageContent, notify])

  // Regroupé par jour **toujours**, plus seulement sous filtre de date : sans repère,
  // le feed par défaut était une grille plate où les événements de novembre suivaient
  // ceux de ce soir. Mémoïsé : reparser toutes les dates à chaque render était
  // inutile, et le coût grandit avec le nombre de pages chargées.
  const grouped = useMemo(() => groupByDay(articles), [articles])
  const hasActiveFilters =
    Boolean(dateRange) || Boolean(searchQuery) || selectedCategories.length > 0
  const selectedCategorySet = useMemo(() => new Set(selectedCategories), [selectedCategories])

  // « 12 actus · Ce weekend », « 3 actus pour « Oudon » ». Le total vient de la
  // requête, pas de la longueur de la liste : celle-ci n'est qu'une page.
  const countLabel = useMemo(() => {
    if (view === 'mois') {
      if (!grid || monthData?.key !== serializeMonth(month)) return null
      const noun = grid.total === 1 ? 'événement' : 'événements'
      const parts = [`${grid.total} ${noun} en ${formatMonthLabel(month)}`]
      if (searchQuery) parts.push(`pour « ${searchInput.trim()} »`)
      return parts.join(' ')
    }
    if (total === null) return null
    const noun = total === 1 ? 'actu' : 'actus'
    const parts = [`${total} ${noun}`]
    if (dateRange?.label) parts.push(`· ${dateRange.label}`)
    if (searchQuery) parts.push(`pour « ${searchInput.trim()} »`)
    return parts.join(' ')
  }, [view, grid, monthData, month, total, dateRange, searchQuery, searchInput])

  // Compteur et fraîcheur sur une seule ligne discrète : « 18 actus · mis à jour à
  // 6 h 02 ». La fraîcheur est une propriété de la ville (la source la plus récemment
  // collectée), elle reste affichée même quand le compteur attend sa requête.
  const showCount = Boolean(countLabel) && (view === 'mois' ? !monthLoading : !loading && !error && articles.length > 0)
  const statusLine = useMemo(() => {
    const parts = [showCount ? countLabel : null, lastFetchLabel ? `mis à jour ${lastFetchLabel}` : null].filter(Boolean) as string[]
    if (parts.length === 0) return null
    const line = parts.join(' · ')
    return line.charAt(0).toUpperCase() + line.slice(1)
  }, [showCount, countLabel, lastFetchLabel])

  function renderCard(article: FeedArticle, absoluteIndex: number, variant: 'compact' | 'hero' = 'compact') {
    return (
      <ArticleCard
        key={article.id}
        article={article}
        variant={variant}
        // Une seule carte est au-dessus de la ligne de flottaison sur mobile (une
        // colonne) : sortir les suivantes du lazy-loading ferait concurrence au LCP.
        priority={absoluteIndex === 0}
        userId={userId}
        isFavorited={favorites.has(article.id)}
        canDelete={Boolean(userId && canManageContent)}
        deleting={deletingArticleId === article.id}
        onDelete={handleDeleteArticle}
        onLocationSearch={handleLocationSearch}
        onFeedback={notify}
        scrollRestoreContext={scrollContext}
        scrollRestoreCount={view === 'mois' ? monthEvents.length : articles.length}
      />
    )
  }

  const paginationFooter = hasMore ? (
    <div ref={sentinelRef} className="mt-6 flex justify-center">
      {(autoLoadExhausted || loadingMore) && (
        <button
          type="button"
          onClick={() => { setAutoLoads(0); void loadMore() }}
          disabled={loadingMore}
          className={buttonClass('tinted', 'md', 'w-full sm:w-auto sm:px-6')}
        >
          {loadingMore ? 'Chargement…' : 'Voir plus'}
          {!loadingMore && <ChevronDown className="size-4" />}
        </button>
      )}
    </div>
  ) : null

  const retryLink = (
    <button type="button" onClick={retry} className="font-semibold underline focus-ring">
      Réessayer
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Recherche : capsule iOS. `text-body` (17 px) : sous 16 px, Safari iOS zoome
          automatiquement à la prise de focus. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={hideCategoryTabs ? 'Une commune, un lieu, un événement…' : 'Rechercher un événement, un lieu…'}
          className="h-10 w-full rounded-full bg-fill pl-10 pr-11 text-body text-ink outline-none transition-shadow focus:ring-2 focus:ring-accent/40"
          aria-label="Rechercher des articles"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput('')}
            className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted focus-ring"
            aria-label="Effacer la recherche"
          >
            <X className="size-[18px]" />
          </button>
        )}
      </div>

      {/*
        Menu « Quand » à gauche, « Liste | Mois » à droite. En mode mois, la navigation
        de mois prend la place du menu : une plage de dates n'a pas de sens sur un mois
        qui en est déjà une.
      */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {view === 'liste' ? (
            <DateFilter value={dateRange} onChange={applyDateRange} />
          ) : (
            <MonthNav month={month} currentMonth={currentMonth} onMonthChange={changeMonth} />
          )}
        </div>
        <Segmented
          label="Mode d'affichage"
          value={view}
          onChange={switchView}
          options={[
            { value: 'liste', label: 'Liste' },
            { value: 'mois', label: 'Mois' },
          ]}
          className="w-[136px] shrink-0"
        />
      </div>

      {/*
        Filtre de catégories : cumulatif, et de simples boutons — pas des liens : un
        segment d'URL ne portait qu'une catégorie et chaque appui déclenchait une
        navigation complète. `aria-pressed` : ce sont des interrupteurs.

        La tuile colorée de chaque pastille reprend celle des cartes : la couleur d'une
        catégorie se lit pareil partout.
      */}
      {!hideCategoryTabs && (
        <div
          role="group"
          aria-label="Filtrer par catégorie"
          className="edge-fade scrollbar-hide -mx-4 flex flex-nowrap gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          <button
            type="button"
            onClick={clearCategoryFilter}
            aria-pressed={selectedCategories.length === 0}
            className={chipClass(selectedCategories.length === 0)}
          >
            Tout
          </button>
          {categories.filter((cat) => cat.slug !== excludeCategorySlug).map((cat) => {
            const active = selectedCategorySet.has(cat.slug)
            const style = categoryStyle(cat.slug)
            const Icon = style.icon
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategoryFilter(cat.slug)}
                aria-pressed={active}
                className={chipClass(active, 'pl-1.5')}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-6 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: active ? 'rgba(255, 255, 255, 0.22)' : style.color }}
                >
                  <Icon className="size-3.5" strokeWidth={2.4} />
                </span>
                {cat.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Bandeau d'erreur quand la liste courante reste affichable (échec de
          pagination, par exemple) : on ne jette pas ce qui est déjà lu. */}
      {view === 'liste' && error && articles.length > 0 && (
        <Notice tone="danger" action={retryLink}>
          Le chargement a échoué. Certaines actus peuvent manquer.
        </Notice>
      )}

      {/* Compteur : dit ce que les filtres ont retenu, ce que rien n'indiquait. */}
      {statusLine && <p className="text-footnote text-ink-muted" aria-live="polite">{statusLine}</p>}

      <div className="mt-1">
        {/* Vue mensuelle */}
        {view === 'mois' && (
          <MonthView
            month={month}
            todayKey={todayKey}
            grid={grid}
            sections={sections}
            loading={monthLoading}
            error={monthError}
            onRetry={() => void loadMonth(month, searchQuery, selectedCategories)}
            renderCard={renderCard}
            listClassName={LIST_CLASSES}
          />
        )}

        {/* Feed */}
        {view === 'liste' && <div role="status" aria-live="polite" aria-busy={loading || refetching}>
          {loading ? (
            <div className={LIST_CLASSES} aria-hidden="true">
              {/* Six et non douze : sur mobile une colonne, douze cartes fantômes
                  c'était trois écrans de peinture inutile. */}
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : error ? (
            <EmptyState
              icon={TriangleAlert}
              tone="danger"
              title="Impossible de charger les actualités"
              action={<button type="button" onClick={retry} className={buttonClass('secondary', 'md')}>Réessayer</button>}
            >
              Vérifiez votre connexion, puis réessayez.
            </EmptyState>
          ) : articles.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              // L'ancien message parlait de « catégorie » quelle que soit la cause : une
              // date ou une recherche pouvait vider le feed sans que rien ne le dise.
              title={
                searchQuery
                  ? 'Aucun article ne correspond à cette recherche'
                  : dateRange
                    ? `Aucun article pour ${dateRange.label}`
                    : selectedCategories.length > 0
                      ? selectedCategories.length === 1
                        ? 'Aucun article dans cette catégorie'
                        : 'Aucun article dans ces catégories'
                      : 'Aucun article pour le moment'
              }
              action={
                hasActiveFilters ? (
                  <button type="button" onClick={resetFilters} className={buttonClass('secondary', 'md')}>
                    Réinitialiser les filtres
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className={cn('transition-opacity', refetching && 'opacity-60 pointer-events-none')}>
              {(() => {
                let cursor = 0
                return [...grouped.entries()].map(([dayKey, dayArticles]) => {
                  const startIndex = cursor
                  cursor += dayArticles.length
                  // La première carte illustrée d'une journée passe en grande carte : elle
                  // donne le rythme du fil, à la manière d'Apple News. Pas pour « Sans
                  // date », qui n'est pas une journée.
                  const heroIndex = dayKey === UNDATED_DAY_KEY ? -1 : dayArticles.findIndex((a) => a.image_url)
                  return (
                    <section key={dayKey} className="mb-7" aria-label={formatDayHeader(dayKey)}>
                      <DayHeader dayKey={dayKey} />
                      <div className={LIST_CLASSES}>
                        {dayArticles.map((article, i) =>
                          renderCard(article, startIndex + i, i === heroIndex ? 'hero' : 'compact')
                        )}
                      </div>
                    </section>
                  )
                })
              })()}
              {paginationFooter}
            </div>
          )}
        </div>}
      </div>

      {/*
        Retour des actions de carte (masquage, favori, partage) : une pastille de verre
        au-dessus de la barre d'onglets, à la manière d'un toast iOS. Le bandeau en tête
        de liste qu'elle remplace était invisible dès qu'on avait défilé.
      */}
      {refreshFeedback && (
        <div role="status" className="bottom-toast pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4">
          <p
            className={cn(
              'glass glass-strong rounded-full px-4 py-2.5 text-subhead font-medium',
              refreshFeedback.ok ? 'text-ink' : 'text-danger'
            )}
          >
            {refreshFeedback.msg}
          </p>
        </div>
      )}
    </div>
  )
}
