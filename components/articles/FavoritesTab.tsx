'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ArticleCard, type CardFeedback } from './ArticleCard'
import { SkeletonCard } from './SkeletonCard'
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

  if (state === 'error') {
    return (
      <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
        <TriangleAlert className="mx-auto mb-3 size-8 text-red-500" />
        <p className="font-medium text-red-800">Impossible de charger vos favoris</p>
        <p className="mt-1 text-sm text-red-600">Vérifiez votre connexion, puis réessayez.</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-red-300 bg-white px-5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-ring"
        >
          Réessayer
        </button>
      </div>
    )
  }

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <Heart className="size-12 text-gray-300 mb-4" />
        <p className="font-medium text-gray-600">Aucun favori pour l&apos;instant</p>
        <p className="text-sm text-gray-500 mt-1">
          Appuyez sur <span aria-hidden="true">❤️</span><span className="sr-only">le cœur</span> sur un article pour l&apos;enregistrer ici.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {feedback && (
        <p role="status" className={cn('mb-4 text-sm', feedback.ok ? 'text-brand-700' : 'text-red-600')}>
          {feedback.msg}
        </p>
      )}
      <p className="mb-3 text-xs text-gray-500">
        {favorites.length} {favorites.length > 1 ? 'favoris' : 'favori'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
    </div>
  )
}
