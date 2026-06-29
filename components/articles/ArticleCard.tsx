'use client'

import { useRef, useLayoutEffect, useState } from 'react'
import Image from 'next/image'
import { ExternalLink, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { cn, formatEventDateRange } from '@/lib/utils'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/types'
import type { Article } from '@/lib/types'
import { FavoriteButton } from './FavoriteButton'

interface ArticleCardProps {
  article: Article
  userId?: string | null
  isFavorited?: boolean
  canDelete?: boolean
  deleting?: boolean
  onDelete?: (articleId: number) => void
}

export function ArticleCard({ article, userId, isFavorited = false, canDelete = false, deleting = false, onDelete }: ArticleCardProps) {
  const categorySlug = article.category?.slug ?? ''
  const categoryColor = CATEGORY_COLORS[categorySlug] ?? 'bg-gray-100 text-gray-800'
  const categoryIcon  = CATEGORY_ICONS[categorySlug] ?? '📰'

  const displayDate = article.published_at
    ? formatEventDateRange(article.published_at, article.event_end_date ?? null)
    : null
  const dateTimeAttr = article.event_end_date ?? article.published_at ?? undefined

  const [expanded, setExpanded] = useState(false)
  const [isClamped, setIsClamped] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const el = textRef.current
    if (el) setIsClamped(el.scrollHeight > el.clientHeight + 2)
  }, [article.content_preview])

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
          {displayDate && (
            <time className="text-xs text-gray-400" dateTime={dateTimeAttr}>
              {displayDate}
            </time>
          )}
        </div>

        {/* Title */}
        <h2 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
          {article.title}
        </h2>

        {/* Preview */}
        {article.content_preview && (
          <div className="flex-1">
            <p
              ref={textRef}
              className={cn(
                'text-xs text-gray-500',
                !expanded && 'line-clamp-3'
              )}
            >
              {article.content_preview}
            </p>
            {(isClamped || expanded) && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v) }}
                className="mt-1 inline-flex items-center gap-0.5 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                {expanded
                  ? <><ChevronUp className="size-3" /> Voir moins</>
                  : <><ChevronDown className="size-3" /> Voir plus</>
                }
              </button>
            )}
          </div>
        )}

        {/* Source + Actions */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400 truncate">{article.source?.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            {userId && (
              <FavoriteButton articleId={article.id} userId={userId} initialFavorited={isFavorited} />
            )}
            {canDelete && onDelete && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(article.id) }}
                disabled={deleting}
                className="inline-flex items-center justify-center p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                title="Supprimer cette actu"
              >
                <Trash2 className={cn('size-4', deleting && 'animate-pulse')} />
              </button>
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
