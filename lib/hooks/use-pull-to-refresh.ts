'use client'

import { useEffect, useRef, useState } from 'react'

interface PullToRefreshOptions {
  /** Action déclenchée au relâchement, une fois le seuil franchi. */
  onRefresh: () => void | Promise<void>
  /**
   * Le geste n'est écouté que si vrai. Faux sur desktop et pour les visiteurs qui
   * n'ont pas le droit de rafraîchir : sans ça, on désactiverait le tirer-pour-
   * rafraîchir natif du navigateur sans rien offrir à la place.
   */
  enabled: boolean
  /** Distance à franchir pour armer le déclenchement. */
  threshold?: number
  /** Plafond visuel : au-delà, le geste ne descend plus. */
  maxPull?: number
}

interface PullToRefreshState {
  /** Distance actuelle, en pixels, déjà amortie. 0 quand le geste est inactif. */
  pull: number
  /** Le seuil est franchi : relâcher déclenchera le rafraîchissement. */
  armed: boolean
}

/**
 * Tirer-pour-rafraîchir, sur mobile uniquement.
 *
 * Remplace le bouton « Rafraîchir » de l'en-tête de page, qui coûtait une cible de
 * 44px en haut d'un écran déjà étroit pour une action rare.
 *
 * Trois pièges traités ici :
 *
 * 1. **Le geste natif.** Chrome Android recharge la page sur un tirer vers le bas.
 *    Sans neutralisation, les deux gestes se déclenchent ensemble. `overscroll-behavior-y`
 *    est posé sur `<body>` au montage et retiré au démontage — et non écrit en dur dans
 *    la feuille de styles — pour qu'un visiteur sans ce hook garde le comportement natif.
 *
 * 2. **`preventDefault` sur `touchmove`** exige `{ passive: false }` ; React ne permet
 *    pas de le préciser sur un `onTouchMove`, d'où les écouteurs posés à la main. Il
 *    n'est appelé que pour un geste vers le bas en haut de page : un défilement normal
 *    doit rester intact.
 *
 * 3. **L'identité de `onRefresh`.** Elle passe par une ref, sinon chaque rendu du
 *    parent redéposerait les trois écouteurs.
 */
export function usePullToRefresh({
  onRefresh,
  enabled,
  threshold = 72,
  maxPull = 120,
}: PullToRefreshOptions): PullToRefreshState {
  const [pull, setPull] = useState(0)

  // La distance vit dans une ref, et `pull` n'en est que le miroir d'affichage : les
  // écouteurs sont créés une seule fois par l'effet, ils liraient sinon un `pull` figé
  // à sa valeur du premier rendu. L'écrire ici plutôt que pendant le rendu satisfait
  // aussi la règle « Cannot update ref during render ».
  const pullRef = useRef(0)

  // `null` = aucun geste en cours. Une ref et non du state : suivre chaque pixel du
  // doigt dans le state ferait un rendu par événement `touchmove`.
  const startY = useRef<number | null>(null)
  const busy = useRef(false)

  // Toujours la dernière closure, sans redéposer les écouteurs à chaque rendu du parent.
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  })

  useEffect(() => {
    if (!enabled) return

    const body = document.body
    const previousOverscroll = body.style.overscrollBehaviorY
    body.style.overscrollBehaviorY = 'contain'

    // Amortissement : le doigt parcourt deux fois la distance que l'indicateur
    // descend. C'est ce qui donne au geste sa sensation d'élastique, et ça évite de
    // déclencher sur un effleurement.
    const damp = (delta: number) => Math.min(maxPull, delta / 2)

    function handleStart(event: TouchEvent) {
      // Pas au sommet, geste déjà en cours, ou deux doigts (pincement) : on ne prend pas.
      if (busy.current || event.touches.length !== 1 || window.scrollY > 0) {
        startY.current = null
        return
      }
      startY.current = event.touches[0].clientY
    }

    function handleMove(event: TouchEvent) {
      if (startY.current === null) return

      const delta = event.touches[0].clientY - startY.current

      // Geste vers le haut, ou la page a défilé entre-temps : on rend la main au
      // défilement normal plutôt que de retenir le doigt.
      if (delta <= 0 || window.scrollY > 0) {
        startY.current = null
        pullRef.current = 0
        setPull(0)
        return
      }

      event.preventDefault()
      pullRef.current = damp(delta)
      setPull(pullRef.current)
    }

    async function handleEnd() {
      if (startY.current === null) return
      startY.current = null

      const reached = pullRef.current >= threshold
      pullRef.current = 0
      setPull(0)
      if (!reached) return

      busy.current = true
      try {
        await onRefreshRef.current()
      } finally {
        busy.current = false
      }
    }

    function handleCancel() {
      startY.current = null
      pullRef.current = 0
      setPull(0)
    }

    // `passive: false` uniquement sur `touchmove`, le seul qui appelle preventDefault.
    window.addEventListener('touchstart', handleStart, { passive: true })
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleEnd)
    window.addEventListener('touchcancel', handleCancel)

    return () => {
      window.removeEventListener('touchstart', handleStart)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
      window.removeEventListener('touchcancel', handleCancel)
      body.style.overscrollBehaviorY = previousOverscroll
    }
  }, [enabled, threshold, maxPull])

  return { pull, armed: pull >= threshold }
}
