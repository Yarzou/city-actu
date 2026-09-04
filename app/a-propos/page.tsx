import type { Metadata } from 'next'
import Link from 'next/link'
import { Newspaper, Rss, CalendarDays, Database } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

/**
 * Le pied de page pointait vers `/a-propos` sur toutes les pages du site, alors que
 * la route n'existait pas : un lien mort permanent qui tombait sur le 404 par défaut.
 */

export const metadata: Metadata = {
  title: 'À propos',
  description:
    "Comment Ville Actu agrège les actualités locales : sources, fréquence de collecte et fonctionnement de l'agenda.",
}

const SOURCE_KINDS = [
  {
    icon: Rss,
    title: 'Flux RSS',
    body: 'Les sites qui en publient un sont relus tel quel : titre, résumé et date de parution viennent de la source.',
  },
  {
    icon: Newspaper,
    title: 'Lecture de page',
    body: "Quand il n'y a pas de flux, la page de la liste est lue directement, et la page de détail quand elle seule porte les dates de l'événement.",
  },
  {
    icon: Database,
    title: 'Données ouvertes',
    body: "L'agenda passe par l'API open data de Nantes Métropole, qui expose les événements de la commune avec leurs dates et leur lieu.",
  },
]

export default async function AboutPage() {
  const supabase = await createClient()

  // Compté à la lecture plutôt que codé en dur : la liste des sources est éditable
  // depuis l'administration, un nombre figé ici deviendrait faux au premier ajout.
  const [{ count: sourceCount }, { data: city }] = await Promise.all([
    supabase.from('sources').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('cities').select('name,slug').limit(1).maybeSingle(),
  ])

  const cityName = (city as { name: string } | null)?.name ?? 'La Chapelle-sur-Erdre'
  const citySlug = (city as { slug: string } | null)?.slug ?? 'la-chapelle-sur-erdre'

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">À propos de Ville Actu</h1>
      <p className="mt-3 text-gray-600">
        Ville Actu rassemble en une seule page les actualités de {cityName}, dispersées
        entre le site de la mairie, les agendas culturels et les données ouvertes de la
        métropole. Rien n&apos;est rédigé ici : chaque carte renvoie à l&apos;article
        d&apos;origine.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-gray-900">D&apos;où viennent les actus</h2>
      <p className="mt-2 text-sm text-gray-600">
        {sourceCount ?? 0} source{(sourceCount ?? 0) > 1 ? 's' : ''} active
        {(sourceCount ?? 0) > 1 ? 's' : ''}, relue{(sourceCount ?? 0) > 1 ? 's' : ''} une
        fois par jour, selon trois mécanismes :
      </p>
      <ul className="mt-4 space-y-3">
        {SOURCE_KINDS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-4">
            <Icon className="mt-0.5 size-5 shrink-0 text-brand-600" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{title}</p>
              <p className="mt-1 text-sm text-gray-600">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-gray-900">Ajouter un événement à son agenda</h2>
      <p className="mt-2 text-sm text-gray-600">
        Le bouton <CalendarDays className="inline size-4 align-text-bottom text-brand-600" /> d&apos;une
        carte télécharge un fichier que le calendrier du téléphone sait ouvrir. Il est
        barré quand la source ne publie aucune date — c&apos;est le cas des actualités de
        la mairie, qui n&apos;en indiquent nulle part. Ces actus restent visibles en
        permanence dans le fil plutôt que d&apos;être datées au hasard.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-gray-900">Une erreur, une source à ajouter ?</h2>
      <p className="mt-2 text-sm text-gray-600">
        Les contenus appartiennent à leurs éditeurs respectifs. Pour signaler une actu
        mal classée ou proposer une source, passez par la page d&apos;origine de
        l&apos;article concerné.
      </p>

      <Link
        href={`/${citySlug}`}
        className="mt-10 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-ring"
      >
        Voir les actus
      </Link>
    </div>
  )
}
