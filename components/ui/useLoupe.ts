'use client'

import { useEffect, useRef, useState } from 'react'

/** Grossissement de ce que couvre la loupe, autour du doigt. */
export const MAGNIFY = 1.25
/** Temps de réponse de la loupe qui rejoint puis suit le doigt, en ms. */
const FOLLOW_MS = 45

/** Centre et largeur de la loupe, en px depuis le bord intérieur gauche du contrôle. */
export interface Lens {
  center: number
  width: number
}

/**
 * Mouvement de la loupe de verre façon iOS 26 (barre d'onglets, contrôle segmenté ;
 * son rendu est dans GlassLens). Doigt posé, elle part de la pastille au repos, rejoint
 * le doigt et le suit image par image. Le lissage se fait ici et non par une transition
 * CSS : la copie agrandie que porte la loupe reste ainsi calée sur l'original.
 * Avec « Réduire les animations », elle saute sous le doigt.
 */
export function useLoupe() {
  const [lens, setLens] = useState<Lens | null>(null)
  const target = useRef<Lens | null>(null)
  const shown = useRef<Lens | null>(null)
  const frame = useRef({ id: 0, at: 0 })

  useEffect(() => () => cancelAnimationFrame(frame.current.id), [])

  const step = (now: number) => {
    frame.current.id = 0
    const goal = target.current
    const from = shown.current
    if (!goal || !from) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const k = still ? 1 : 1 - Math.exp(-(now - frame.current.at) / FOLLOW_MS)
    frame.current.at = now
    const next = {
      center: from.center + (goal.center - from.center) * k,
      width: from.width + (goal.width - from.width) * k,
    }
    shown.current = next
    setLens(next)
    if (Math.abs(goal.center - next.center) > 0.5 || Math.abs(goal.width - next.width) > 0.5) {
      frame.current.id = requestAnimationFrame(step)
    }
  }

  /** Nouvelle position du doigt : la loupe s'y rend. */
  const follow = (goal: Lens) => {
    target.current = goal
    if (frame.current.id || !shown.current) return
    frame.current.at = performance.now()
    frame.current.id = requestAnimationFrame(step)
  }

  /** Doigt posé : la loupe apparaît sur `from` (la pastille au repos) et part vers `goal`. */
  const grab = (from: Lens, goal: Lens) => {
    shown.current = from
    setLens(from)
    follow(goal)
  }

  /** Doigt levé : la loupe disparaît, la pastille se repose. */
  const drop = () => {
    cancelAnimationFrame(frame.current.id)
    frame.current.id = 0
    target.current = null
    shown.current = null
    setLens(null)
  }

  return { lens, grab, follow, drop }
}
