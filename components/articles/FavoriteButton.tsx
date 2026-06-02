'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
  articleId: number
  userId: string
  initialFavorited: boolean
}

export function FavoriteButton({ articleId, userId, initialFavorited }: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [loading, setLoading]     = useState(false)

  async function toggle() {
    setLoading(true)
    const supabase = createClient()
    if (favorited) {
      await supabase.from('user_favorites').delete().match({ user_id: userId, article_id: articleId })
    } else {
      await supabase.from('user_favorites').insert({ user_id: userId, article_id: articleId })
    }
    setFavorited(!favorited)
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={cn(
        'p-1.5 rounded-lg transition-colors',
        favorited
          ? 'text-red-500 hover:bg-red-50'
          : 'text-gray-400 hover:text-red-400 hover:bg-red-50'
      )}
    >
      <Heart className={cn('size-4', favorited && 'fill-current')} />
    </button>
  )
}
