import Image from 'next/image'
import { ExternalLink } from 'lucide-react'
import { cn, formatDate, truncate } from '@/lib/utils'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/types'
import type { Article } from '@/lib/types'
import { FavoriteButton } from './FavoriteButton'

interface ArticleCardProps {
  article: Article
  userId?: string | null
  isFavorited?: boolean
}

export function ArticleCard({ article, userId, isFavorited = false }: ArticleCardProps) {
  const categorySlug = article.category?.slug ?? ''
  const categoryColor = CATEGORY_COLORS[categorySlug] ?? 'bg-gray-100 text-gray-800'
  const categoryIcon  = CATEGORY_ICONS[categorySlug] ?? '📰'

  return (
    <article className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
      {/* Image */}
      {article.image_url && (
        <div className="relative h-40 bg-gray-100 shrink-0">
          <Image
            src={article.image_url}
            alt={article.title}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      <div className="p-4 flex flex-col flex-1 gap-2">
        {/* Category badge */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', categoryColor)}>
            <span>{categoryIcon}</span>
            {article.category?.name ?? 'Actualité'}
          </span>
          {article.published_at && (
            <time className="text-xs text-gray-400" dateTime={article.published_at}>
              {formatDate(article.published_at)}
            </time>
          )}
        </div>

        {/* Title */}
        <h2 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
          {article.title}
        </h2>

        {/* Preview */}
        {article.content_preview && (
          <p className="text-xs text-gray-500 line-clamp-3 flex-1">
            {truncate(article.content_preview, 200)}
          </p>
        )}

        {/* Source + Actions */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400 truncate">{article.source?.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            {userId && (
              <FavoriteButton articleId={article.id} userId={userId} initialFavorited={isFavorited} />
            )}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              title="Voir l'article original"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}
