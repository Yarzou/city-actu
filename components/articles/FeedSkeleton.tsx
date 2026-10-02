import { SkeletonCard } from './SkeletonCard'
import { MonthViewSkeleton } from './MonthView'
import type { FeedView } from '@/lib/feed/view-params'

/**
 * Squelette de la liste et de ses filtres, partagé par le `<Suspense>` de la page
 * ville et par `loading.tsx`.
 *
 * Le conteneur reprend exactement celui d'`ArticleFeed` — sans ça, le contenu se
 * décale au moment où le vrai feed remplace le squelette. Six cartes et non douze :
 * sur mobile, une colonne, douze cartes fantômes c'était trois écrans de peinture
 * inutile. En vue mensuelle, c'est une grille de cases qui prend leur place.
 */
export function FeedSkeleton({ view = 'liste' }: { view?: FeedView }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8" aria-hidden="true">
      <div className="mb-2 h-4 w-48 rounded bg-gray-100 animate-pulse" />
      <div className="mb-3 h-12 rounded-xl bg-gray-100 animate-pulse" />
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-11 w-28 shrink-0 rounded-full bg-gray-100 animate-pulse" />
        ))}
      </div>
      {view === 'mois' ? (
        <MonthViewSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
    </div>
  )
}
