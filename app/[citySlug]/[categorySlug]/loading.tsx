import { SkeletonCard } from '@/components/articles/SkeletonCard'

// Couvre la navigation client : cliquer une pastille de catégorie est un <Link> vers
// ce segment, et rien n'indiquait que la page travaillait avant que le nouveau segment
// soit prêt.
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="h-8 w-56 max-w-full rounded-lg bg-gray-200 animate-pulse mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
