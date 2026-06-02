'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, ArrowLeft, Calendar, Globe } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDateShort } from '@/lib/utils'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/types'
import { FavoriteButton } from '@/components/articles/FavoriteButton'
import type { Article } from '@/lib/types'

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>()
  const [article, setArticle] = useState<Article | null>(null)
  const [userId, setUserId]   = useState<string | null>(null)
  const [isFav, setIsFav]     = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const [{ data: art }, { data: { user } }] = await Promise.all([
        supabase
          .from('articles')
          .select('*, source:sources(name), category:categories(id,name,slug), city:cities(id,name,slug)')
          .eq('id', id)
          .single(),
        supabase.auth.getUser(),
      ])

      setArticle(art)
      setUserId(user?.id ?? null)

      if (user && art) {
        const { data: fav } = await supabase
          .from('user_favorites')
          .select('article_id')
          .match({ user_id: user.id, article_id: art.id })
          .single()
        setIsFav(!!fav)
      }

      setLoading(false)
    }

    load()
  }, [id])

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 animate-pulse space-y-4">
        <div className="h-6 w-1/3 bg-gray-200 rounded" />
        <div className="h-8 bg-gray-200 rounded" />
        <div className="h-4 w-1/4 bg-gray-100 rounded" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
        </div>
      </div>
    )
  }

  if (!article) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-4xl mb-4">🔍</p>
        <p className="font-medium text-gray-700">Article introuvable</p>
        <Link href="/" className="mt-4 inline-block text-brand-600 hover:underline text-sm">
          Retour à l&apos;accueil
        </Link>
      </div>
    )
  }

  const categorySlug  = article.category?.slug ?? ''
  const categoryColor = CATEGORY_COLORS[categorySlug] ?? 'bg-gray-100 text-gray-800'
  const categoryIcon  = CATEGORY_ICONS[categorySlug] ?? '📰'

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Back */}
      <Link
        href={article.city ? `/${article.city.slug}` : '/'}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 mb-6 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Retour aux actualités
      </Link>

      {/* Category + date */}
      <div className="flex items-center gap-3 mb-4">
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor}`}>
          <span>{categoryIcon}</span>
          {article.category?.name}
        </span>
        {article.published_at && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <Calendar className="size-3" />
            {formatDateShort(article.published_at)}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
          <Globe className="size-3" />
          {article.source?.name}
        </span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-4">
        {article.title}
      </h1>

      {/* Preview content */}
      {article.content_preview && (
        <p className="text-gray-600 leading-relaxed mb-6 text-base">
          {article.content_preview}
        </p>
      )}

      {/* CTA to original */}
      <div className="flex items-center gap-3">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors text-sm"
        >
          <ExternalLink className="size-4" />
          Lire l&apos;article complet
        </a>
        {userId && (
          <FavoriteButton articleId={article.id} userId={userId} initialFavorited={isFav} />
        )}
      </div>
    </div>
  )
}
