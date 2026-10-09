'use client'

import type { CSSProperties, ReactNode } from 'react'
import { MAGNIFY } from '@/components/ui/useLoupe'
import { cn } from '@/lib/utils'

/** Rectangle en px, dans le repère de l'élément qui positionne la loupe. */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Loupe de verre clair d'iOS 26 (barre d'onglets, contrôle segmenté), sous le doigt,
 * reprise de Fridge. Elle part de la pastille au repos (`rest`) et grandit de `grow` px
 * de chaque côté : elle déborde du contrôle, comme sur iOS.
 * - Sous le verre, la surface du contrôle (`surface`) est recouverte d'un fond opaque
 *   (`surfaceClassName`) qui cache les originaux. Au-delà, là où la loupe déborde, on
 *   voit la page au travers, floutée.
 * - Par-dessus, une copie de ce que couvre la loupe (`children`, posée sur `content`),
 *   agrandie ×MAGNIFY autour du doigt (`focus`) : nette au centre, floutée et frangée
 *   de couleur vers le bord, comme la lumière que le verre dévie. L'onglet voisin, à
 *   moitié sous le bord, y paraît déformé.
 * - Liseré, reflets et ombre : `shadow-refraction`.
 *
 * À poser hors de tout élément à `backdrop-filter` (la barre d'onglets en a un) : le
 * flou de la loupe ne verrait que le contenu de cet élément, et la page ne paraîtrait
 * pas au travers de ce qui déborde.
 */
export function GlassLens({
  rest,
  grow,
  surface,
  surfaceClassName,
  content,
  focus,
  children,
}: {
  rest: Rect
  grow: number
  /** Surface du contrôle (rayon complet), recouverte sous la loupe */
  surface: Rect
  /** Fond qui la recouvre (bg-loupe) */
  surfaceClassName: string
  /** Zone des originaux que `children` recopie, à la même taille */
  content: Rect
  /** Abscisse du doigt : le point qui reste fixe quand la copie grossit */
  focus: number
  children: ReactNode
}) {
  const box: Rect = {
    left: rest.left - grow,
    top: rest.top - grow,
    width: rest.width + grow * 2,
    height: rest.height + grow * 2,
  }
  const at = (r: Rect): CSSProperties => ({
    left: r.left - box.left,
    top: r.top - box.top,
    width: r.width,
    height: r.height,
  })
  const magnified: CSSProperties = {
    ...at(content),
    transform: `scale(${MAGNIFY})`,
    transformOrigin: `${focus - content.left}px 50%`,
  }
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-20"
      style={{ width: box.width, height: box.height, transform: `translate(${box.left}px, ${box.top}px)` }}
    >
      <span
        className="relative block h-full w-full overflow-hidden rounded-full bg-drop shadow-refraction backdrop-blur-[3px] backdrop-saturate-[1.8] motion-safe:animate-lens"
        style={{ '--lens-from-x': rest.width / box.width, '--lens-from-y': rest.height / box.height } as CSSProperties}
      >
        <span className={cn('absolute rounded-full', surfaceClassName)} style={at(surface)} />
        {/* Bord : la copie agrandie, floutée et frangée de couleur */}
        <span className="lens-fringe absolute inset-0">
          <span className="absolute" style={magnified}>
            {children}
          </span>
        </span>
        {/* Centre : la même copie, nette */}
        <span className="lens-core absolute inset-0">
          <span className="absolute" style={magnified}>
            {children}
          </span>
        </span>
      </span>
    </span>
  )
}
