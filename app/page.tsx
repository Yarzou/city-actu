'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArticleCard } from '@/components/articles/ArticleCard'
import { SkeletonCard } from '@/components/articles/SkeletonCard'
import { CATEGORY_ICONS } from '@/lib/types'
import type { Article as ArticleType, Category as CategoryType } from '@/lib/types'

const DEFAULT_CITY_SLUG = 'la-chapelle-sur-erdre'

export default function HomePage() {
  const [articles, setArticles]     = useState<ArticleType[]>([])
  const [categories, setCategories] = useState<CategoryType[]>([])
  const [userId, setUserId]         = useState<string | null>(null)
  const [favorites, setFavorites]   = useState<Set<number>>(new Set())
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data: cats } = await supabase.from('categories').select('*').order('name')
      setCategories(cats ?? [])

      const { data: arts } = await supabase
        .from('articles')
        .select('*, source:sources(name), category:categories(id,name,slug), city:cities(id,name,slug)')
        .eq('is_duplicate', false)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('fetched_at', { ascending: false })
        .limit(24)

      setArticles(arts ?? [])

      if (user) {
        const { data: favs } = await supabase
          .from('user_favorites')
          .select('article_id')
          .eq('user_id', user.id)
        setFavorites(new Set((favs ?? []).map((f: { article_id: number }) => f.article_id)))
      }

      setLoading(false)
    }

    load()
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          La Chapelle-sur-Erdre
        </h1>
        <p className="text-gray-500">
          Toutes les actualités locales agrégées : infos pratiques, sorties, agenda, sports…
        </p>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/${DEFAULT_CITY_SLUG}/${cat.slug}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:border-brand-400 hover:bg-brand-50 transition-colors text-sm text-gray-700"
            >
              <span>{CATEGORY_ICONS[cat.slug] ?? '📰'}</span>
              {cat.name}
            </Link>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-4">📰</p>
          <p className="font-medium text-gray-600">Aucun article pour le moment</p>
          <p className="text-sm mt-1">Les actualités seront disponibles après le premier fetch automatique.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              userId={userId}
              isFavorited={favorites.has(article.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
