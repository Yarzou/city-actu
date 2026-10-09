'use client'

import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { GlassLens } from '@/components/ui/GlassLens'
import { useLoupe } from '@/components/ui/useLoupe'
import { cn } from '@/lib/utils'

interface SegmentedProps<T extends string> {
  options: { value: T; label: ReactNode; ariaLabel?: string }[]
  value: T
  onChange: (value: T) => void
  /** Libellé du groupe pour les lecteurs d'écran. */
  label: string
  className?: string
  /** Classes de chaque segment (hauteur, taille du texte). */
  itemClassName?: string
  style?: CSSProperties
}

/** Marge intérieure du contrôle (p-0.5) et écart entre segments (gap-0.5), en px. */
const INSET = 2
const GAP = 2
/** La loupe dépasse la pastille de 6 px de chaque côté, soit 4 px au-delà du contrôle. */
const GROW = 6

/**
 * Contrôle segmenté iOS 26, repris tel quel de Fridge : capsule grise, segment choisi
 * en relief. Le relief est une pastille qui se déplace, comme la bulle de la barre
 * d'onglets :
 * - doigt posé, elle se soulève en loupe de verre clair, plus grande que le contrôle
 *   (GlassLens) : elle rejoint le doigt, le suit d'un segment à l'autre et agrandit les
 *   libellés qu'elle couvre ;
 * - au lâcher, elle se pose sur le segment touché, ou sur le plus proche après un
 *   glissé, en s'étirant comme une goutte, et ce segment est choisi.
 * Le défilement vertical de la page reste libre (`touch-pan-y`) : s'il prend le geste,
 * rien n'est choisi. Avec « Réduire les animations », la pastille se déplace sans effet.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  itemClassName = 'h-8 text-subhead',
  style,
}: SegmentedProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ startX: number; dragging: boolean } | null>(null)
  const swallowClick = useRef(false)
  const { lens, grab, follow, drop } = useLoupe()
  // Largeur et hauteur du contrôle, mesurées quand le doigt se pose
  const [span, setSpan] = useState(0)
  const [height, setHeight] = useState(0)
  // La goutte ne se déforme qu'après un premier geste, pas à l'affichage
  const [touched, setTouched] = useState(false)

  const count = options.length
  const index = options.findIndex((option) => option.value === value)
  const segmentWidth = (width: number) => (width - INSET * 2 - GAP * (count - 1)) / count
  const segmentAt = (x: number, width: number) =>
    Math.min(count - 1, Math.max(0, Math.floor((x - INSET + GAP / 2) / (segmentWidth(width) + GAP))))
  const localX = (clientX: number) => clientX - rootRef.current!.getBoundingClientRect().left

  const choose = (next: number) => {
    if (next !== index) onChange(options[next].value)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gesture.current = { startX: e.clientX, dragging: false }
    swallowClick.current = false
    setTouched(true)
    // La loupe part de la pastille du segment choisi pour rejoindre le doigt.
    const { width, height: h } = rootRef.current!.getBoundingClientRect()
    const x = localX(e.clientX)
    const w = segmentWidth(width)
    const start = index >= 0 ? index : segmentAt(x, width)
    setSpan(width)
    setHeight(h)
    grab({ center: INSET + start * (w + GAP) + w / 2, width: w }, { center: x, width: w })
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g) return
    if (!g.dragging && Math.abs(e.clientX - g.startX) >= 8) {
      g.dragging = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    follow({ center: localX(e.clientX), width: segmentWidth(span) })
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    gesture.current = null
    drop()
    if (!g) return
    if (g.dragging) {
      swallowClick.current = true
      choose(segmentAt(localX(e.clientX), span))
      return
    }
    // Simple toucher : le segment est choisi dès le lâcher, la pastille y part sans
    // détour ; le clic qui suit n'a plus rien à faire.
    const segment = (e.target as Element).closest<HTMLElement>('[data-segment]')
    if (!segment) return
    swallowClick.current = true
    choose(Number(segment.dataset.segment))
  }

  // Le navigateur a pris le geste (défilement) : rien n'est choisi
  const onPointerCancel = () => {
    gesture.current = null
    drop()
  }

  const lifted = lens !== null && span > 0
  const shown = lifted ? segmentAt(lens.center, span) : index
  // Au repos, la pastille se place en pourcentages (aucune mesure) ; doigt posé, elle
  // est centrée sous le doigt, sans sortir du contrôle, et cachée sous la loupe, qu'elle
  // suit pour partir de là au lâcher.
  let thumb: CSSProperties = {
    width: `calc((100% - ${INSET * 2 + GAP * (count - 1)}px) / ${count})`,
    transform: `translateX(calc(${index} * (100% + ${GAP}px)))`,
  }
  let left = 0
  if (lifted) {
    left = Math.min(Math.max(lens.center - lens.width / 2, INSET), span - INSET - lens.width)
    thumb = { width: lens.width, transform: `translateX(${left - INSET}px)` }
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => {
        // Souris sortie sans glisser : la pastille se repose
        if (!gesture.current?.dragging) onPointerCancel()
      }}
      onClickCapture={(e) => {
        // Choix déjà fait au lâcher : pas de second clic. Le clic du clavier (detail 0)
        // n'est jamais celui d'un toucher.
        if (swallowClick.current && e.detail !== 0) {
          e.preventDefault()
          e.stopPropagation()
          swallowClick.current = false
        }
      }}
      className={cn('relative grid touch-pan-y select-none gap-0.5 rounded-full bg-fill p-0.5', className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, ...style }}
    >
      {(index >= 0 || lifted) && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0.5 left-0.5',
            // Sous la loupe, elle la suit image par image, sans transition.
            !lifted && 'transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none'
          )}
          style={thumb}
        >
          <span
            key={touched ? index : 'repos'}
            className={cn(
              'block h-full w-full rounded-full bg-seg shadow-[0_2px_8px_rgba(0,0,0,0.12)]',
              lifted ? 'opacity-0' : touched && 'motion-safe:animate-bubble'
            )}
          />
        </span>
      )}

      {lifted && (
        // Le contrôle n'a pas de flou à lui : la loupe peut y être posée et voir la page
        // au travers.
        <GlassLens
          rest={{ left, top: INSET, width: lens.width, height: height - INSET * 2 }}
          grow={GROW}
          surface={{ left: 0, top: 0, width: span, height }}
          surfaceClassName="bg-loupe"
          content={{ left: INSET, top: INSET, width: span - INSET * 2, height: height - INSET * 2 }}
          focus={lens.center}
        >
          {/* Copie des libellés, aux mêmes classes que les boutons : elle tombe pile dessus */}
          <span className="grid h-full" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, columnGap: GAP }}>
            {options.map((option, i) => (
              <span
                key={option.value}
                className={cn(
                  'flex min-w-0 items-center justify-center gap-1.5 truncate px-3 text-ink',
                  i === shown ? 'font-semibold' : 'font-medium',
                  itemClassName
                )}
              >
                {option.label}
              </span>
            ))}
          </span>
        </GlassLens>
      )}

      {options.map((option, i) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            draggable={false}
            data-segment={i}
            aria-pressed={active}
            aria-label={option.ariaLabel}
            onClick={() => {
              setTouched(true)
              onChange(option.value)
            }}
            className={cn(
              'relative z-10 flex min-w-0 items-center justify-center gap-1.5 truncate rounded-full px-3 text-ink focus-ring',
              i === shown ? 'font-semibold' : 'font-medium',
              itemClassName
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
