'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArticleCard } from '@/components/articles/ArticleCard'
import { SkeletonCard } from '@/components/articles/SkeletonCard'
import { LogOut, Heart, Settings } from 'lucide-react'
import { AdminSourcesPanel } from '@/components/admin/AdminSourcesPanel'
import type { Article as ArticleType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { resolveAdminStatusClient } from '@/lib/admin-client'

export default function ProfilPage() {
  const router = useRouter()
  const [tab, setTab]             = useState<'favorites' | 'admin'>('favorites')
  const [userId, setUserId]       = useState<string | null>(null)
  const [email, setEmail]         = useState<string | null>(null)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [favorites, setFavorites] = useState<ArticleType[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      setUserId(user.id)
      setEmail(user.email ?? null)

      const admin = await resolveAdminStatusClient(supabase, user.id)
      setIsAdmin(admin)

      const { data: favs } = await supabase
        .from('user_favorites')
        .select('*, article:articles(*, source:sources(name), category:categories(id,name,slug), city:cities(id,name,slug))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setFavorites((favs ?? []).map((f: { article: ArticleType }) => f.article).filter(Boolean))
      setLoading(false)
    }

    load()
  }, [router])

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
        <button
          onClick={signOut}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { id: 'favorites', label: 'Favoris', icon: <Heart className="size-4" />, count: favorites.length },
          ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin', icon: <Settings className="size-4" />, count: 0 }] : []),
        ].map(({ id, label, icon, count }) => (
          <button
            key={id}
            onClick={() => {
              setTab(id as 'favorites' | 'admin')
            }}
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
      {tab === 'admin' && isAdmin && <AdminSourcesPanel />}
    </div>
  )
}
