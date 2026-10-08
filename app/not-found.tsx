import Link from 'next/link'
import { Compass } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/Button'

/**
 * Atteinte par un chemin inconnu, mais aussi par les `notFound()` des pages ville et
 * administration : un slug erroné affichait auparavant un feed vide sous un titre égal
 * au slug brut, indiscernable d'une ville sans actualité.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 pt-safe">
      <EmptyState
        icon={Compass}
        title="Cette page n’existe pas"
        action={
          <Link href="/la-chapelle-sur-erdre" className={buttonClass('primary', 'md', 'px-6')}>
            Voir les actus de La Chapelle-sur-Erdre
          </Link>
        }
      >
        Le lien est peut-être ancien, ou la ville n&apos;est pas encore couverte.
      </EmptyState>
    </div>
  )
}
