import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/authz'

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
 * l'afficher. La déconnexion a rejoint le menu de la barre de navigation, seul point
 * d'accès restant pour un visiteur ordinaire.
 */

// Chargé à la demande : c'est le plus gros composant du projet (~1 500 lignes).
const AdminSourcesPanel = dynamic(
  () => import('@/components/admin/AdminSourcesPanel').then((m) => m.AdminSourcesPanel),
  { loading: () => <div className="h-64 animate-pulse rounded-2xl bg-gray-100" /> }
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/*
        Titre en `sr-only` : la page n'a qu'un seul contenu et le titre en gros
        n'apportait rien à l'écran. Conservé pour les lecteurs d'écran plutôt que
        supprimé — une page sans <h1> annonçable est une régression d'accessibilité.
        Même pratique que le titre de ville sur mobile.
      */}
      <div className="mb-4">
        <h1 className="sr-only">Administration</h1>
        <p className="text-sm text-gray-500">{user.email}</p>
      </div>
      <AdminSourcesPanel />
    </div>
  )
}
