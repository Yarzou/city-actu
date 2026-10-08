import type { Metadata } from 'next'
import Link from 'next/link'
import { Newspaper, Rss, CalendarPlus, Database } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BackLink, PageHeader } from '@/components/ui/PageHeader'
import { IconTile, ListRow, ListSection } from '@/components/ui/List'
import { buttonClass } from '@/components/ui/Button'

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
    color: '#b35a0a',
    title: 'Flux RSS',
    body: 'Les sites qui en publient un sont relus tel quel : titre, résumé et date de parution viennent de la source.',
  },
  {
    icon: Newspaper,
    color: '#56657a',
    title: 'Lecture de page',
    body: "Quand il n'y a pas de flux, la page de la liste est lue directement, et la page de détail quand elle seule porte les dates de l'événement.",
  },
  {
    icon: Database,
    color: '#2f6fb3',
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
  const count = sourceCount ?? 0

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-safe sm:px-6">
      <PageHeader leading={<BackLink href={`/${citySlug}`} label="Retour aux actus" />} title="À propos" />

      <p className="text-body text-ink">
        Ville Actu rassemble en une seule page les actualités de {cityName}, dispersées
        entre le site de la mairie, les agendas culturels et les données ouvertes de la
        métropole. Rien n&apos;est rédigé ici : chaque carte renvoie à l&apos;article
        d&apos;origine.
      </p>

      <ListSection
        header="D’où viennent les actus"
        footer={`${count} source${count > 1 ? 's' : ''} active${count > 1 ? 's' : ''}, relue${count > 1 ? 's' : ''} une fois par jour.`}
      >
        {SOURCE_KINDS.map(({ icon: Icon, color, title, body }) => (
          <ListRow
            key={title}
            leading={
              <IconTile color={color} className="self-start">
                <Icon className="size-[18px]" aria-hidden="true" />
              </IconTile>
            }
            title={title}
            subtitle={body}
          />
        ))}
      </ListSection>

      <section className="flex flex-col gap-2">
        <h2 className="text-title text-ink">Ajouter un événement à son agenda</h2>
        <p className="text-body text-ink-muted">
          Le bouton <CalendarPlus className="inline size-[18px] align-text-bottom text-accent" aria-label="agenda" /> d&apos;une
          carte télécharge un fichier que le calendrier du téléphone sait ouvrir. Il est
          barré quand la source ne publie aucune date — c&apos;est le cas des actualités de
          la mairie, qui n&apos;en indiquent nulle part. Ces actus restent visibles en
          permanence dans le fil plutôt que d&apos;être datées au hasard.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title text-ink">Une erreur, une source à ajouter ?</h2>
        <p className="text-body text-ink-muted">
          Les contenus appartiennent à leurs éditeurs respectifs. Pour signaler une actu
          mal classée ou proposer une source, passez par la page d&apos;origine de
          l&apos;article concerné.
        </p>
      </section>

      <Link href={`/${citySlug}`} className={buttonClass('primary', 'lg')}>
        Voir les actus
      </Link>
    </div>
  )
}
