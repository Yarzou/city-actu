import { FeedSkeleton } from '@/components/articles/FeedSkeleton'

// Couvre l'attente du composant serveur de la page ville. Sans ce fichier, le
// visiteur regardait un <main> vide pendant la résolution des requêtes.
//
// Même coquille que `CityHomePage`, au pixel : rangée de 44 px (sur-titre, bouton
// compte rond), grand titre de 41 px, sous-titre, puis les filtres et les cartes. Sans
// reprise exacte, le contenu saute au remplacement.
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-safe sm:px-6 lg:px-8" aria-hidden="true">
      <div className="flex flex-col">
        <div className="flex h-11 items-center justify-between">
          <div className="h-4 w-36 animate-pulse rounded bg-fill" />
          <div className="size-10 animate-pulse rounded-full bg-fill" />
        </div>
        <div className="mt-1 h-[41px] w-40 animate-pulse rounded-lg bg-fill" />
        <div className="mt-1.5 h-4 w-52 animate-pulse rounded bg-fill-soft" />
      </div>
      <FeedSkeleton />
    </div>
  )
}
