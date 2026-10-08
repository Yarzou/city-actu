'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, RefreshCw, CircleAlert, CircleCheck, CircleDashed, AlertTriangle, Settings, Pencil, Wand2, Sparkles, ChevronDown, ArrowUp, ArrowDown, Rss, Tags, ExternalLink, X, type LucideIcon } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Source, SourceType, Category, City, ScrapingConfig, ImportSummary } from '@/lib/types'
import { cn, formatDigestHtml } from '@/lib/utils'
import { categoryStyle } from '@/lib/category-style'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button, buttonClass } from '@/components/ui/Button'
import { IconTile, ListRow, ListSection } from '@/components/ui/List'
import { Notice } from '@/components/ui/Notice'
import { Segmented } from '@/components/ui/Segmented'
import { Switch } from '@/components/ui/Switch'

// Teinte du badge de type. Elle n'est qu'un repère : c'est le libellé qui dit le type.
const SOURCE_TYPE_BADGE: Record<SourceType, string> = {
  rss:      'bg-accent-soft text-accent',
  scraping: 'bg-warn-soft text-warn',
  opendata: 'bg-fill-soft text-ink-muted',
}

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  rss:      'RSS',
  scraping: 'SCRAPING',
  opendata: 'OPEN DATA',
}

const SUMMARY_FILTERS: { value: 'all' | 'on_demand' | 'refresh'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'on_demand', label: 'À la demande' },
  { value: 'refresh', label: 'Refresh' },
]

/**
 * Champs de saisie du panneau. 17 px (`text-body`) : en dessous de 16 px, Safari iOS
 * zoome la page à la prise de focus. Deux surfaces : posé sur une carte, le champ est
 * gris (`bg-fill-soft`) ; dans un encart déjà gris (édition en ligne, sélecteurs CSS),
 * il redevient blanc (`bg-card`), sinon il se fondrait dans son fond.
 */
type Surface = 'card' | 'fill'

function fieldClass(surface: Surface, className?: string) {
  return cn(
    'h-11 w-full rounded-xl border-0 px-3 text-body text-ink outline-none focus:ring-2 focus:ring-accent/40',
    surface === 'card' ? 'bg-fill-soft' : 'bg-card',
    className
  )
}

const LABEL = 'mb-1.5 block text-footnote font-medium text-ink-muted'

/** Petit titre en capitales d'un encart (formulaire, édition en ligne). */
const PANEL_TITLE = 'text-footnote font-semibold uppercase tracking-[0.3px] text-ink-muted'

/** Bouton rond d'action sur une ligne (ouvrir, tester, éditer…), teinté comme sur iOS. */
const ICON_BUTTON = 'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-accent transition-colors hover:bg-fill-soft active:bg-fill-soft disabled:opacity-40 focus-ring'
const ICON_BUTTON_DANGER = 'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger-soft active:bg-danger-soft disabled:opacity-40 focus-ring'

const EMPTY_SCRAPING_CONFIG: ScrapingConfig = {
  list_selector: '',
  title_selector: '',
  link_selector: 'a',
  content_selector: '',
  image_selector: '',
  date_selector: '',
  end_date_selector: '',
  location_selector: '',
  location_default: '',
  detail_date_selector: '',
  base_url: '',
}

interface FetchResultDetail {
  sourceId: number
  fetched: number
  inserted: number
  /** Optionnels : les littéraux de secours de testFetch ne les renseignent pas. */
  updated?: number
  unchanged?: number
  skipped: number
  errors: string[]
}

/**
 * Santé du dernier fetch *persisté* (colonnes last_fetch_* de la source).
 * À ne pas confondre avec fetchResult, qui est le résultat éphémère du bouton "Tester le fetch".
 *
 * L'état ne repose jamais sur la seule couleur : une icône de forme différente et un
 * mot (« Récupérée », « Échec ») le portent aussi.
 */
function SourceHealthBadge({ source }: { source: Source }) {
  const { last_fetch_at, last_fetch_status, last_fetch_error, consecutive_failures } = source

  if (!last_fetch_at) {
    return (
      <span className="inline-flex items-center gap-1 text-footnote text-ink-muted" title="Cette source n'a jamais été récupérée">
        <CircleDashed size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
        Jamais récupérée
      </span>
    )
  }

  const failed = last_fetch_status === 'error'
  const ago = formatDistanceToNow(new Date(last_fetch_at), { addSuffix: true, locale: fr })

  return (
    <span
      className={cn('inline-flex flex-wrap items-center gap-x-1 text-footnote', failed ? 'text-danger' : 'text-ink-muted')}
      title={failed ? (last_fetch_error ?? 'Dernier fetch en échec') : `Dernier fetch réussi ${ago}`}
    >
      {failed
        ? <CircleAlert size={14} className="shrink-0" aria-hidden="true" />
        : <CircleCheck size={14} className="shrink-0 text-accent" aria-hidden="true" />}
      {failed ? `Échec ${ago}` : `Récupérée ${ago}`}
      {consecutive_failures >= 3 && (
        <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-danger">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {consecutive_failures} échecs
        </span>
      )}
    </span>
  )
}

/** Résultat éphémère du « Tester le fetch » (ou du rafraîchissement global), sous la source. */
function FetchResultLine({ result }: { result: FetchResultDetail }) {
  if (result.errors.length > 0) {
    return (
      <ul className="mt-1.5 flex flex-col gap-0.5 text-footnote text-danger">
        {result.errors.map((e, i) => (
          <li key={i} className="flex items-start gap-1">
            <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{e}</span>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <p className="mt-1.5 flex items-center gap-1 text-footnote text-accent">
      <CircleCheck size={14} className="shrink-0" aria-hidden="true" />
      {result.fetched} récupérés, {result.inserted} ajoutés, {result.updated ?? 0} mis à jour
    </p>
  )
}

/**
 * En-tête repliable d'une section du panneau, dessiné comme une ligne de Réglages :
 * tuile d'icône, titre, compteur, chevron qui pivote. Le `<h2>` garde la structure
 * annonçable par les lecteurs d'écran, sous le `<h1>` « Administration » de la page.
 */
function SectionToggle({
  icon: Icon,
  title,
  count,
  open,
  onToggle,
}: {
  icon: LucideIcon
  title: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <h2>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-[14px] bg-card px-4 text-left focus-ring active:bg-fill-soft"
      >
        <IconTile className="bg-accent-fill">
          <Icon size={18} aria-hidden="true" />
        </IconTile>
        <span className="min-w-0 flex-1 text-body text-ink">{title}</span>
        {count > 0 && <span className="text-body tabular-nums text-ink-muted">{count}</span>}
        <ChevronDown
          size={18}
          strokeWidth={2.4}
          className={cn('shrink-0 text-ink-faint transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
    </h2>
  )
}

/** Icône de tête d'une ligne d'action (`ListRow`), à la largeur d'une tuile. */
function RowIcon({ icon: Icon, tone = 'accent', className }: { icon: LucideIcon; tone?: 'accent' | 'danger'; className?: string }) {
  return (
    <span className={cn('flex w-[30px] justify-center', tone === 'danger' ? 'text-danger' : 'text-accent')}>
      <Icon size={22} className={className} aria-hidden="true" />
    </span>
  )
}

/** Croix de fermeture d'un `Notice` : elle prend la teinte du message. */
function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fermer le message"
      className="-my-2 -mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full opacity-80 transition-opacity hover:opacity-100 focus-ring"
    >
      <X size={18} aria-hidden="true" />
    </button>
  )
}

/**
 * Tuile de la catégorie telle que le public la verra (lib/category-style.ts). Un slug
 * absent de la table y tombe sur l'ardoise de repli : c'est ici que l'admin le voit.
 */
function CategoryTile({ slug }: { slug: string }) {
  const style = categoryStyle(slug)
  return (
    <IconTile color={style.color}>
      <style.icon size={18} aria-hidden="true" />
    </IconTile>
  )
}

/** Champ libellé au-dessus de sa saisie. */
function Field({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  )
}

export function AdminSourcesPanel() {
  // Replié par défaut, comme « Gestion des catégories » et l'historique des résumés :
  // la page s'ouvre sur la liste des sections plutôt que sur un mur de contenu.
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [sources, setSources]       = useState<Source[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cities, setCities]         = useState<City[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [fetching, setFetching]     = useState<number | null>(null)
  const [fetchResult, setFetchResult] = useState<Record<number, FetchResultDetail>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{
    sources: number; fetched: number; inserted: number
    updated?: number; unchanged?: number
    skipped: number; errors: number
  } | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [importSummaries, setImportSummaries] = useState<ImportSummary[]>([])
  const [showSummaryHistory, setShowSummaryHistory] = useState(false)
  const [summarySourceFilter, setSummarySourceFilter] = useState<'all' | 'on_demand' | 'refresh'>('all')
  const [deletingSummaryId, setDeletingSummaryId] = useState<number | null>(null)
  const [clearingSummaries, setClearingSummaries] = useState(false)
  const [summarizeError, setSummarizeError] = useState<string | null>(null)
  const [editingConfig, setEditingConfig] = useState<number | null>(null)
  const [editConfig, setEditConfig] = useState<ScrapingConfig>(EMPTY_SCRAPING_CONFIG)
  const [savingConfig, setSavingConfig] = useState(false)
  const [editingSource, setEditingSource]   = useState<number | null>(null)
  const [editSourceData, setEditSourceData] = useState({ name: '', url: '', category_id: '' })
  const [savingSource, setSavingSource]     = useState(false)
  const [detecting, setDetecting]         = useState(false)
  const [detectError, setDetectError]     = useState<string | null>(null)
  const [detectPreview, setDetectPreview] = useState<{ matchedCount: number; sampleTitles: string[] } | null>(null)
  // Detect for inline config editor (existing sources)
  const [detectingConfig, setDetectingConfig]   = useState(false)
  const [detectConfigError, setDetectConfigError] = useState<string | null>(null)
  // Category management
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [editingCategory, setEditingCategory]   = useState<number | null>(null)
  const [editCategoryData, setEditCategoryData] = useState({ name: '', slug: '', icon: '', color: '' })
  const [savingCategory, setSavingCategory]     = useState(false)
  const [reorderingCategory, setReorderingCategory] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategory, setNewCategory]           = useState({ name: '', slug: '', icon: '', color: '' })
  const [deletingAll, setDeletingAll]           = useState(false)
  const [deletingPast, setDeletingPast]         = useState(false)
  const [adminFeedback, setAdminFeedback]       = useState<{ ok: boolean; msg: string } | null>(null)
  // Confirm dialog state
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void }>({
    open: false, title: '', message: '', confirmLabel: 'Confirmer', onConfirm: () => {},
  })
  function askConfirm(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
    setConfirm({ open: true, title, message, confirmLabel, onConfirm })
  }
  function closeConfirm() {
    setConfirm(c => ({ ...c, open: false }))
  }
  const [form, setForm] = useState({
    city_id: '',
    category_id: '',
    name: '',
    url: '',
    type: 'rss' as SourceType,
    active: true,
  })
  const [scrapingConfig, setScrapingConfig] = useState<ScrapingConfig>(EMPTY_SCRAPING_CONFIG)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: src }, { data: cats }, { data: cts }, { data: summaries }] = await Promise.all([
        supabase.from('sources').select('*, city:cities(id,name), category:categories(id,name,slug)').order('name'),
        supabase.from('categories').select('*').order('display_order').order('name'),
        supabase.from('cities').select('*').order('name'),
        supabase.from('import_summaries').select('*').order('created_at', { ascending: false }).limit(20),
      ])
      setSources(src ?? [])
      setCategories(cats ?? [])
      setCities(cts ?? [])
      setImportSummaries((summaries as ImportSummary[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function toggleActive(source: Source) {
    const supabase = createClient()
    await supabase.from('sources').update({ active: !source.active }).eq('id', source.id)
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, active: !s.active } : s))
  }

  async function deleteSource(id: number) {
    askConfirm(
      'Supprimer la source',
      'Cette source et ses données associées seront supprimées.',
      'Supprimer',
      async () => {
        closeConfirm()
        await fetch('/api/admin/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'sources', id }) })
        setSources(prev => prev.filter(s => s.id !== id))
      }
    )
  }

  async function addSource(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const config = form.type === 'scraping' ? buildScrapingConfig(scrapingConfig) : null
    const { data, error } = await supabase
      .from('sources')
      .insert({
        city_id: parseInt(form.city_id),
        category_id: parseInt(form.category_id),
        name: form.name,
        url: form.url,
        type: form.type,
        active: form.active,
        scraping_config: config,
      })
      .select('*, city:cities(id,name), category:categories(id,name,slug)')
      .single()
    if (!error && data) {
      setSources(prev => [...prev, data])
      setShowForm(false)
      setForm({ city_id: '', category_id: '', name: '', url: '', type: 'rss', active: true })
      setScrapingConfig(EMPTY_SCRAPING_CONFIG)
    }
  }

  function openEditConfig(source: Source) {
    setEditingSource(null)
    const cfg = source.scraping_config ?? EMPTY_SCRAPING_CONFIG
    setEditConfig({
      list_selector: cfg.list_selector ?? '',
      title_selector: cfg.title_selector ?? '',
      link_selector: cfg.link_selector ?? 'a',
      content_selector: cfg.content_selector ?? '',
      image_selector: cfg.image_selector ?? '',
      date_selector: cfg.date_selector ?? '',
      end_date_selector: cfg.end_date_selector ?? '',
      location_selector: cfg.location_selector ?? '',
      location_default: cfg.location_default ?? '',
      detail_date_selector: cfg.detail_date_selector ?? '',
      base_url: cfg.base_url ?? '',
    })
    setEditingConfig(editingConfig === source.id ? null : source.id)
  }

  async function saveEditConfig(sourceId: number) {
    setSavingConfig(true)
    const supabase = createClient()
    const config = buildScrapingConfig(editConfig)
    const { error } = await supabase
      .from('sources')
      .update({ scraping_config: config })
      .eq('id', sourceId)
    if (!error) {
      setSources(prev => prev.map(s => s.id === sourceId ? { ...s, scraping_config: config } : s))
      setEditingConfig(null)
    }
    setSavingConfig(false)
  }

  function openEditSource(source: Source) {
    setEditingConfig(null)
    setEditSourceData({ name: source.name, url: source.url, category_id: String((source.category as Category | undefined)?.id ?? '') })
    setEditingSource(editingSource === source.id ? null : source.id)
  }

  async function saveEditSource(source: Source) {
    setSavingSource(true)
    const supabase = createClient()
    const urlChanged = editSourceData.url !== source.url
    const update: Record<string, unknown> = { name: editSourceData.name, url: editSourceData.url, category_id: editSourceData.category_id ? parseInt(editSourceData.category_id) : null }
    if (urlChanged && source.type === 'scraping') update.scraping_config = null
    const { error } = await supabase.from('sources').update(update).eq('id', source.id)
    if (!error) {
      const newCategory = categories.find(c => String(c.id) === editSourceData.category_id)
      setSources(prev => prev.map(s => s.id === source.id
        ? { ...s, name: editSourceData.name, url: editSourceData.url, category: newCategory ?? s.category, scraping_config: (urlChanged && s.type === 'scraping') ? null : s.scraping_config }
        : s))
      setEditingSource(null)
    }
    setSavingSource(false)
  }

  function toSlug(name: string) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    // Une nouvelle catégorie se pose en fin de liste : l'ordre est éditorial depuis
    // qu'il est réglable à la main, l'insérer alphabétiquement au milieu déplacerait
    // silencieusement ce que l'admin a choisi.
    const nextOrder = categories.length
      ? Math.max(...categories.map(c => c.display_order)) + 10
      : 10
    const { data, error } = await supabase.from('categories')
      // icon vide → l'emoji par défaut plutôt qu'une chaîne vide : l'icône est
      // maintenant lue depuis la base pour l'affichage public, une catégorie sans
      // icône laisserait un trou dans la barre de filtres.
      .insert({ name: newCategory.name, slug: newCategory.slug || toSlug(newCategory.name), icon: newCategory.icon || '📰', color: newCategory.color, display_order: nextOrder })
      .select('*').single()
    if (!error && data) {
      setCategories(prev => [...prev, data])
      setNewCategory({ name: '', slug: '', icon: '', color: '' })
      setShowCategoryForm(false)
    }
  }

  async function saveCategory(id: number) {
    setSavingCategory(true)
    const supabase = createClient()
    const { error } = await supabase.from('categories')
      .update({ name: editCategoryData.name, slug: editCategoryData.slug, icon: editCategoryData.icon || '📰', color: editCategoryData.color })
      .eq('id', id)
    if (!error) {
      setCategories(prev => prev.map(c => c.id === id ? { ...c, ...editCategoryData, icon: editCategoryData.icon || '📰' } : c))
      setEditingCategory(null)
    }
    setSavingCategory(false)
  }

  async function deleteCategory(id: number) {
    askConfirm(
      'Supprimer la catégorie',
      'Les sources associées à cette catégorie perdront leur catégorie.',
      'Supprimer',
      async () => {
        closeConfirm()
        await fetch('/api/admin/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'categories', id }) })
        setCategories(prev => prev.filter(c => c.id !== id))
      }
    )
  }

  /**
   * Déplace une catégorie d'un cran, en échangeant son display_order avec celui de
   * sa voisine. La liste est déjà triée, donc permuter deux voisines la garde triée
   * sans re-tri.
   *
   * Mise à jour optimiste : la ligne bouge tout de suite, puis on persiste. Les deux
   * UPDATE ne sont pas transactionnels — si l'un échoue, on restaure l'affichage.
   * Même si une écriture partielle laissait deux catégories à égalité en base, le tri
   * `display_order, name` reste déterministe (départage par nom) plutôt que d'osciller
   * d'un chargement à l'autre, et un nouveau clic répare.
   */
  async function moveCategory(id: number, direction: 'up' | 'down') {
    const index = categories.findIndex(c => c.id === id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || swapIndex < 0 || swapIndex >= categories.length) return

    const current = categories[index]
    const neighbour = categories[swapIndex]
    const previous = categories

    const next = [...categories]
    next[index]     = { ...neighbour, display_order: current.display_order }
    next[swapIndex] = { ...current,   display_order: neighbour.display_order }

    setCategories(next)
    setReorderingCategory(true)

    const supabase = createClient()
    const [{ error: errorA }, { error: errorB }] = await Promise.all([
      supabase.from('categories').update({ display_order: neighbour.display_order }).eq('id', current.id),
      supabase.from('categories').update({ display_order: current.display_order }).eq('id', neighbour.id),
    ])

    if (errorA || errorB) {
      setCategories(previous)
      setAdminFeedback({ ok: false, msg: `Réordonnancement impossible : ${(errorA ?? errorB)!.message}` })
    }
    setReorderingCategory(false)
  }

  async function detectScrapingConfig(url: string) {
    if (!url) return
    setDetecting(true)
    setDetectError(null)
    setDetectPreview(null)
    try {
      const res = await fetch('/api/admin/detect-scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setDetectError(data.error ?? 'Détection échouée')
      } else {
        setScrapingConfig(data.config)
        setDetectPreview({ matchedCount: data.matchedCount, sampleTitles: data.sampleTitles })
      }
    } catch {
      setDetectError('Erreur réseau')
    }
    setDetecting(false)
  }

  async function detectEditConfig(url: string) {
    if (!url) return
    setDetectingConfig(true)
    setDetectConfigError(null)
    try {
      const res = await fetch('/api/admin/detect-scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setDetectConfigError(data.error ?? 'Détection échouée')
      } else {
        setEditConfig(data.config)
      }
    } catch {
      setDetectConfigError('Erreur réseau')
    }
    setDetectingConfig(false)
  }

  async function deleteAllArticles() {
    askConfirm(
      'Tout supprimer',
      'Supprimer tous les articles importés ? Cette action est irréversible.',
      'Tout supprimer',
      async () => {
        closeConfirm()
        setDeletingAll(true)
        setRefreshResult(null)
        setRefreshError(null)
        setAdminFeedback(null)
        setFetchResult({})
        try {
          const res = await fetch('/api/admin/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'articles' }) })
          const data = await res.json()
          if (!res.ok || !data.ok) {
            setRefreshError('Erreur lors de la suppression : ' + (data.error ?? 'inconnue'))
          } else {
            setAdminFeedback({ ok: true, msg: 'Tous les articles ont été supprimés.' })
          }
        } catch {
          setRefreshError('Erreur réseau')
        }
        setDeletingAll(false)
      }
    )
  }

  async function deletePastArticlesBeforeWeekStart() {
    askConfirm(
      'Supprimer les actus passées',
      'Supprimer les actus passées avant le lundi 00:00 de la semaine en cours (date de fin si présente, sinon date publiée) ? Cette action est irréversible.',
      'Supprimer les actus passées',
      async () => {
        closeConfirm()
        setDeletingPast(true)
        setRefreshResult(null)
        setRefreshError(null)
        setAdminFeedback(null)
        setFetchResult({})
        try {
          const res = await fetch('/api/admin/clear-articles', { method: 'POST' })
          const data = await res.json()
          if (!res.ok || !data.ok) {
            setRefreshError('Erreur lors de la suppression : ' + (data.error ?? 'inconnue'))
          } else {
            const thresholdLabel = data.threshold
              ? new Date(data.threshold as string).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
              : 'lundi en cours'
            setAdminFeedback({
              ok: true,
              msg: `${data.deleted ?? 0} article(s) passé(s) supprimé(s) avant ${thresholdLabel}.`,
            })
          }
        } catch {
          setRefreshError('Erreur réseau')
        }
        setDeletingPast(false)
      }
    )
  }

  async function refreshAllSources() {
    setRefreshing(true)
    setRefreshResult(null)
    setRefreshError(null)
    setFetchResult({})
    try {
      const res = await fetch('/api/admin/refresh', { method: 'POST' })
      const data = await res.json()
      if (res.status === 401) {
        setRefreshError('Vous devez être connecté pour rafraîchir les sources.')
      } else if (data.ok) {
        setRefreshResult(data.summary)
        if (Array.isArray(data.results)) {
          const byId: Record<number, FetchResultDetail> = {}
          for (const r of data.results as FetchResultDetail[]) byId[r.sourceId] = r
          setFetchResult(byId)
        }
      } else {
        setRefreshError(data.error ?? 'Erreur inconnue')
      }
    } catch {
      setRefreshError('Erreur réseau')
    }
    setRefreshing(false)
  }

  async function testFetch(sourceId: number) {
    setFetching(sourceId)
    setFetchResult(prev => ({ ...prev, [sourceId]: { sourceId, fetched: 0, inserted: 0, skipped: 0, errors: [] } }))
    try {
      const res = await fetch('/api/admin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId }),
      })
      const data = await res.json()
      if (res.status === 401) {
        setFetchResult(prev => ({ ...prev, [sourceId]: { sourceId, fetched: 0, inserted: 0, skipped: 0, errors: ['🔒 Non connecté'] } }))
      } else if (data.ok && Array.isArray(data.results) && data.results.length > 0) {
        setFetchResult(prev => ({ ...prev, [sourceId]: data.results[0] as FetchResultDetail }))
      } else {
        setFetchResult(prev => ({ ...prev, [sourceId]: { sourceId, fetched: 0, inserted: 0, skipped: 0, errors: [data.error ?? 'Erreur inconnue'] } }))
      }
    } catch {
      setFetchResult(prev => ({ ...prev, [sourceId]: { sourceId, fetched: 0, inserted: 0, skipped: 0, errors: ['Erreur réseau'] } }))
    }
    setFetching(null)
  }

  /**
   * Purge de tout l'historique des résumés IA.
   *
   * Un `/api/admin/delete` **sans `id`** est un vrai DELETE, contrairement au cas des
   * articles où il vaut masquage : rien ne recrée un résumé au prochain cron, aucune
   * ingestion n'appelle le LLM. La purge est donc définitive, et toutes villes
   * confondues — comme la liste affichée ici, qui n'est pas filtrée par ville.
   */
  async function deleteAllImportSummaries() {
    askConfirm(
      'Supprimer les historiques des résumés',
      `Supprimer définitivement l'historique complet des résumés IA (${importSummaries.length} affiché(s), toutes villes confondues) ? Cette action est irréversible.`,
      'Supprimer les historiques',
      async () => {
        closeConfirm()
        setClearingSummaries(true)
        setSummarizeError(null)
        setAdminFeedback(null)
        try {
          const res = await fetch('/api/admin/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'import_summaries' }),
          })
          const data = await res.json()
          if (!res.ok || !data.ok) {
            setSummarizeError(data.error ?? 'Erreur lors de la suppression des résumés')
          } else {
            setImportSummaries([])
            setAdminFeedback({ ok: true, msg: 'Historique des résumés IA supprimé.' })
          }
        } catch {
          setSummarizeError('Erreur réseau')
        }
        setClearingSummaries(false)
      }
    )
  }

  async function deleteImportSummary(id: number) {
    askConfirm(
      'Supprimer le résumé IA',
      'Supprimer ce résumé de l’historique ? Cette action est irréversible.',
      'Supprimer',
      async () => {
        closeConfirm()
        setDeletingSummaryId(id)
        try {
          const res = await fetch('/api/admin/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'import_summaries', id }),
          })
          const data = await res.json()
          if (!res.ok || !data.ok) {
            setSummarizeError(data.error ?? 'Erreur lors de la suppression du résumé')
          } else {
            setImportSummaries(prev => prev.filter(summary => summary.id !== id))
          }
        } catch {
          setSummarizeError('Erreur réseau')
        }
        setDeletingSummaryId(null)
      }
    )
  }

  const filteredSummaries = importSummaries.filter((summary) => (
    summarySourceFilter === 'all' ? true : summary.source === summarySourceFilter
  ))

  if (loading) return <p className="py-8 text-center text-subhead text-ink-muted">Chargement…</p>

  return (
    <div className="flex flex-col gap-6">
      {/* ── Gestion des sources ── */}
      <section className="flex flex-col gap-4">
        <SectionToggle
          icon={Rss}
          title="Gestion des sources"
          count={sources.length}
          open={sourcesOpen}
          onToggle={() => setSourcesOpen(o => !o)}
        />

        {sourcesOpen && (
        <div className="flex flex-col gap-4">
      {/* Actions — des lignes libellées plutôt qu'une barre d'icônes : sur téléphone, les
          libellés étaient masqués et trois corbeilles identiques ne se distinguaient que
          par une infobulle, que le toucher n'affiche jamais. Le sous-titre la remplace. */}
      <ListSection>
        <ListRow
          leading={<RowIcon icon={Plus} />}
          title="Ajouter une source"
          tone="accent"
          onClick={() => setShowForm(!showForm)}
        />
        <ListRow
          leading={<RowIcon icon={RefreshCw} className={cn(refreshing && 'animate-spin')} />}
          title={refreshing ? 'Rafraîchissement…' : 'Rafraîchir les sources'}
          tone="accent"
          onClick={refreshAllSources}
          disabled={refreshing || deletingAll || deletingPast}
        />
      </ListSection>

      <ListSection header="Nettoyage">
        <ListRow
          leading={<RowIcon icon={Trash2} tone="danger" className={cn(deletingPast && 'animate-pulse')} />}
          title={deletingPast ? 'Suppression…' : 'Supprimer les actus passées'}
          subtitle="Avant le lundi de la semaine en cours"
          tone="danger"
          onClick={deletePastArticlesBeforeWeekStart}
          disabled={deletingPast || deletingAll || refreshing}
        />
        <ListRow
          leading={<RowIcon icon={Trash2} tone="danger" className={cn(deletingAll && 'animate-pulse')} />}
          title={deletingAll ? 'Suppression…' : 'Tout supprimer'}
          subtitle="Tous les articles importés"
          tone="danger"
          onClick={deleteAllArticles}
          disabled={deletingAll || deletingPast || refreshing}
        />
        {/* La génération vit dans l'onglet « Résumés IA » : le bouton qui était ici
            faisait doublon. Ne reste que la purge de l'historique, qui n'a pas
            d'équivalent ailleurs — l'onglet ne supprime qu'un résumé à la fois. */}
        <ListRow
          leading={<RowIcon icon={Trash2} tone="danger" className={cn(clearingSummaries && 'animate-pulse')} />}
          title={clearingSummaries ? 'Suppression…' : 'Supprimer les résumés'}
          subtitle="Tout l'historique des résumés IA"
          tone="danger"
          onClick={deleteAllImportSummaries}
          disabled={clearingSummaries || refreshing || importSummaries.length === 0}
        />
      </ListSection>

      {/* Refresh error */}
      {refreshError && (
        <Notice tone="danger" action={<DismissButton onClick={() => setRefreshError(null)} />}>
          {refreshError}
        </Notice>
      )}

      {adminFeedback && (
        <Notice
          tone={adminFeedback.ok ? 'success' : 'danger'}
          action={<DismissButton onClick={() => setAdminFeedback(null)} />}
        >
          {adminFeedback.msg}
        </Notice>
      )}

      {/* Refresh result banner — en avertissement s'il y a eu des erreurs */}
      {refreshResult && (
        <Notice
          tone={refreshResult.errors > 0 ? 'warn' : 'success'}
          action={<DismissButton onClick={() => setRefreshResult(null)} />}
        >
          {refreshResult.sources} source(s) — {refreshResult.fetched} article(s) récupéré(s),{' '}
          <strong>{refreshResult.inserted} ajouté(s)</strong>, {refreshResult.updated ?? 0} mis à jour,{' '}
          {refreshResult.unchanged ?? 0} inchangé(s)
          {refreshResult.errors > 0 && `, ${refreshResult.errors} erreur(s)`}
        </Notice>
      )}

      {/* Summarize error */}
      {summarizeError && (
        <Notice tone="danger" action={<DismissButton onClick={() => setSummarizeError(null)} />}>
          {summarizeError}
        </Notice>
      )}

      {/* Summary history */}
      {importSummaries.length > 0 && (
        <div className="overflow-hidden rounded-[14px] bg-card">
          <button
            type="button"
            onClick={() => setShowSummaryHistory(v => !v)}
            aria-expanded={showSummaryHistory}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left focus-ring active:bg-fill-soft"
          >
            <RowIcon icon={Sparkles} />
            <span className="min-w-0 flex-1 text-body text-ink">Historique des résumés IA</span>
            <span className="text-body tabular-nums text-ink-muted">{importSummaries.length}</span>
            <ChevronDown
              size={18}
              strokeWidth={2.4}
              className={cn('shrink-0 text-ink-faint transition-transform', showSummaryHistory && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {showSummaryHistory && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-separator px-4 py-3">
                <Segmented
                  label="Filtrer les résumés"
                  value={summarySourceFilter}
                  onChange={setSummarySourceFilter}
                  options={SUMMARY_FILTERS}
                  className="w-full sm:w-auto sm:min-w-80"
                  itemClassName="h-8 text-footnote"
                />
                <span className="text-footnote text-ink-muted">{filteredSummaries.length} résultat(s)</span>
              </div>
              {filteredSummaries.map(s => (
                <article key={s.id} className="border-t border-separator px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-ink-muted">
                      <span>{new Date(s.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-caption font-semibold',
                        s.source === 'refresh' ? 'bg-fill-soft text-ink-muted' : 'bg-accent-soft text-accent'
                      )}>
                        {s.source === 'refresh' ? 'Refresh' : 'À la demande'}
                      </span>
                      <span>{s.articles_count} article(s)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteImportSummary(s.id)}
                      disabled={deletingSummaryId === s.id}
                      title="Supprimer ce résumé"
                      className={buttonClass('danger', 'md', 'shrink-0')}
                    >
                      <Trash2 size={16} className={cn(deletingSummaryId === s.id && 'animate-pulse')} aria-hidden="true" />
                      Supprimer
                    </button>
                  </div>
                  <div
                    className="space-y-3 text-subhead leading-relaxed text-ink [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:mb-1 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: formatDigestHtml(s.summary_text) }}
                  />
                </article>
              ))}
              {filteredSummaries.length === 0 && (
                <p className="border-t border-separator px-4 py-6 text-subhead text-ink-muted">
                  Aucun résumé IA pour ce filtre.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={addSource} className="flex flex-col gap-4 rounded-[14px] bg-card p-4 sm:p-5">
          <h3 className="text-headline text-ink">Nouvelle source</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ville">
              <select required value={form.city_id} onChange={e => setForm(f => ({ ...f, city_id: e.target.value }))}
                className={fieldClass('card')}>
                <option value="">Choisir…</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Catégorie">
              <select required value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className={fieldClass('card')}>
                <option value="">Choisir…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Nom">
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={fieldClass('card')} placeholder="Mairie — Actualités" />
            </Field>
            <Field label="URL">
              <div className="flex gap-2">
                <input required type="url" value={form.url} onChange={e => { setForm(f => ({ ...f, url: e.target.value })); setDetectPreview(null); setDetectError(null) }}
                  className={fieldClass('card', 'min-w-0 flex-1')} placeholder="https://…" />
                {form.type === 'scraping' && (
                  <button
                    type="button"
                    onClick={() => detectScrapingConfig(form.url)}
                    disabled={detecting || !form.url}
                    title="Détecter automatiquement les sélecteurs CSS"
                    className={buttonClass('secondary', 'md', 'shrink-0')}
                  >
                    <Wand2 size={16} className={cn(detecting && 'animate-pulse')} aria-hidden="true" />
                    {detecting ? 'Détection…' : 'Détecter'}
                  </button>
                )}
              </div>
            </Field>
            <Field label="Type">
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as SourceType }))}
                className={fieldClass('card')}>
                <option value="rss">RSS</option>
                <option value="scraping">Scraping</option>
                <option value="opendata">Open Data</option>
              </select>
              {form.type === 'opendata' && (
                <p className="mt-1.5 text-footnote text-ink-muted">
                  Coller l&apos;URL complète d&apos;une API Opendatasoft (<code className="font-mono">…/records?where=…</code>) —
                  le filtre ODSQL fait office de configuration, il n&apos;y a pas de sélecteurs à saisir.
                </p>
              )}
            </Field>
            {/* Ligne de Réglages : libellé à gauche, interrupteur à droite. Le <label>
                englobe le bouton de l'interrupteur, si bien qu'un appui sur le texte le
                bascule, comme le faisait la case à cocher d'origine. `sm:mt-6` l'aligne
                sur les champs voisins, qui portent un libellé au-dessus. Posée à même la
                carte, sans fond gris : la piste éteinte (`bg-fill`) y disparaîtrait,
                fill et fill-soft étant la même teinte en mode sombre. */}
            <label className="flex min-h-11 items-center justify-between gap-3 self-start sm:mt-6">
              <span className="text-body text-ink">Activer immédiatement</span>
              <Switch
                checked={form.active}
                onChange={active => setForm(f => ({ ...f, active }))}
                label="Activer immédiatement"
              />
            </label>
          </div>

          {form.type === 'scraping' && (
            <>
              {detectError && <Notice tone="danger">{detectError}</Notice>}
              {detectPreview && (
                <Notice tone="success">
                  <p className="font-medium">{detectPreview.matchedCount} élément(s) détecté(s) — aperçu :</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {detectPreview.sampleTitles.map((t, i) => <li key={i} className="truncate">{t}</li>)}
                  </ul>
                </Notice>
              )}
              <ScrapingConfigFields config={scrapingConfig} onChange={setScrapingConfig} required />
            </>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" size="md">Enregistrer</Button>
            <Button variant="plain" size="md" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </form>
      )}

      {/* Sources — une seule liste groupée, du téléphone au bureau. Elle remplace la
          paire « cartes sous 640 px / tableau au-delà », qui dupliquait toute la ligne
          et ses deux éditeurs en ligne. Chaque ligne porte les mêmes informations que
          les anciennes colonnes : type, catégorie, santé, interrupteur d'activation. */}
      <ListSection header="Sources">
        {sources.map((source) => {
          const result = fetchResult[source.id]
          const categoryName = (source.category as Category | undefined)?.name
          return (
            <div key={source.id} className="border-t border-separator px-4 py-3 first:border-t-0">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold text-ink">{source.name}</p>
                  <p className="truncate text-footnote text-ink-muted">{source.url}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={cn('rounded-full px-2 py-0.5 text-caption font-semibold tracking-[0.3px]', SOURCE_TYPE_BADGE[source.type])}>
                      {SOURCE_TYPE_LABEL[source.type]}
                    </span>
                    {categoryName && <span className="text-footnote text-ink-muted">{categoryName}</span>}
                    <SourceHealthBadge source={source} />
                    {source.type === 'scraping' && !source.scraping_config && (
                      // En toutes lettres : l'icône seule ne s'expliquait que par une
                      // infobulle, absente au toucher.
                      <span className="inline-flex items-center gap-1 text-footnote font-medium text-warn">
                        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                        Config scraping manquante
                      </span>
                    )}
                  </div>
                  {result && <FetchResultLine result={result} />}
                </div>
                <div className="-mt-1.5 -mr-1 shrink-0">
                  <Switch
                    checked={source.active}
                    onChange={() => toggleActive(source)}
                    label={`Source « ${source.name} » active`}
                  />
                </div>
              </div>

              <div className="-ml-2.5 mt-1 flex items-center gap-1">
                {/*
                  Un <a> et non un <button> + window.open : le clic du milieu, « ouvrir
                  dans un nouvel onglet » et la copie du lien continuent de marcher, et
                  l'URL est visible dans la barre d'état au survol — précisément ce qu'on
                  veut vérifier ici. `noreferrer` en plus de `noopener` pour ne pas
                  annoncer l'URL d'administration au site source.
                */}
                <a href={source.url} target="_blank" rel="noopener noreferrer"
                  className={ICON_BUTTON} title="Ouvrir le lien dans un nouvel onglet">
                  <ExternalLink size={18} aria-hidden="true" />
                </a>
                <button type="button" onClick={() => testFetch(source.id)} disabled={fetching === source.id}
                  className={ICON_BUTTON} title="Tester le fetch">
                  <RefreshCw size={18} className={cn(fetching === source.id && 'animate-spin')} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => openEditSource(source)}
                  aria-pressed={editingSource === source.id}
                  className={cn(ICON_BUTTON, editingSource === source.id && 'bg-accent-soft')} title="Éditer nom / URL">
                  <Pencil size={18} aria-hidden="true" />
                </button>
                {source.type === 'scraping' && (
                  <button type="button" onClick={() => openEditConfig(source)}
                    aria-pressed={editingConfig === source.id}
                    className={cn(ICON_BUTTON, editingConfig === source.id && 'bg-accent-soft')} title="Éditer la config scraping">
                    <Settings size={18} aria-hidden="true" />
                  </button>
                )}
                {/* Écartée des autres : une suppression ne doit pas tomber sous le pouce
                    qui visait « Éditer ». */}
                <button type="button" onClick={() => deleteSource(source.id)}
                  className={cn(ICON_BUTTON_DANGER, 'ml-auto -mr-2.5')} title="Supprimer">
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>

              {editingSource === source.id && (
                <div className="mt-2 flex flex-col gap-3 rounded-xl bg-fill-soft p-3 sm:p-4">
                  <p className={PANEL_TITLE}>Éditer — {source.name}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Nom">
                      <input value={editSourceData.name} onChange={e => setEditSourceData(d => ({ ...d, name: e.target.value }))}
                        className={fieldClass('fill')} />
                    </Field>
                    <Field label="URL">
                      <input type="url" value={editSourceData.url} onChange={e => setEditSourceData(d => ({ ...d, url: e.target.value }))}
                        className={fieldClass('fill')} />
                    </Field>
                    <Field label="Catégorie">
                      <select value={editSourceData.category_id} onChange={e => setEditSourceData(d => ({ ...d, category_id: e.target.value }))}
                        className={fieldClass('fill')}>
                        <option value="">— Aucune —</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  {source.type === 'scraping' && editSourceData.url !== source.url && (
                    <Notice tone="warn">
                      L&apos;URL a changé — la configuration scraping sera réinitialisée. Pensez à la reconfigurer via ⚙️.
                    </Notice>
                  )}
                  <div className="flex gap-2">
                    <Button size="md" onClick={() => saveEditSource(source)} disabled={savingSource}>
                      {savingSource ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                    <Button variant="plain" size="md" onClick={() => setEditingSource(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              )}

              {source.type === 'scraping' && editingConfig === source.id && (
                <div className="mt-2 flex flex-col gap-3 rounded-xl bg-fill-soft p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className={PANEL_TITLE}>Config scraping — {source.name}</p>
                    <button
                      type="button"
                      onClick={() => detectEditConfig(source.url)}
                      disabled={detectingConfig}
                      title="Détecter automatiquement les sélecteurs CSS"
                      className={buttonClass('secondary', 'md', 'shrink-0')}
                    >
                      <Wand2 size={16} className={cn(detectingConfig && 'animate-pulse')} aria-hidden="true" />
                      {detectingConfig ? 'Détection…' : 'Détecter'}
                    </button>
                  </div>
                  {detectConfigError && <Notice tone="danger">{detectConfigError}</Notice>}
                  <ScrapingConfigFields config={editConfig} onChange={setEditConfig} required nested />
                  <div className="flex gap-2">
                    <Button size="md" onClick={() => saveEditConfig(source.id)} disabled={savingConfig}>
                      {savingConfig ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                    <Button variant="plain" size="md" onClick={() => setEditingConfig(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {sources.length === 0 && (
          <p className="px-4 py-12 text-center text-subhead text-ink-muted">Aucune source configurée</p>
        )}
      </ListSection>
        </div>
        )}
      </section>

      {/* ── Gestion des catégories ── */}
      <section className="flex flex-col gap-4">
        <SectionToggle
          icon={Tags}
          title="Gestion des catégories"
          count={categories.length}
          open={categoriesOpen}
          onToggle={() => setCategoriesOpen(o => !o)}
        />

        {categoriesOpen && (
          <ListSection footer="La tuile est celle que verra le public : teinte et icône viennent de lib/category-style.ts, indexé par slug. Une catégorie qui n'y figure pas prend l'ardoise par défaut.">
            {/* Existing categories */}
            {categories.map((cat, index) => (
              editingCategory === cat.id ? (
                <div key={cat.id} className="flex flex-col gap-3 border-t border-separator px-4 py-3 first:border-t-0">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Nom" className="col-span-2 sm:col-span-1">
                      <input value={editCategoryData.name}
                        onChange={e => setEditCategoryData(d => ({ ...d, name: e.target.value }))}
                        className={fieldClass('card')} />
                    </Field>
                    <Field label="Slug" className="col-span-2 sm:col-span-1">
                      <input value={editCategoryData.slug}
                        onChange={e => setEditCategoryData(d => ({ ...d, slug: e.target.value }))}
                        className={fieldClass('card', 'font-mono')} />
                    </Field>
                    <Field label="Icône">
                      <input value={editCategoryData.icon}
                        onChange={e => setEditCategoryData(d => ({ ...d, icon: e.target.value }))}
                        className={fieldClass('card')} placeholder="🏛️" />
                    </Field>
                    <Field label="Couleur">
                      <input value={editCategoryData.color}
                        onChange={e => setEditCategoryData(d => ({ ...d, color: e.target.value }))}
                        className={fieldClass('card')} placeholder="blue" />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <Button size="md" onClick={() => saveCategory(cat.id)} disabled={savingCategory}>
                      {savingCategory ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                    <Button variant="plain" size="md" onClick={() => setEditingCategory(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <ListRow
                  key={cat.id}
                  leading={<CategoryTile slug={cat.slug} />}
                  title={cat.name}
                  subtitle={<><span className="font-mono">{cat.slug}</span>{cat.icon && ` · ${cat.icon}`}</>}
                  trailing={
                    <div className="-mr-2 flex shrink-0 items-center">
                      <button type="button" onClick={() => moveCategory(cat.id, 'up')}
                        disabled={index === 0 || reorderingCategory}
                        className={ICON_BUTTON} title="Monter">
                        <ArrowUp size={18} aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => moveCategory(cat.id, 'down')}
                        disabled={index === categories.length - 1 || reorderingCategory}
                        className={ICON_BUTTON} title="Descendre">
                        <ArrowDown size={18} aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => { setEditCategoryData({ name: cat.name, slug: cat.slug, icon: cat.icon ?? '', color: cat.color ?? '' }); setEditingCategory(cat.id) }}
                        className={ICON_BUTTON} title="Éditer">
                        <Pencil size={18} aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => deleteCategory(cat.id)}
                        className={ICON_BUTTON_DANGER} title="Supprimer">
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </div>
                  }
                />
              )
            ))}

            {/* Add category form */}
            {showCategoryForm ? (
              <form onSubmit={addCategory} className="flex flex-col gap-3 border-t border-separator px-4 py-4 first:border-t-0">
                <p className={PANEL_TITLE}>Nouvelle catégorie</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label={<>Nom <span className="text-danger">*</span></>} className="col-span-2 sm:col-span-1">
                    <input required value={newCategory.name}
                      onChange={e => setNewCategory(d => ({ ...d, name: e.target.value, slug: toSlug(e.target.value) }))}
                      className={fieldClass('card')} placeholder="Vie locale" />
                  </Field>
                  <Field label="Slug" className="col-span-2 sm:col-span-1">
                    <input value={newCategory.slug}
                      onChange={e => setNewCategory(d => ({ ...d, slug: e.target.value }))}
                      className={fieldClass('card', 'font-mono')} placeholder="auto-généré" />
                  </Field>
                  <Field label="Icône">
                    <input value={newCategory.icon}
                      onChange={e => setNewCategory(d => ({ ...d, icon: e.target.value }))}
                      className={fieldClass('card')} placeholder="🏛️" />
                  </Field>
                  <Field label="Couleur">
                    <input value={newCategory.color}
                      onChange={e => setNewCategory(d => ({ ...d, color: e.target.value }))}
                      className={fieldClass('card')} placeholder="blue" />
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="md">Créer</Button>
                  <Button variant="plain" size="md" onClick={() => setShowCategoryForm(false)}>
                    Annuler
                  </Button>
                </div>
              </form>
            ) : (
              <ListRow
                leading={<RowIcon icon={Plus} />}
                title="Ajouter une catégorie"
                tone="accent"
                onClick={() => setShowCategoryForm(true)}
              />
            )}
          </ListSection>
        )}
      </section>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        destructive
        onConfirm={confirm.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  )
}

/**
 * Sélecteurs CSS d'une source scraping. Les saisies sont blanches sur fond gris : dans
 * le formulaire d'ajout, le bloc porte son propre encart gris ; `nested` le retire quand
 * il est déjà posé dans l'encart d'édition en ligne, qui a son propre titre.
 */
function ScrapingConfigFields({
  config,
  onChange,
  required,
  nested,
}: {
  config: ScrapingConfig
  onChange: (c: ScrapingConfig) => void
  required?: boolean
  nested?: boolean
}) {
  const input = fieldClass('fill', 'font-mono')
  const hint = 'font-normal'
  const requiredMark = required && <span className="text-danger">*</span>
  return (
    <div className={cn('flex flex-col gap-3', !nested && 'rounded-xl bg-fill-soft p-4')}>
      {!nested && <p className={PANEL_TITLE}>Configuration scraping (sélecteurs CSS)</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={<>Sélecteur liste {requiredMark}</>}>
          <input required={required} value={config.list_selector}
            onChange={e => onChange({ ...config, list_selector: e.target.value })}
            className={input}
            placeholder="article, .news-item, li.event" />
        </Field>
        <Field label={<>Sélecteur titre {requiredMark}</>}>
          <input required={required} value={config.title_selector}
            onChange={e => onChange({ ...config, title_selector: e.target.value })}
            className={input}
            placeholder="h2, h3, .title" />
        </Field>
        <Field label="Sélecteur lien">
          <input value={config.link_selector}
            onChange={e => onChange({ ...config, link_selector: e.target.value })}
            className={input}
            placeholder="a" />
        </Field>
        <Field label="Sélecteur contenu">
          <input value={config.content_selector ?? ''}
            onChange={e => onChange({ ...config, content_selector: e.target.value })}
            className={input}
            placeholder="p, .summary" />
        </Field>
        <Field label="Sélecteur image">
          <input value={config.image_selector ?? ''}
            onChange={e => onChange({ ...config, image_selector: e.target.value })}
            className={input}
            placeholder="img" />
        </Field>
        <Field label="Sélecteur date début">
          <input value={config.date_selector ?? ''}
            onChange={e => onChange({ ...config, date_selector: e.target.value })}
            className={input}
            placeholder='[itemprop="startDate"], time, .date' />
        </Field>
        <Field label={<>Sélecteur date fin <span className={hint}>(événements multi-jours)</span></>}>
          <input value={config.end_date_selector ?? ''}
            onChange={e => onChange({ ...config, end_date_selector: e.target.value })}
            className={input}
            placeholder='[itemprop="endDate"]' />
        </Field>
        <Field label={<>Sélecteur lieu <span className={hint}>(pour « ajouter au calendrier »)</span></>}>
          <input value={config.location_selector ?? ''}
            onChange={e => onChange({ ...config, location_selector: e.target.value })}
            className={input}
            placeholder='.lieu, [itemprop="location"]' />
        </Field>
        <Field label={<>Lieu fixe <span className={hint}>(si tous les événements ont lieu au même endroit)</span></>}>
          {/* Texte libre, pas un sélecteur : police courante */}
          <input value={config.location_default ?? ''}
            onChange={e => onChange({ ...config, location_default: e.target.value })}
            className={fieldClass('fill')}
            placeholder="Salle, Ville" />
        </Field>
        <Field
          className="sm:col-span-2"
          label={<>Sélecteur date sur page détail <span className={hint}>(si les dates sont absentes de la liste — format &quot;Du X au Y mois&quot;)</span></>}
        >
          <input value={config.detail_date_selector ?? ''}
            onChange={e => onChange({ ...config, detail_date_selector: e.target.value })}
            className={input}
            placeholder='.date, .event-date' />
        </Field>
        <Field label="URL de base (si liens relatifs)" className="sm:col-span-2">
          <input value={config.base_url ?? ''}
            onChange={e => onChange({ ...config, base_url: e.target.value })}
            className={input}
            placeholder="https://exemple.fr" />
        </Field>
      </div>
    </div>
  )
}

function buildScrapingConfig(c: ScrapingConfig): ScrapingConfig {
  const config: ScrapingConfig = {
    list_selector: c.list_selector,
    title_selector: c.title_selector,
    link_selector: c.link_selector || 'a',
  }
  if (c.content_selector)        config.content_selector        = c.content_selector
  if (c.image_selector)          config.image_selector          = c.image_selector
  if (c.date_selector)           config.date_selector           = c.date_selector
  if (c.end_date_selector)       config.end_date_selector       = c.end_date_selector
  if (c.detail_date_selector)    config.detail_date_selector    = c.detail_date_selector
  if (c.location_selector)       config.location_selector       = c.location_selector
  if (c.location_default)        config.location_default        = c.location_default
  if (c.base_url)                config.base_url                = c.base_url
  return config
}
