'use client'

import { useEffect, useState } from 'react'
import { FingerprintPattern, Laptop, Loader2, Plus, Smartphone } from 'lucide-react'
import type { PasskeyListItem } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { enrollThisDevice, usePasskeySupport, type PasskeyFailure } from '@/lib/auth/passkey'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconTile, ListRow, ListSection } from '@/components/ui/List'
import { Notice } from '@/components/ui/Notice'
import { PasskeyNotice } from './PasskeyNotice'

// Fuseau figé, comme le reste du projet : le serveur tourne en UTC.
const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
})

function formatDate(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '' : DATE_FORMAT.format(time)
}

function displayName(passkey: PasskeyListItem): string {
  return passkey.friendly_name?.trim() || 'Appareil sans nom'
}

/** Téléphone ou ordinateur, deviné du nom tiré du user agent à la création. */
function DeviceIcon({ name }: { name: string }) {
  const Icon = /iphone|ipad|android|mobile|téléphone/i.test(name) ? Smartphone : Laptop
  return (
    <span className="flex w-[30px] items-center justify-center text-ink-muted">
      <Icon className="size-5" aria-hidden="true" />
    </span>
  )
}

/**
 * Section « Connexion » de la page Compte : empreinte ou Face ID, appareils autorisés,
 * activation sur cet appareil, retrait. Même présentation que dans Fridge — une liste
 * groupée façon Réglages d'iOS.
 *
 * La liste vient de Supabase (`auth.passkey.list()`, session du navigateur). Elle ne dit
 * pas **quel** appareil porte quelle passkey — d'où les noms tirés du user agent à la
 * création (`enrollThisDevice`).
 */
export function PasskeyManager() {
  const supported = usePasskeySupport()
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [passkeys, setPasskeys] = useState<PasskeyListItem[]>([])
  const [attempt, setAttempt] = useState(0)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<PasskeyListItem | null>(null)
  const [notice, setNotice] = useState<PasskeyFailure | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await createClient().auth.passkey.list()
      if (cancelled) return
      if (error) {
        // Une panne n'est pas une liste vide : « aucun appareil » inciterait à en
        // ajouter un qui existe peut-être déjà.
        console.error('[Passkey] liste impossible:', error)
        setState('error')
        return
      }
      setPasskeys(data ?? [])
      setState('ready')
    }

    load()
    return () => { cancelled = true }
  }, [attempt])

  // Retour à « chargement » dans le gestionnaire et non dans l'effet, comme
  // `FavoritesTab` : un setState synchrone en début d'effet rend en cascade.
  function retry() {
    setState('loading')
    setAttempt((n) => n + 1)
  }

  async function addDevice() {
    setAdding(true)
    setNotice(null)
    setConfirmation(null)
    const result = await enrollThisDevice()
    setAdding(false)
    if (!result.ok) {
      setNotice(result.failure)
      return
    }
    setConfirmation('Cet appareil est activé : la prochaine fois, connectez-vous avec votre empreinte ou votre visage.')
    // Rechargement sans repasser par « chargement » : la liste reste affichée.
    setAttempt((n) => n + 1)
  }

  async function confirmRemoval() {
    const target = pendingRemoval
    if (!target) return
    setPendingRemoval(null)
    setRemovingId(target.id)
    setNotice(null)
    setConfirmation(null)
    const { error } = await createClient().auth.passkey.delete({ passkeyId: target.id })
    setRemovingId(null)
    if (error) {
      console.error('[Passkey] retrait impossible:', error)
      setNotice({ kind: 'error', message: 'Le retrait a échoué. Réessayez.' })
      return
    }
    // Retirée de la liste seulement une fois le retrait confirmé par Supabase.
    setPasskeys((list) => list.filter((p) => p.id !== target.id))
    setConfirmation(`« ${displayName(target)} » ne peut plus vous connecter.`)
  }

  const count = passkeys.length
  const status =
    state === 'loading'
      ? 'Chargement…'
      : state === 'error'
        ? 'Impossible de charger vos appareils'
        : count > 0
          ? `Activée sur ${count} appareil${count > 1 ? 's' : ''}`
          : 'Pas encore activée'

  return (
    <div className="flex flex-col gap-2">
      <ListSection
        header="Connexion"
        footer={
          supported
            ? 'Votre visage et votre empreinte restent sur l’appareil : Ville Actu ne les reçoit jamais. Votre mot de passe reste valable.'
            : 'Ce navigateur ne permet pas la connexion par empreinte ou visage. Vous pouvez tout de même retirer un appareil.'
        }
      >
        <ListRow
          leading={
            <IconTile className="bg-accent-fill">
              <FingerprintPattern className="size-[18px]" aria-hidden="true" />
            </IconTile>
          }
          title="Empreinte ou Face ID"
          subtitle={status}
        />
        {state === 'error' && (
          <ListRow leading={<span className="w-[30px]" />} title="Réessayer" tone="accent" onClick={retry} />
        )}
        {state === 'ready' &&
          passkeys.map((passkey) => (
            <ListRow
              key={passkey.id}
              leading={<DeviceIcon name={displayName(passkey)} />}
              title={<span className="block truncate">{displayName(passkey)}</span>}
              subtitle={`Ajouté le ${formatDate(passkey.created_at)}${passkey.last_used_at ? ` · utilisé le ${formatDate(passkey.last_used_at)}` : ''}`}
              trailing={
                <button
                  type="button"
                  onClick={() => setPendingRemoval(passkey)}
                  disabled={removingId !== null}
                  aria-label={`Retirer ${displayName(passkey)}`}
                  className="inline-flex h-11 shrink-0 items-center gap-1 text-subhead text-danger disabled:opacity-50 focus-ring"
                >
                  {removingId === passkey.id && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  Retirer
                </button>
              }
            />
          ))}
        {supported && state !== 'error' && (
          <ListRow
            leading={
              <span className="flex w-[30px] items-center justify-center text-accent">
                {adding ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Plus className="size-5" strokeWidth={2.4} aria-hidden="true" />}
              </span>
            }
            title={adding ? 'Activation…' : 'Activer sur cet appareil'}
            tone="accent"
            onClick={addDevice}
            disabled={adding || state === 'loading'}
          />
        )}
      </ListSection>

      {notice && <PasskeyNotice failure={notice} />}
      {confirmation && <Notice tone="success">{confirmation}</Notice>}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Retirer cet appareil ?"
        message={
          pendingRemoval
            ? `« ${displayName(pendingRemoval)} » ne pourra plus vous connecter par empreinte ou visage. Votre mot de passe reste valable.`
            : ''
        }
        confirmLabel="Retirer"
        destructive
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  )
}
