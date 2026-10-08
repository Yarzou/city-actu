'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Hauteur défilée au-delà de laquelle le bouton apparaît. Un écran environ. */
const SHOW_AFTER_PX = 700

/**
 * Bouton « haut de page », rond et en verre, qui n'apparaît qu'après un écran de
 * défilement.
 *
 * Le feed charge trois pages au scroll avant de passer au bouton « Voir plus » :
 * soixante cartes plus bas, revenir aux filtres demandait de tout remonter au pouce.
 * Il se pose juste au-dessus de la barre d'onglets flottante (`bottom-toast`). Un
 * appui sur l'onglet déjà actif fait la même chose.
 */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        setVisible(window.scrollY > SHOW_AFTER_PX)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Revenir en haut de la page"
      // `aria-hidden` + `tabIndex=-1` quand il est invisible : un bouton transparent
      // resterait sinon dans l'ordre de tabulation et serait annoncé pour rien.
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        'glass bottom-toast fixed right-4 z-30 inline-flex size-11 items-center justify-center rounded-full text-ink transition-all focus-ring',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
      )}
      style={{ marginRight: 'var(--sar)' }}
    >
      <ArrowUp className="size-5" strokeWidth={2.4} />
    </button>
  )
}
