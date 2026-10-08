import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/authz'
import { BackLink, PageHeader } from '@/components/ui/PageHeader'

/**
 * Page d'administration.
 *
 * Elle mélangeait auparavant deux onglets : « Favoris » et « Admin ». Les favoris
 * sont devenus une destination de la barre de navigation basse (`?tab=favoris` sur la
 * page ville) — l'onglet faisait donc doublon, et sa requête l'était aussi, dupliquée
 * octet pour octet avec celle de `FavoritesTab`.
 *
 * Le garde est désormais **serveur** : un non-administrateur ne reçoit plus le
 * panneau du tout, alors que le garde client précédent se contentait de ne pas
 * l'afficher.
 *
 * Depuis la refonte « Givre », on y arrive par la section « Administration » de la
 * page « Compte », et non plus par une entrée de la barre d'onglets : le retour du
 * grand titre ramène donc à `/compte`.
 */

// Chargé à la demande : c'est le plus gros composant du projet (~1 400 lignes).
const AdminSourcesPanel = dynamic(
  () => import('@/components/admin/AdminSourcesPanel').then((m) => m.AdminSourcesPanel),
  { loading: () => <div className="h-64 animate-pulse rounded-[14px] bg-fill-soft" /> }
)

export const metadata: Metadata = {
  title: 'Administration',
  // Rien à indexer ici, et la page renvoie 404 à presque tout le monde.
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // 404 et non une redirection : la page ne doit pas révéler qu'elle existe.
  if (!(await isAdminUser(supabase, user.id))) notFound()

  return (
    // Pas de `pb` : le layout réserve déjà la place de la barre d'onglets flottante.
    // `pt-safe` remplace l'ancienne barre haute, il ne reste que la barre d'état.
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-safe sm:px-6">
      {/* Le titre redevient visible : sans barre haute, chaque écran porte son propre
          grand titre — c'est lui le <h1> annonçable, qui était jusqu'ici en sr-only. */}
      <PageHeader
        leading={<BackLink href="/compte" label="Retour au compte" />}
        title="Administration"
        subtitle={user.email}
      />
      <AdminSourcesPanel />
    </div>
  )
}
