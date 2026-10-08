import { SkeletonCard } from './SkeletonCard'
import { MonthViewSkeleton } from './MonthView'
import type { FeedView } from '@/lib/feed/view-params'

/** Grille des cartes : une colonne sur mobile, puis 2, 3, 4. Mêmes classes que le feed. */
export const FEED_LIST_CLASSES =
  'flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4'

/**
 * Squelette de la liste et de ses filtres, partagé par le `<Suspense>` de la page
 * ville et par `loading.tsx`.
 *
 * Il reprend exactement l'en-tête d'`ArticleFeed` — champ de recherche, rangée « Quand »
 * + « Liste | Mois », pastilles de catégorie — sans quoi le contenu se décale au moment
 * où le vrai feed remplace le squelette. Six cartes : sur mobile, une colonne, douze
 * cartes fantômes c'était trois écrans de peinture inutile.
 */
export function FeedSkeleton({ view = 'liste' }: { view?: FeedView }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="h-10 animate-pulse rounded-full bg-fill" />
      <div className="flex items-center justify-between gap-2">
        <div className="h-9 w-40 animate-pulse rounded-full bg-card" />
        <div className="h-9 w-36 animate-pulse rounded-full bg-fill" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-full bg-card" />
        ))}
      </div>
      <div className="mt-3">
        {view === 'mois' ? (
          <MonthViewSkeleton />
        ) : (
          <>
            <div className="mb-2.5 h-6 w-52 animate-pulse rounded-lg bg-fill" />
            <div className={FEED_LIST_CLASSES}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
