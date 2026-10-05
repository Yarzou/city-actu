'use client'

import { useEffect, useState } from 'react'
import { FingerprintPattern, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react'
import type { PasskeyListItem } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { enrollThisDevice, usePasskeySupport, type PasskeyFailure } from '@/lib/auth/passkey'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PasskeyNotice } from './PasskeyNotice'

// Fuseau figé, comme le reste du projet : le serveur tourne en UTC.
const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function formatDate(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '' : DATE_FORMAT.format(time)
}

function displayName(passkey: PasskeyListItem): string {
  return passkey.friendly_name?.trim() || 'Appareil sans nom'
}

/**
 * Appareils autorisés à se connecter par empreinte ou visage : liste, ajout, retrait.
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

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <FingerprintPattern className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Connexion par empreinte ou visage</h2>
          <p className="mt-1 text-sm text-gray-500">
            Face ID, Touch ID, empreinte ou Windows Hello : les appareils ci-dessous
            vous connectent sans mot de passe. Votre mot de passe reste valable.
          </p>
        </div>
      </div>

      {notice && <PasskeyNotice failure={notice} />}
      {confirmation && (
        <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {confirmation}
        </p>
      )}

      <div className="mt-5">
        {state === 'loading' && (
          <div className="space-y-2" aria-busy="true">
            <div className="h-14 animate-pulse rounded-xl bg-gray-100" />
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="inline-flex items-center gap-2">
              <TriangleAlert className="size-4 shrink-0" />
              Impossible de charger vos appareils.
            </p>
            <button
              type="button"
              onClick={retry}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium hover:bg-red-50 transition-colors focus-ring"
            >
              Réessayer
            </button>
          </div>
        )}

        {state === 'ready' && passkeys.length === 0 && (
          <p className="text-sm text-gray-500">
            Aucun appareil pour l&apos;instant.
          </p>
        )}

        {state === 'ready' && passkeys.length > 0 && (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {passkeys.map((passkey) => (
              <li key={passkey.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{displayName(passkey)}</p>
                  <p className="text-xs text-gray-500">
                    Ajouté le {formatDate(passkey.created_at)}
                    {passkey.last_used_at && <> · utilisé le {formatDate(passkey.last_used_at)}</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingRemoval(passkey)}
                  disabled={removingId !== null}
                  aria-label={`Retirer ${displayName(passkey)}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors focus-ring"
                >
                  {removingId === passkey.id
                    ? <Loader2 className="size-4 animate-spin" />
                    : <Trash2 className="size-4" />}
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {supported && state !== 'error' && (
        <button
          type="button"
          onClick={addDevice}
          disabled={adding || state === 'loading'}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors focus-ring"
        >
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Ajouter cet appareil
        </button>
      )}

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
    </section>
  )
}
