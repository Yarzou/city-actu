import { SkeletonCard } from '@/components/articles/SkeletonCard'

// Couvre la navigation client : cliquer une pastille de catégorie est un <Link> vers
// ce segment, et rien n'indiquait que la page travaillait avant que le nouveau segment
// soit prêt. Le squelette interne d'ArticleFeed reste utile pour la phase suivante
// (JS monté, données en cours de chargement).
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
