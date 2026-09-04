'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw, TriangleAlert } from 'lucide-react'

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
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <TriangleAlert className="mb-4 size-10 text-red-500" />
      <h1 className="text-xl font-bold text-gray-900">Une erreur est survenue</h1>
      <p className="mt-2 text-sm text-gray-600">
        La page n&apos;a pas pu s&apos;afficher. Cela vient souvent d&apos;une connexion
        instable.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-ring"
        >
          <RotateCcw className="size-4" />
          Réessayer
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-ring"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-gray-400">Référence : {error.digest}</p>
      )}
    </div>
  )
}
