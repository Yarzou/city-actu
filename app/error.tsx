'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/Button'

/**
 * Frontière d'erreur de l'application.
 *
 * Il n'en existait aucune : chaque page dépend d'un appel réseau, et une erreur de
 * rendu donnait l'écran par défaut de Next, sans aucun moyen de réessayer.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Ville Actu] erreur de rendu:', error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 pt-safe">
      <EmptyState
        icon={TriangleAlert}
        tone="danger"
        title="Une erreur est survenue"
        action={
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <button type="button" onClick={reset} className={buttonClass('primary', 'md', 'px-6')}>
              <RotateCcw className="size-4" />
              Réessayer
            </button>
            <Link href="/" className={buttonClass('tinted', 'md', 'px-6')}>
              Retour à l&apos;accueil
            </Link>
          </div>
        }
      >
        <p>
          La page n&apos;a pas pu s&apos;afficher. Cela vient souvent d&apos;une connexion
          instable.
        </p>
        {error.digest && <p className="mt-4 text-footnote">Référence : {error.digest}</p>}
      </EmptyState>
    </div>
  )
}
