'use client'

import { useEffect, useState } from 'react'
import { Newspaper, Heart, Sparkles, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ArticleFeed } from './ArticleFeed'
import { FavoritesTab } from './FavoritesTab'
import { AIDigestTab } from './AIDigestTab'
import { cn } from '@/lib/utils'

type Tab = 'actus' | 'favoris' | 'ia'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'actus',   label: 'Actus',        icon: <Newspaper className="size-4" /> },
  { id: 'favoris', label: 'Favoris',       icon: <Heart className="size-4" /> },
  { id: 'ia',      label: 'Résumés IA',    icon: <Sparkles className="size-4" /> },
]

interface CityHomePageProps {
  citySlug: string
}

export function CityHomePage({ citySlug }: CityHomePageProps) {
  const [tab, setTab] = useState<Tab>('actus')
  const [cityName, setCityName] = useState<string>('')
  const [userId, setUserId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFeedback, setRefreshFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    async function init() {
      const [{ data: city }, { data: { user } }] = await Promise.all([
        supabase.from('cities').select('name').eq('slug', citySlug).single(),
        supabase.auth.getUser(),
      ])
      if (city) setCityName(city.name)
      setUserId(user?.id ?? null)
    }
    init()
  }, [citySlug])

  async function handleRefresh() {
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
      } else {
        setRefreshFeedback({ ok: false, msg: data.error ?? 'Erreur inconnue' })
      }
    } catch {
      setRefreshFeedback({ ok: false, msg: 'Erreur réseau' })
    }
    setRefreshing(false)
    setTimeout(() => setRefreshFeedback(null), 5000)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
      {/* City header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
          {cityName || citySlug}
        </h1>
        {userId && (
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
        <p className={cn('mb-4 text-sm', refreshFeedback.ok ? 'text-brand-700' : 'text-red-600')}>
          {refreshFeedback.ok ? '✅' : '❌'} {refreshFeedback.msg}
        </p>
      )}

      {/* Tab bar */}
      <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-200 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'shrink-0 inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'actus' && (
        <ArticleFeed
          citySlug={citySlug}
          hideHeader
          hideMiniCalendar
        />
      )}
      {tab === 'favoris' && <FavoritesTab citySlug={citySlug} />}
      {tab === 'ia' && <AIDigestTab citySlug={citySlug} />}
    </div>
  )
}
