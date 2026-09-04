import Link from 'next/link'
import { Compass } from 'lucide-react'

/**
 * Atteinte par un chemin inconnu, mais aussi par les `notFound()` des pages ville et
 * catégorie : un slug erroné affichait auparavant un feed vide sous un titre égal au
 * slug brut, indiscernable d'une ville sans actualité.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <Compass className="mb-4 size-10 text-brand-600" />
      <h1 className="text-xl font-bold text-gray-900">Cette page n&apos;existe pas</h1>
      <p className="mt-2 text-sm text-gray-600">
        Le lien est peut-être ancien, ou la ville n&apos;est pas encore couverte.
      </p>
{/* Vers la racine, qui renvoie sur la dernière ville visitée. */}
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-ring"
      >
        Voir les actualités
      </Link>
    </div>
  )
}
