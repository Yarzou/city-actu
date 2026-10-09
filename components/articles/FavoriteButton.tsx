'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { announceFavorite } from '@/lib/feed/favorite-events'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
  articleId: number
  userId: string
  /**
   * État tenu par le conteneur. Le bouton le suit quand il change de l'extérieur : un
   * favori retiré depuis un autre onglet doit vider ce cœur-ci, les onglets restant
   * montés une fois ouverts.
   */
  initialFavorited: boolean
  /** Échec d'écriture : le message est à afficher, le bouton n'a pas changé d'état. */
  onError?: (message: string) => void
  /**
   * `plain` dans le pied de carte, `glass` posé sur la photo d'une grande carte : un
   * bouton rond en verre, lisible quelle que soit l'image dessous.
   */
  variant?: 'plain' | 'glass'
}

export function FavoriteButton({ articleId, userId, initialFavorited, onError, variant = 'plain' }: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [loading, setLoading]     = useState(false)

  // Ajustement pendant le rendu, pas dans un effet : le cœur change dans la même image
  // que la prop, sans rendu intermédiaire à l'ancien état.
  const [seen, setSeen] = useState(initialFavorited)
  if (seen !== initialFavorited) {
    setSeen(initialFavorited)
    setFavorited(initialFavorited)
  }

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
    // Tous les onglets montés tiennent leur liste à jour, celui-ci compris.
    announceFavorite({ articleId, favorited: next })
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
