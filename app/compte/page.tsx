import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { PasskeyManager } from '@/components/account/PasskeyManager'

/**
 * Page de compte, ouverte à **tout** utilisateur connecté — à la différence de
 * `/profil`, réservée à l'administration et en 404 pour les autres.
 *
 * Elle porte pour l'instant la seule gestion des appareils autorisés à se connecter
 * par empreinte ou visage : la proposition d'activation après connexion
 * (`app/auth/login/page.tsx`) n'offre pas de retour en arrière, et il faut pouvoir
 * retirer un téléphone perdu.
 */

export const metadata: Metadata = {
  title: 'Mon compte',
  robots: { index: false, follow: false },
}

export default async function AccountPage() {
  const user = await getSessionUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">Mon compte</h1>
      <p className="mt-1 text-sm text-gray-500">{user.email}</p>
      <PasskeyManager />
    </div>
  )
}
