'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ArticleCard, type CardFeedback } from './ArticleCard'
import { SkeletonCard } from './SkeletonCard'
import { FEED_LIST_CLASSES } from './FeedSkeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/Button'
import type { Article as ArticleType } from '@/lib/types'

interface FavoritesTabProps {
  citySlug: string
}

export function FavoritesTab({ citySlug }: FavoritesTabProps) {
  const [state, setState] = useState<'loading' | 'unauthenticated' | 'error' | 'ready'>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<ArticleType[]>([])
  const [feedback, setFeedback] = useState<CardFeedback | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { setState('unauthenticated'); return }

      setUserId(user.id)

      // Filtrage de la ville dans la requête, via la jointure imbriquée.
      //
      // Avant : une requête `cities` dont le résultat n'était jamais utilisé — elle ne
      // servait que de test d'existence — puis le téléchargement des favoris de
      // **toutes** les villes, dont la majorité était jetée en JS. Cet onglet est
      // devenu une destination de la barre de navigation basse, il doit être rapide.
      const { data: favs, error } = await supabase
        .from('user_favorites')
        .select('article:articles!inner(*, source:sources(name), category:categories(id,name,slug,icon), city:cities!inner(id,name,slug))')
        .eq('user_id', user.id)
        .eq('article.city.slug', citySlug)
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (error) {
        // Avant, l'échec tombait dans l'état « prêt » avec une liste vide : « Aucun
        // favori pour l'instant » pour une panne, indiscernable d'un vrai vide.
        console.error('[Favoris] chargement impossible:', error)
        setState('error')
        return
      }

      setFavorites(
        ((favs ?? []) as unknown as { article: ArticleType }[])
          .map((f) => f.article)
          .filter((a): a is ArticleType => Boolean(a))
      )
      setState('ready')
    }

    load()
    return () => { cancelled = true }
  }, [citySlug, attempt])

  // Le retour à « chargement » se fait dans le gestionnaire du bouton, pas dans
  // l'effet : un setState synchrone en début d'effet déclenche un rendu en cascade.
  function retry() {
    setState('loading')
    setAttempt((n) => n + 1)
  }

  const notify = useCallback((next: CardFeedback) => {
    setFeedback(next)
    window.setTimeout(() => setFeedback(null), 5000)
  }, [])

  // Un favori retiré depuis cet onglet quitte la liste : la carte restait affichée,
  // cœur vide, jusqu'au prochain chargement.
  const handleToggled = useCallback((articleId: number, favorited: boolean) => {
    if (!favorited) setFavorites((prev) => prev.filter((a) => a.id !== articleId))
  }, [])

  if (state === 'loading') {
    return (
      <div className={FEED_LIST_CLASSES} aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (state === 'unauthenticated') {
    return (
      <EmptyState
        icon={Heart}
        title="Connectez-vous pour garder vos favoris"
        action={
          <Link href="/auth/login" className={buttonClass('primary', 'md', 'px-6')}>
            Se connecter
          </Link>
        }
      >
        Touchez le cœur d&apos;une actu pour la retrouver ici, sur tous vos appareils.
      </EmptyState>
    )
  }

  if (state === 'error') {
    return (
      <EmptyState
        icon={TriangleAlert}
        tone="danger"
        title="Impossible de charger vos favoris"
        action={<button type="button" onClick={retry} className={buttonClass('secondary', 'md')}>Réessayer</button>}
      >
        Vérifiez votre connexion, puis réessayez.
      </EmptyState>
    )
  }

  if (favorites.length === 0) {
    return (
      <EmptyState icon={Heart} title="Aucun favori pour l’instant">
        Touchez le cœur d&apos;une actu pour l&apos;enregistrer ici.
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-footnote text-ink-muted">
        {favorites.length} {favorites.length > 1 ? 'favoris' : 'favori'}
      </p>
      <div className={FEED_LIST_CLASSES}>
        {favorites.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            userId={userId}
            isFavorited
            onFavoriteToggled={handleToggled}
            onFeedback={notify}
          />
        ))}
      </div>
      {/* Retour d'une action de carte : la même pastille de verre que dans le fil. */}
      {feedback && (
        <div role="status" className="bottom-toast pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4">
          <p className={cn('glass glass-strong rounded-full px-4 py-2.5 text-subhead font-medium', feedback.ok ? 'text-ink' : 'text-danger')}>
            {feedback.msg}
          </p>
        </div>
      )}
    </div>
  )
}
