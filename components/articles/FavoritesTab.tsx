'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ArticleCard } from './ArticleCard'
import { SkeletonCard } from './SkeletonCard'
import type { Article as ArticleType } from '@/lib/types'

interface FavoritesTabProps {
  citySlug: string
}

export function FavoritesTab({ citySlug }: FavoritesTabProps) {
  const [state, setState] = useState<'loading' | 'unauthenticated' | 'ready'>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<ArticleType[]>([])

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setState('unauthenticated'); return }

      setUserId(user.id)

      const { data: city } = await supabase
        .from('cities').select('id').eq('slug', citySlug).single()

      if (!city) { setState('ready'); return }

      const { data: favs } = await supabase
        .from('user_favorites')
        .select('*, article:articles(*, source:sources(name), category:categories(id,name,slug), city:cities(id,name,slug))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      const cityFavs = ((favs ?? []) as { article: ArticleType }[])
        .map(f => f.article)
        .filter((a): a is ArticleType => Boolean(a) && a.city?.slug === citySlug)

      setFavorites(cityFavs)
      setState('ready')
    }

    load()
  }, [citySlug])

  if (state === 'loading') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (state === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <Heart className="size-12 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Connectez-vous pour voir vos favoris</h2>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          Sauvegardez les articles qui vous intéressent et retrouvez-les ici.
        </p>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          Se connecter
        </Link>
      </div>
    )
  }

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <Heart className="size-12 text-gray-300 mb-4" />
        <p className="font-medium text-gray-600">Aucun favori pour l&apos;instant</p>
        <p className="text-sm text-gray-500 mt-1">
          Appuyez sur ❤️ sur un article pour l&apos;enregistrer ici.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
      {favorites.map((article) => (
        <ArticleCard
          key={article.id}
          article={article}
          userId={userId}
          isFavorited
        />
      ))}
    </div>
  )
}
