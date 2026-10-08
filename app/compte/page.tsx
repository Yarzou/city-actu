import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Info, Settings2, UserRound } from 'lucide-react'
import { getSessionIsAdmin, getSessionUser } from '@/lib/auth/session'
import { PasskeyManager } from '@/components/account/PasskeyManager'
import { AppearanceSection, SignOutSection } from '@/components/account/AccountActions'
import { BackLink, PageHeader } from '@/components/ui/PageHeader'
import { IconTile, ListRow, ListSection } from '@/components/ui/List'

/**
 * Page Compte, ouverte à **tout** utilisateur connecté, rejointe par le bouton rond en
 * haut à droite de chaque écran de la ville.
 *
 * Elle rassemble, façon Réglages d'iOS (comme l'onglet Foyer de Fridge) :
 * - « Connexion » : empreinte ou Face ID — appareils autorisés, activation sur cet
 *   appareil, retrait d'un téléphone perdu ;
 * - « Apparence » : thème clair, sombre ou automatique ;
 * - « Administration », pour les administrateurs seulement : l'entrée vers `/profil`,
 *   qui avait jusqu'ici son propre onglet dans la barre basse ;
 * - la déconnexion.
 */

export const metadata: Metadata = {
  title: 'Compte',
  robots: { index: false, follow: false },
}

export default async function AccountPage() {
  const [user, isAdmin] = await Promise.all([getSessionUser(), getSessionIsAdmin()])
  if (!user) redirect('/auth/login')

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-safe sm:px-6">
      <PageHeader leading={<BackLink href="/la-chapelle-sur-erdre" label="Retour aux actus" />} title="Compte" />

      <div className="flex items-center gap-3.5 rounded-[14px] bg-card px-4 py-3.5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white">
          <UserRound className="size-7" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <p className="max-w-full truncate text-headline text-ink">{user.email}</p>
          {isAdmin && (
            <span className="inline-flex h-[22px] items-center rounded-full bg-accent-soft px-2.5 text-footnote font-semibold text-accent">
              Administrateur
            </span>
          )}
        </div>
      </div>

      <PasskeyManager />
      <AppearanceSection />

      {isAdmin && (
        <ListSection header="Administration" footer="Visible seulement par les administrateurs.">
          <ListRow
            href="/profil"
            leading={
              <IconTile color="#56657a">
                <Settings2 className="size-[18px]" aria-hidden="true" />
              </IconTile>
            }
            title="Sources et catégories"
            subtitle="Collecte, sélecteurs, rafraîchissement, résumés"
          />
        </ListSection>
      )}

      <ListSection>
        <ListRow
          href="/a-propos"
          leading={
            <IconTile color="#8e8e93">
              <Info className="size-[18px]" aria-hidden="true" />
            </IconTile>
          }
          title="À propos de Ville Actu"
        />
      </ListSection>

      <SignOutSection />
    </div>
  )
}
