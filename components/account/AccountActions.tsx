'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTheme, type ThemeChoice } from '@/components/theme/ThemeProvider'
import { ListRow, ListSection } from '@/components/ui/List'
import { Segmented } from '@/components/ui/Segmented'

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Automatique' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
]

/**
 * Choix du thème. Il vivait dans le menu de la barre haute, supprimée avec la refonte :
 * il rejoint la page Compte, comme les réglages d'affichage d'une appli iOS.
 * Préférence d'appareil, gardée dans `localStorage` par `ThemeProvider`.
 */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  return (
    <ListSection header="Apparence" footer="« Automatique » suit le réglage clair ou sombre de l’appareil.">
      <div className="p-2">
        <Segmented label="Thème de l'interface" value={theme} onChange={setTheme} options={THEME_OPTIONS} />
      </div>
    </ListSection>
  )
}

/**
 * Déconnexion. Elle était dans le menu de la barre haute ; elle termine désormais la
 * page Compte, en rouge, à la manière d'iOS. Navigation complète vers l'accueil
 * ensuite : la page ville se relit sans session.
 */
export function SignOutSection() {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  async function signOut() {
    setLeaving(true)
    await createClient().auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <ListSection>
      <ListRow title={leaving ? 'Déconnexion…' : 'Se déconnecter'} tone="danger" centered onClick={signOut} disabled={leaving} />
    </ListSection>
  )
}
