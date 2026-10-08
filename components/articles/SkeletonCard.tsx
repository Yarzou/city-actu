import { cn } from '@/lib/utils'

interface SkeletonCardProps {
  className?: string
}

/**
 * Silhouette de la carte compacte : catégorie, deux lignes de titre, horaire, vignette
 * carrée à droite, pied de carte. Même géométrie que la vraie carte, sinon la mise en
 * page saute au moment où les squelettes cèdent la place au contenu.
 */
export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div className={cn('animate-pulse overflow-hidden rounded-[20px] bg-card shadow-lift', className)}>
      <div className="flex gap-3 px-4 pt-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
          <div className="h-[18px] w-28 rounded-md bg-fill-soft" />
          <div className="h-4 w-full rounded bg-fill" />
          <div className="h-4 w-3/4 rounded bg-fill" />
          <div className="h-3.5 w-24 rounded bg-fill-soft" />
        </div>
        <div className="size-[84px] shrink-0 rounded-[14px] bg-fill-soft" />
      </div>
      <div className="flex items-center justify-between py-3.5 pl-4 pr-4">
        <div className="h-3 w-28 rounded bg-fill-soft" />
        <div className="flex gap-3">
          <div className="size-5 rounded-full bg-fill-soft" />
          <div className="size-5 rounded-full bg-fill-soft" />
          <div className="size-5 rounded-full bg-fill-soft" />
        </div>
      </div>
    </div>
  )
}
