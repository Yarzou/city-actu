import { FeedSkeleton } from '@/components/articles/FeedSkeleton'

// Couvre l'attente du composant serveur de la page ville. Sans ce fichier, le
// visiteur regardait un <main> vide pendant la résolution des requêtes : les
// squelettes internes du feed n'apparaissent qu'après hydratation, donc trop tard.
//
// Même coquille que `CityHomePage`, au pixel : `pt-4` sur mobile, titre et rangée
// d'onglets absents sous 640px. L'ancien squelette avait `pt-8` et un titre partout,
// donc le contenu sautait de plusieurs dizaines de pixels au remplacement sur mobile.
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-12">
      <div className="hidden sm:block sm:mb-6">
        <div className="h-9 w-64 max-w-full rounded-lg bg-gray-200 animate-pulse" />
      </div>
      <div className="hidden sm:block h-12 border-b border-gray-200 mb-6" />
      <FeedSkeleton />
    </div>
  )
}
