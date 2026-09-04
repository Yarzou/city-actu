'use client'

import { useState } from 'react'
import {
  Building2, ChevronDown, Plus, Pencil, Trash2, ArrowUp, ArrowDown,
  Eye, EyeOff, Copy,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Category, City } from '@/lib/types'

/**
 * Gestion des villes : création, identité, catégorie mise en avant, publication,
 * suppression.
 *
 * Composant à part et non un troisième bloc dans `AdminSourcesPanel`, déjà à près de
 * 1500 lignes. Il reçoit les mécanismes partagés du panneau (confirmation, bandeau de
 * retour) plutôt que de les dupliquer.
 *
 * Le markup de l'accordéon est calqué à l'identique sur « Gestion des catégories » :
 * carte `rounded-3xl`, en-tête à bouton unique `flex-1`, icône `size={17}` en
 * `text-brand-600`, pastille de compte, chevron pivoté à 180°, corps conditionnel.
 */

interface AdminCitiesSectionProps {
  cities: City[]
  /** Toutes les catégories chargées, toutes villes confondues. */
  categories: Category[]
  /** Nombre de sources par identifiant de ville — sert au décompte de suppression. */
  sourceCountByCity: Record<number, number>
  onCitiesChange: (cities: City[]) => void
  /** Une ville créée avec clonage ajoute des catégories : le panneau doit les voir. */
  onCategoriesAdded: (categories: Category[]) => void
  askConfirm: (title: string, message: string, confirmLabel: string, onConfirm: () => void) => void
  closeConfirm: () => void
  setFeedback: (feedback: { ok: boolean; msg: string } | null) => void
}

const EMPTY_FORM = { name: '', slug: '', lat: '', lng: '', description: '', cloneFrom: '' }

/** Même normalisation que pour les catégories. */
function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function AdminCitiesSection({
  cities,
  categories,
  sourceCountByCity,
  onCitiesChange,
  onCategoriesAdded,
  askConfirm,
  closeConfirm,
  setFeedback,
}: AdminCitiesSectionProps) {
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState({
    name: '', slug: '', lat: '', lng: '', description: '', spotlight_category_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  async function createCity(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setFeedback(null)

    const supabase = createClient()
    const slug = form.slug || toSlug(form.name)
    const nextOrder = cities.length ? Math.max(...cities.map((c) => c.display_order)) + 10 : 10

    const { data: city, error } = await supabase
      .from('cities')
      .insert({
        name: form.name,
        slug,
        lat: form.lat ? Number(form.lat) : 0,
        lng: form.lng ? Number(form.lng) : 0,
        description: form.description || null,
        display_order: nextOrder,
        // Une ville naît en brouillon : le temps d'y brancher ses sources avant qu'un
        // visiteur ne tombe sur un feed vide.
        published: false,
      })
      .select('*')
      .single()

    if (error || !city) {
      setFeedback({ ok: false, msg: `Création impossible : ${error?.message ?? 'erreur inconnue'}` })
      setCreating(false)
      return
    }

    const created = city as City
    let clonedCategories: Category[] = []

    if (form.cloneFrom) {
      const template = categories.filter((c) => c.city_id === Number(form.cloneFrom))
      if (template.length > 0) {
        const { data: inserted, error: cloneError } = await supabase
          .from('categories')
          .insert(
            template.map((c) => ({
              city_id: created.id,
              name: c.name,
              slug: c.slug,
              icon: c.icon,
              color: c.color,
              display_order: c.display_order,
            }))
          )
          .select('*')

        if (cloneError) {
          // La ville existe, seul le clonage a échoué : on le dit plutôt que de laisser
          // croire à un échec complet, l'utilisateur pouvant créer ses catégories à la main.
          setFeedback({ ok: false, msg: `Ville créée, mais clonage des catégories impossible : ${cloneError.message}` })
        } else {
          clonedCategories = (inserted ?? []) as Category[]
        }
      }
    }

    onCitiesChange([...cities, created].sort(byOrder))
    if (clonedCategories.length > 0) onCategoriesAdded(clonedCategories)
    if (!form.cloneFrom || clonedCategories.length > 0) {
      setFeedback({
        ok: true,
        msg: `« ${created.name} » créée en brouillon${clonedCategories.length ? ` avec ${clonedCategories.length} catégorie(s)` : ''}.`,
      })
    }
    setForm(EMPTY_FORM)
    setShowForm(false)
    setCreating(false)
  }

  async function togglePublished(city: City) {
    setTogglingId(city.id)
    setFeedback(null)

    const next = !city.published
    const supabase = createClient()
    const { error } = await supabase.from('cities').update({ published: next }).eq('id', city.id)

    if (error) {
      setFeedback({ ok: false, msg: `Publication impossible : ${error.message}` })
    } else {
      onCitiesChange(cities.map((c) => (c.id === city.id ? { ...c, published: next } : c)))
      setFeedback({
        ok: true,
        msg: next
          ? `« ${city.name} » est publiée.`
          : `« ${city.name} » est repassée en brouillon : elle disparaît du menu et sa page renvoie 404 aux visiteurs.`,
      })
    }
    setTogglingId(null)
  }

  function startEdit(city: City) {
    setEditingId(city.id)
    setEditData({
      name: city.name,
      slug: city.slug,
      lat: String(city.lat ?? 0),
      lng: String(city.lng ?? 0),
      description: city.description ?? '',
      spotlight_category_id: city.spotlight_category_id ? String(city.spotlight_category_id) : '',
    })
  }

  async function saveCity(id: number) {
    setSaving(true)
    setFeedback(null)

    const patch = {
      name: editData.name,
      slug: editData.slug,
      lat: editData.lat ? Number(editData.lat) : 0,
      lng: editData.lng ? Number(editData.lng) : 0,
      description: editData.description || null,
      spotlight_category_id: editData.spotlight_category_id
        ? Number(editData.spotlight_category_id)
        : null,
    }

    const supabase = createClient()
    const { error } = await supabase.from('cities').update(patch).eq('id', id)

    if (error) {
      setFeedback({ ok: false, msg: `Enregistrement impossible : ${error.message}` })
    } else {
      onCitiesChange(cities.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort(byOrder))
      setEditingId(null)
    }
    setSaving(false)
  }

  /**
   * Déplace une ville d'un cran en échangeant son `display_order` avec sa voisine.
   * Même patron que le réordonnancement des catégories : mise à jour optimiste, les deux
   * UPDATE ne sont pas transactionnels, donc restauration si l'un échoue. Une écriture
   * partielle laisserait deux villes à égalité, mais le tri `display_order, name` reste
   * déterministe (départage par nom) et un nouveau clic répare.
   */
  async function moveCity(id: number, direction: 'up' | 'down') {
    const index = cities.findIndex((c) => c.id === id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || swapIndex < 0 || swapIndex >= cities.length) return

    const current = cities[index]
    const neighbour = cities[swapIndex]
    const previous = cities

    const next = [...cities]
    next[index] = { ...neighbour, display_order: current.display_order }
    next[swapIndex] = { ...current, display_order: neighbour.display_order }

    onCitiesChange(next)
    setReordering(true)

    const supabase = createClient()
    const [{ error: errorA }, { error: errorB }] = await Promise.all([
      supabase.from('cities').update({ display_order: neighbour.display_order }).eq('id', current.id),
      supabase.from('cities').update({ display_order: current.display_order }).eq('id', neighbour.id),
    ])

    if (errorA || errorB) {
      onCitiesChange(previous)
      setFeedback({ ok: false, msg: `Réordonnancement impossible : ${(errorA ?? errorB)!.message}` })
    }
    setReordering(false)
  }

  function deleteCity(city: City) {
    const sourceCount = sourceCountByCity[city.id] ?? 0
    const cityCategories = categories.filter((c) => c.city_id === city.id).length

    askConfirm(
      `Supprimer « ${city.name} »`,
      // Le décompte est énoncé parce que les clés étrangères sont en ON DELETE CASCADE :
      // la perte n'est pas limitée à la ligne `cities`.
      `Suppression définitive, en cascade : ${sourceCount} source(s), ${cityCategories} catégorie(s) et tous les articles collectés pour cette ville. Cette action est irréversible.`,
      'Supprimer définitivement',
      async () => {
        closeConfirm()
        const res = await fetch('/api/admin/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'cities', id: city.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) {
          setFeedback({ ok: false, msg: `Suppression impossible : ${data.error ?? res.statusText}` })
          return
        }
        onCitiesChange(cities.filter((c) => c.id !== city.id))
        setFeedback({ ok: true, msg: `« ${city.name} » supprimée.` })
      }
    )
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <div className="flex items-center border-b border-gray-100">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-3">
            <Building2 size={17} className="text-brand-600 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-800">
              Gestion des villes
              {cities.length > 0 && (
                <span className="ml-2 text-xs font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                  {cities.length}
                </span>
              )}
            </span>
          </span>
          <ChevronDown size={16} className={cn('text-gray-400 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="p-4 space-y-3">
          {cities.map((city, index) => {
            const cityCategories = categories.filter((c) => c.city_id === city.id)

            return (
              <div key={city.id} className="rounded-xl border border-gray-200 p-3">
                {editingId === city.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <label className="col-span-2 text-xs text-gray-600">
                        Nom <span className="text-red-500">*</span>
                        <input
                          required
                          value={editData.name}
                          onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))}
                          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="col-span-2 text-xs text-gray-600">
                        Slug
                        <input
                          value={editData.slug}
                          onChange={(e) => setEditData((d) => ({ ...d, slug: e.target.value }))}
                          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        Latitude
                        <input
                          value={editData.lat}
                          onChange={(e) => setEditData((d) => ({ ...d, lat: e.target.value }))}
                          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        Longitude
                        <input
                          value={editData.lng}
                          onChange={(e) => setEditData((d) => ({ ...d, lng: e.target.value }))}
                          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </label>
                      <label className="col-span-2 text-xs text-gray-600">
                        Onglet mis en avant
                        <select
                          value={editData.spotlight_category_id}
                          onChange={(e) => setEditData((d) => ({ ...d, spotlight_category_id: e.target.value }))}
                          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="">Aucun</option>
                          {cityCategories.map((c) => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="col-span-2 text-xs text-gray-600 sm:col-span-4">
                        Description
                        <textarea
                          rows={2}
                          value={editData.description}
                          onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))}
                          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">
                      La catégorie mise en avant reçoit son propre onglet et sort du feed « Actus ».
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveCity(city.id)}
                        disabled={saving}
                        className="px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
                      >
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-2 rounded-lg border border-gray-300 text-xs text-gray-600"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-gray-800">
                        <span className="truncate">{city.name}</span>
                        {city.published ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            <Eye className="size-3" /> Publiée
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            <EyeOff className="size-3" /> Brouillon
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        <span className="font-mono">{city.slug}</span>
                        {' · '}
                        {sourceCountByCity[city.id] ?? 0} source(s)
                        {' · '}
                        {cityCategories.length} catégorie(s)
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => moveCity(city.id, 'up')}
                        disabled={index === 0 || reordering}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
                        title="Monter"
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        onClick={() => moveCity(city.id, 'down')}
                        disabled={index === cities.length - 1 || reordering}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
                        title="Descendre"
                      >
                        <ArrowDown className="size-4" />
                      </button>
                      <button
                        onClick={() => togglePublished(city)}
                        disabled={togglingId === city.id}
                        className={cn(
                          'px-2 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                          city.published
                            ? 'text-amber-700 hover:bg-amber-50'
                            : 'text-green-700 hover:bg-green-50'
                        )}
                        title={city.published ? 'Repasser en brouillon' : 'Publier'}
                      >
                        {city.published ? 'Dépublier' : 'Publier'}
                      </button>
                      <button
                        onClick={() => startEdit(city)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="size-4" />
                      </button>
                      {/*
                        Suppression réservée aux villes dépubliées : les clés étrangères
                        sont en ON DELETE CASCADE, deux gestes volontaires valent mieux
                        qu'un seul avant d'effacer sources et articles.
                      */}
                      {!city.published && (
                        <button
                          onClick={() => deleteCity(city)}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Supprimer définitivement"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {cities.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500">Aucune ville pour le moment.</p>
          )}

          {showForm ? (
            <form
              onSubmit={createCity}
              className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-4 space-y-3"
            >
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Nouvelle ville</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="col-span-2 text-xs text-gray-600">
                  Nom <span className="text-red-500">*</span>
                  <input
                    required
                    value={form.name}
                    // Le slug suit le nom tant qu'on ne l'a pas édité à la main : même
                    // comportement que le formulaire de catégorie.
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: toSlug(e.target.value) }))}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="col-span-2 text-xs text-gray-600">
                  Slug
                  <input
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="auto-généré"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Latitude
                  <input
                    value={form.lat}
                    onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                    placeholder="47.2859"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Longitude
                  <input
                    value={form.lng}
                    onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                    placeholder="-1.5521"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </label>
                <label className="col-span-2 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <Copy className="size-3" />
                    Cloner les catégories de
                  </span>
                  <select
                    value={form.cloneFrom}
                    onChange={(e) => setForm((f) => ({ ...f, cloneFrom: e.target.value }))}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Aucune (créer les catégories à la main)</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({categories.filter((cat) => cat.city_id === c.id).length})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 text-xs text-gray-600 sm:col-span-4">
                  Description
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Reprise dans la description de la page et le partage de liens."
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                La ville est créée en <strong>brouillon</strong> : invisible du menu et
                inaccessible aux visiteurs jusqu&apos;à sa publication.
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
                >
                  {creating ? 'Création…' : 'Créer'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-xs text-gray-600"
                >
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
            >
              <Plus className="size-4" />
              Ajouter une ville
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function byOrder(a: City, b: City) {
  return a.display_order - b.display_order || a.name.localeCompare(b.name, 'fr')
}
