import { cn } from '@/lib/utils'

/**
 * Pastille de filtre (catégorie, menu « Quand ») : capsule blanche bordée au repos,
 * pleine dans l'accent une fois choisie.
 *
 * 36 px à l'œil, 44 px au doigt : un pseudo-élément prolonge la zone de touche au-dessus
 * et en dessous, sans épaissir la rangée. Le bord est une ombre intérieure et non une
 * `border`, pour que la pastille ne change pas de taille en passant à l'état choisi.
 */
export function chipClass(active: boolean, className?: string) {
  return cn(
    "relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-subhead font-medium transition-colors focus-ring after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
    active ? 'bg-accent-fill text-white' : 'bg-card text-ink shadow-[inset_0_0_0_0.5px_var(--chip-edge)]',
    className
  )
}
