'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArticleCard } from '@/components/articles/ArticleCard'
import { SkeletonCard } from '@/components/articles/SkeletonCard'
import { LogOut, Bell, Heart, Settings } from 'lucide-react'
import type { Article as ArticleType, Category as CategoryType, City as CityType, UserAlert } from '@/lib/types'
import { CATEGORY_ICONS } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function ProfilPage() {
  const router = useRouter()
  const [tab, setTab]               = useState<'favorites' | 'alerts'>('favorites')
  const [userId, setUserId]         = useState<string | null>(null)
  const [email, setEmail]           = useState<string | null>(null)
  const [favorites, setFavorites]   = useState<ArticleType[]>([])
  const [alerts, setAlerts]         = useState<UserAlert[]>([])
  const [categories, setCategories] = useState<CategoryType[]>([])
  const [cities, setCities]         = useState<CityType[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      setUserId(user.id)
      setEmail(user.email ?? null)

      const [{ data: favs }, { data: alts }, { data: cats }, { data: cts }] = await Promise.all([
        supabase
          .from('user_favorites')
          .select('*, article:articles(*, source:sources(name), category:categories(id,name,slug), city:cities(id,name,slug))')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_alerts')
          .select('*, city:cities(id,name,slug), category:categories(id,name,slug)')
          .eq('user_id', user.id),
        supabase.from('categories').select('*').order('name'),
        supabase.from('cities').select('*').order('name'),
      ])

      setFavorites((favs ?? []).map((f: { article: ArticleType }) => f.article).filter(Boolean))
      setAlerts(alts ?? [])
      setCategories(cats ?? [])
      setCities(cts ?? [])
      setLoading(false)
    }

    load()
  }, [router])

  async function toggleAlert(cityId: number, categoryId: number | null) {
    if (!userId) return
    const supabase = createClient()
    const existing = alerts.find(
      a => a.city_id === cityId && a.category_id === categoryId
    )
    if (existing) {
      await supabase.from('user_alerts').delete().eq('id', existing.id)
      setAlerts(prev => prev.filter(a => a.id !== existing.id))
    } else {
      const { data } = await supabase
        .from('user_alerts')
        .insert({ user_id: userId, city_id: cityId, category_id: categoryId, active: true })
        .select('*, city:cities(id,name,slug), category:categories(id,name,slug)')
        .single()
      if (data) setAlerts(prev => [...prev, data])
    }
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header profil */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon profil</h1>
          {email && <p className="text-sm text-gray-500 mt-0.5">{email}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/sources"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Settings className="size-4" />
            Admin
          </Link>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <LogOut className="size-4" />
            Déconnexion
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { id: 'favorites', label: 'Favoris', icon: <Heart className="size-4" />, count: favorites.length },
          { id: 'alerts',    label: 'Alertes',  icon: <Bell className="size-4" />,  count: alerts.filter(a => a.active).length },
        ].map(({ id, label, icon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id as 'favorites' | 'alerts')}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {icon}
            {label}
            {count > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'favorites' && (
        favorites.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Heart className="size-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-600">Aucun favori pour l&apos;instant</p>
            <p className="text-sm mt-1">Cliquez sur ❤️ sur un article pour l&apos;enregistrer.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {favorites.map((article) => (
              <ArticleCard key={article.id} article={article} userId={userId} isFavorited />
            ))}
          </div>
        )
      )}

      {tab === 'alerts' && (
        <div className="space-y-6">
          {cities.map((city) => (
            <div key={city.id} className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">{city.name}</h3>
              <div className="flex flex-wrap gap-2">
                {/* Alert for all categories */}
                <AlertToggle
                  active={alerts.some(a => a.city_id === city.id && a.category_id === null && a.active)}
                  label="Toutes les catégories"
                  icon="🔔"
                  onToggle={() => toggleAlert(city.id, null)}
                />
                {categories.map((cat) => (
                  <AlertToggle
                    key={cat.id}
                    active={alerts.some(a => a.city_id === city.id && a.category_id === cat.id && a.active)}
                    label={cat.name}
                    icon={CATEGORY_ICONS[cat.slug] ?? '📰'}
                    onToggle={() => toggleAlert(city.id, cat.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AlertToggle({ active, label, icon, onToggle }: {
  active: boolean
  label: string
  icon: string
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors',
        active
          ? 'bg-brand-50 border-brand-400 text-brand-700 font-medium'
          : 'border-gray-200 text-gray-600 hover:border-brand-300 hover:bg-brand-50'
      )}
    >
      <span>{icon}</span>
      {label}
      {active && <span className="text-brand-500">✓</span>}
    </button>
  )
}
