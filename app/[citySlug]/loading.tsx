import { SkeletonCard } from '@/components/articles/SkeletonCard'

// Couvre l'attente du composant serveur de la page ville. Sans ce fichier, le
// visiteur regardait un <main> vide pendant la résolution des requêtes : les
// squelettes internes du feed n'apparaissent qu'après hydratation, donc trop tard.
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
      <div className="h-9 w-64 max-w-full rounded-lg bg-gray-200 animate-pulse mb-6" />
      <div className="h-12 border-b border-gray-200 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
