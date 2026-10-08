export default function Loading() {
  return (
    // Même conteneur que page.tsx, pour que rien ne saute au remplacement.
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-safe sm:px-6" aria-hidden="true">
      {/* Grand titre de PageHeader : rangée de 44 px (bouton retour), titre de 41 px,
          puis la ligne de l'adresse email. */}
      <div className="flex flex-col">
        <div className="flex h-11 items-center">
          <div className="size-11 animate-pulse rounded-full bg-fill" />
        </div>
        <div className="mt-1 h-[41px] w-64 max-w-full animate-pulse rounded-lg bg-fill" />
        <div className="mt-0.5 h-5 w-48 animate-pulse rounded bg-fill-soft" />
      </div>
      {/* Silhouette du panneau d'administration : ses deux sections, repliées à
          l'ouverture (« Gestion des sources », « Gestion des catégories »), chacune
          une ligne de 52 px. Ce squelette imitait auparavant une barre d'actions et
          une liste de sources, que le panneau n'affiche qu'une fois déplié. */}
      <div className="flex flex-col gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-[52px] animate-pulse rounded-[14px] bg-fill-soft" />
        ))}
      </div>
    </div>
  )
}
