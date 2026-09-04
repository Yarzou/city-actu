export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8" aria-hidden="true">
      <div className="mb-6">
        <div className="h-8 w-56 rounded-lg bg-gray-200 animate-pulse" />
        <div className="mt-2 h-4 w-48 rounded bg-gray-100 animate-pulse" />
      </div>
      {/* Silhouette du panneau d'administration : une barre d'actions puis une liste
          de sources. Ce squelette imitait une grille de favoris, qui n'existe plus ici. */}
      <div className="mb-4 flex gap-2">
        <div className="h-11 w-32 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-11 w-40 rounded-lg bg-gray-100 animate-pulse" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
