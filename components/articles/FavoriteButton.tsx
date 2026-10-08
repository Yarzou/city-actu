'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
  articleId: number
  userId: string
  initialFavorited: boolean
  /** Appelé après une écriture **réussie** : l'appelant tient sa propre liste à jour. */
  onToggled?: (articleId: number, favorited: boolean) => void
  /** Échec d'écriture : le message est à afficher, le bouton n'a pas changé d'état. */
  onError?: (message: string) => void
  /**
   * `plain` dans le pied de carte, `glass` posé sur la photo d'une grande carte : un
   * bouton rond en verre, lisible quelle que soit l'image dessous.
   */
  variant?: 'plain' | 'glass'
}

export function FavoriteButton({ articleId, userId, initialFavorited, onToggled, onError, variant = 'plain' }: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [loading, setLoading]     = useState(false)

  async function toggle() {
    setLoading(true)
    const supabase = createClient()
    // L'ancien code basculait le cœur sans lire `error` : une RLS qui refuse, une
    // session expirée ou une coupure réseau laissaient un favori affiché mais jamais
    // enregistré, et l'onglet Favoris ne le montrait pas — sans rien pour comprendre.
    const { error } = favorited
      ? await supabase.from('user_favorites').delete().match({ user_id: userId, article_id: articleId })
      : await supabase.from('user_favorites').insert({ user_id: userId, article_id: articleId })
    setLoading(false)

    if (error) {
      console.error('[Favoris] écriture impossible:', error)
      onError?.(favorited ? 'Impossible de retirer ce favori.' : "Impossible d'ajouter ce favori.")
      return
    }

    const next = !favorited
    setFavorited(next)
    onToggled?.(articleId, next)
  }

  // `aria-label` et non `title` : l'infobulle ne s'affiche jamais au toucher et n'est
  // pas annoncée de façon fiable. `aria-pressed` porte l'état, qui sinon ne serait que
  // la couleur du cœur.
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      aria-pressed={favorited}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-full transition-colors focus-ring disabled:opacity-60',
        variant === 'glass' && 'glass',
        favorited ? 'text-heart' : variant === 'glass' ? 'text-ink' : 'text-ink-muted'
      )}
    >
      <Heart className={cn('size-5', favorited && 'fill-current')} strokeWidth={2} />
    </button>
  )
}
