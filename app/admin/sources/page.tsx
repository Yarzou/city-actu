'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, Settings } from 'lucide-react'
import type { Source, Category, City, ScrapingConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

const EMPTY_SCRAPING_CONFIG: ScrapingConfig = {
  list_selector: '',
  title_selector: '',
  link_selector: 'a',
  content_selector: '',
  image_selector: '',
  date_selector: '',
  base_url: '',
}

interface FetchResultDetail {
  sourceId: number
  fetched: number
  inserted: number
  skipped: number
  errors: string[]
}

export default function AdminSourcesPage() {
  const [sources, setSources]       = useState<Source[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cities, setCities]         = useState<City[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [fetching, setFetching]     = useState<number | null>(null)
  const [fetchResult, setFetchResult] = useState<Record<number, FetchResultDetail>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{
    sources: number; fetched: number; inserted: number; skipped: number; errors: number
  } | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  // Inline edit scraping config
  const [editingConfig, setEditingConfig] = useState<number | null>(null)
  const [editConfig, setEditConfig] = useState<ScrapingConfig>(EMPTY_SCRAPING_CONFIG)
  const [savingConfig, setSavingConfig] = useState(false)

  // Form state
  const [form, setForm] = useState({
    city_id: '',
    category_id: '',
    name: '',
    url: '',
    type: 'rss' as 'rss' | 'scraping',
    active: true,
  })
  const [scrapingConfig, setScrapingConfig] = useState<ScrapingConfig>(EMPTY_SCRAPING_CONFIG)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: src }, { data: cats }, { data: cts }] = await Promise.all([
        supabase.from('sources').select('*, city:cities(id,name), category:categories(id,name,slug)').order('name'),
        supabase.from('categories').select('*').order('name'),
        supabase.from('cities').select('*').order('name'),
      ])
      setSources(src ?? [])
      setCategories(cats ?? [])
      setCities(cts ?? [])
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
    if (!confirm('Supprimer cette source ?')) return
    const supabase = createClient()
    await supabase.from('sources').delete().eq('id', id)
    setSources(prev => prev.filter(s => s.id !== id))
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
    const cfg = source.scraping_config ?? EMPTY_SCRAPING_CONFIG
    setEditConfig({
      list_selector: cfg.list_selector ?? '',
      title_selector: cfg.title_selector ?? '',
      link_selector: cfg.link_selector ?? 'a',
      content_selector: cfg.content_selector ?? '',
      image_selector: cfg.image_selector ?? '',
      date_selector: cfg.date_selector ?? '',
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
        // Populate per-source results
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

  if (loading) return <div className="p-8 text-gray-400">Chargement…</div>

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des sources</h1>
          <p className="text-sm text-gray-500 mt-0.5">{sources.length} source(s) configurée(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAllSources}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            {refreshing ? 'Rafraîchissement…' : 'Rafraîchir les sources'}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="size-4" />
            Ajouter
          </button>
        </div>
      </div>

      {/* Refresh error */}
      {refreshError && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-sm text-red-800">
          <span>❌ {refreshError}</span>
          <button onClick={() => setRefreshError(null)} className="ml-4 text-red-600 hover:text-red-800">✕</button>
        </div>
      )}

      {/* Refresh result banner */}
      {refreshResult && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6 text-sm text-green-800">
          <span>
            ✅ {refreshResult.sources} source(s) — {refreshResult.fetched} article(s) récupéré(s),{' '}
            <strong>{refreshResult.inserted} ajouté(s)</strong>, {refreshResult.skipped} ignoré(s)
            {refreshResult.errors > 0 && `, ${refreshResult.errors} erreur(s)`}
          </span>
          <button onClick={() => setRefreshResult(null)} className="ml-4 text-green-600 hover:text-green-800">✕</button>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={addSource} className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Nouvelle source</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ville</label>
              <select required value={form.city_id} onChange={e => setForm(f => ({ ...f, city_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Choisir…</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
              <select required value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Choisir…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Mairie — Actualités" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
              <input required type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="https://…" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'rss' | 'scraping' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="rss">RSS</option>
                <option value="scraping">Scraping</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" id="active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              <label htmlFor="active" className="text-sm text-gray-700">Activer immédiatement</label>
            </div>
          </div>

          {form.type === 'scraping' && (
            <ScrapingConfigFields config={scrapingConfig} onChange={setScrapingConfig} required />
          )}

          <div className="flex gap-2 pt-2">
            <button type="submit" className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
              Enregistrer
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50">
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Sources table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Catégorie</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sources.map((source) => {
              const result = fetchResult[source.id]
              const hasErrors = result && result.errors.length > 0
              return (
                <>
                  <tr key={source.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900">{source.name}</span>
                        {source.type === 'scraping' && !source.scraping_config && (
                          <span title="Config scraping manquante">
                            <AlertTriangle className="size-3.5 text-orange-400 shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 truncate max-w-xs">{source.url}</div>
                      {result && (
                        <div className={cn('text-xs mt-1', hasErrors ? 'text-red-600' : 'text-green-600')}>
                          {hasErrors
                            ? result.errors.map((e, i) => <div key={i}>❌ {e}</div>)
                            : `✅ ${result.fetched} récupérés, ${result.inserted} ajoutés`
                          }
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-600">
                      {(source.category as Category | undefined)?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        source.type === 'rss' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700')}>
                        {source.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(source)} title="Activer / désactiver">
                        {source.active
                          ? <CheckCircle className="size-5 text-brand-500" />
                          : <XCircle className="size-5 text-gray-300" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => testFetch(source.id)}
                          disabled={fetching === source.id}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
                          title="Tester le fetch"
                        >
                          <RefreshCw className={cn('size-4', fetching === source.id && 'animate-spin')} />
                        </button>
                        {source.type === 'scraping' && (
                          <button
                            onClick={() => openEditConfig(source)}
                            className={cn('p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors',
                              editingConfig === source.id && 'text-brand-600 bg-brand-50')}
                            title="Éditer la config scraping"
                          >
                            <Settings className="size-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteSource(source.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Inline scraping config editor */}
                  {source.type === 'scraping' && editingConfig === source.id && (
                    <tr key={`${source.id}-config`}>
                      <td colSpan={5} className="px-4 pb-4 pt-0">
                        <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-3">
                          <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">
                            Config scraping — {source.name}
                          </p>
                          <ScrapingConfigFields config={editConfig} onChange={setEditConfig} required />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEditConfig(source.id)}
                              disabled={savingConfig}
                              className="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
                            >
                              {savingConfig ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                            <button
                              onClick={() => setEditingConfig(null)}
                              className="px-3 py-1.5 border border-gray-200 text-xs rounded-lg hover:bg-gray-50"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
        {sources.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">Aucune source configurée</div>
        )}
      </div>
    </div>
  )
}

function ScrapingConfigFields({
  config,
  onChange,
  required,
}: {
  config: ScrapingConfig
  onChange: (c: ScrapingConfig) => void
  required?: boolean
}) {
  return (
    <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">Configuration scraping (sélecteurs CSS)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Sélecteur liste {required && <span className="text-red-500">*</span>}
          </label>
          <input
            required={required}
            value={config.list_selector}
            onChange={e => onChange({ ...config, list_selector: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white"
            placeholder="article, .news-item, li.event"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Sélecteur titre {required && <span className="text-red-500">*</span>}
          </label>
          <input
            required={required}
            value={config.title_selector}
            onChange={e => onChange({ ...config, title_selector: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white"
            placeholder="h2, h3, .title"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sélecteur lien</label>
          <input
            value={config.link_selector}
            onChange={e => onChange({ ...config, link_selector: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white"
            placeholder="a"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sélecteur contenu</label>
          <input
            value={config.content_selector ?? ''}
            onChange={e => onChange({ ...config, content_selector: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white"
            placeholder="p, .summary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sélecteur image</label>
          <input
            value={config.image_selector ?? ''}
            onChange={e => onChange({ ...config, image_selector: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white"
            placeholder="img"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sélecteur date</label>
          <input
            value={config.date_selector ?? ''}
            onChange={e => onChange({ ...config, date_selector: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white"
            placeholder="time, .date"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">URL de base (si liens relatifs)</label>
          <input
            value={config.base_url ?? ''}
            onChange={e => onChange({ ...config, base_url: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white"
            placeholder="https://exemple.fr"
          />
        </div>
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
  if (c.content_selector) config.content_selector = c.content_selector
  if (c.image_selector)   config.image_selector   = c.image_selector
  if (c.date_selector)    config.date_selector     = c.date_selector
  if (c.base_url)         config.base_url          = c.base_url
  return config
}
