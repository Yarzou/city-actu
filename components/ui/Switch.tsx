'use client'

import { useRef, useState, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'

/**
 * Interrupteur iOS (51 × 31), repris de Fridge. Le bouton fait 44 px de haut : la zone
 * de touche dépasse la piste. La pastille (27 px) est ancrée à gauche et glisse de
 * 20 px, sans jamais sortir de la piste.
 *
 * Comme sur iOS 26, la pastille réagit au doigt :
 * - posé, elle grandit (42 × 39) et devient une goutte de verre clair qui dépasse de la
 *   piste de 4 px en haut, en bas et du côté où elle est : on voit au travers la couleur
 *   de la piste et son bord, sous un liseré, des reflets et une frange colorée
 *   (`shadow-refraction`) ;
 * - glissé, elle passe du côté où va le doigt, et l'interrupteur prend cette position
 *   au lâcher ;
 * - un simple toucher bascule l'interrupteur.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Libellé lu par les lecteurs d'écran (le bouton n'a pas de texte). */
  label: string
  disabled?: boolean
}) {
  const gesture = useRef<{ startX: number; moved: boolean } | null>(null)
  const swallowClick = useRef(false)
  const [pressed, setPressed] = useState(false)
  // Position visée pendant un glissé ; null hors glissé
  const [aim, setAim] = useState<boolean | null>(null)
  const on = aim ?? checked

  const reset = () => {
    gesture.current = null
    setPressed(false)
    setAim(null)
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    gesture.current = { startX: e.clientX, moved: false }
    swallowClick.current = false
    setPressed(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.startX
    if (!g.moved) {
      if (Math.abs(dx) < 6) return
      g.moved = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setAim(dx > 0)
  }

  const onPointerUp = () => {
    const moved = gesture.current?.moved
    reset()
    if (!moved) return
    // Fin d'un glissé : la position est choisie ici, pas par le clic qui suit
    swallowClick.current = true
    if (aim !== null && aim !== checked) onChange(aim)
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onPointerLeave={() => {
        // Souris sortie sans glisser : la pastille se repose
        if (!gesture.current?.moved) reset()
      }}
      onClick={(e) => {
        // Le clic du clavier (detail 0) n'est jamais celui d'un glissé
        if (swallowClick.current && e.detail !== 0) {
          swallowClick.current = false
          return
        }
        onChange(!checked)
      }}
      className="flex h-11 shrink-0 touch-pan-y select-none items-center focus-ring disabled:opacity-40"
    >
      <span className={cn('relative h-[31px] w-[51px] rounded-full transition-colors duration-200', on ? 'bg-accent-fill' : 'bg-fill')}>
        <span
          className={cn(
            'absolute left-0.5 rounded-full',
            'transition-[top,height,width,transform,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none',
            pressed
              ? cn(
                  // Goutte : 4 px au-delà de la piste en haut, en bas et du côté où elle est.
                  // Flou et saturation légers : plus forts, la goutte se fondait dans la piste allumée.
                  '-top-1 h-[39px] w-[42px] bg-drop shadow-refraction backdrop-blur-[0.5px] backdrop-saturate-[1.3]',
                  on ? 'translate-x-[11px]' : '-translate-x-1.5'
                )
              : cn('top-0.5 h-[27px] w-[27px] bg-knob shadow-[0_2px_4px_rgba(0,0,0,0.2)]', on ? 'translate-x-5' : 'translate-x-0')
          )}
        />
      </span>
    </button>
  )
}
