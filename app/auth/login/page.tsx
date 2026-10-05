'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  dismissPasskeyOffer,
  enrollThisDevice,
  shouldOfferPasskey,
  signInWithDevice,
  usePasskeySupport,
  type PasskeyFailure,
} from '@/lib/auth/passkey'
import { PasskeyNotice } from '@/components/account/PasskeyNotice'
import { Newspaper, Loader2, FingerprintPattern } from 'lucide-react'

/**
 * `useSearchParams` impose une frontière `<Suspense>` : sans elle, tout l'arbre est
 * exclu du pré-rendu. Le formulaire est donc isolé dans son propre composant.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  )
}

/** Coquille du repli : reprend la structure du formulaire pour éviter un saut de mise en page. */
function LoginShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-brand-700 font-semibold text-xl mb-2">
            <Newspaper className="size-6" />
            Ville Actu
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Connexion</h1>
          <p className="text-sm text-gray-500 mt-1">Accédez à vos favoris et alertes</p>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Destination directe après connexion. `/` ne fait que rediriger vers la ville
 * (`app/page.tsx`) : y passer coûtait un aller-retour serveur de plus, pendant lequel
 * le squelette de la ville (`loading.tsx`) ne pouvait pas encore s'afficher.
 */
const HOME_PATH = '/la-chapelle-sur-erdre'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // `erreur=lien` : lien de confirmation invalide, expiré ou déjà consommé
  // (`/auth/confirm`). `erreur=session` : échec de l'échange OAuth (`/auth/callback`).
  const linkError = searchParams.get('erreur')

  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)

  const passkeySupported = usePasskeySupport()
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyNotice, setPasskeyNotice] = useState<PasskeyFailure | null>(null)
  // `offer` : connecté par mot de passe, on propose d'activer l'empreinte avant de partir.
  const [step, setStep] = useState<'form' | 'offer'>('form')

  function goHome() {
    router.push(HOME_PATH)
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
    } else if (await shouldOfferPasskey()) {
      // Pendant que l'utilisateur lit la proposition : la page ville étant dynamique,
      // le préchargement s'arrête à son `loading.tsx` — le squelette apparaît donc dès
      // l'appui sur « Activer » ou « Plus tard », au lieu d'une carte figée.
      router.prefetch(HOME_PATH)
      setLoading(false)
      setStep('offer')
    } else {
      goHome()
    }
  }

  async function handlePasskeySignIn() {
    setPasskeyBusy(true)
    setPasskeyNotice(null)
    setError(null)
    const result = await signInWithDevice()
    if (result.ok) {
      // `passkeyBusy` reste levé pendant la navigation, pour éviter un double appui.
      goHome()
      return
    }
    setPasskeyBusy(false)
    setPasskeyNotice(result.failure)
  }

  /**
   * Renvoi du lien de confirmation, sur l'adresse déjà saisie dans le formulaire —
   * inutile de la redemander, le champ est juste au-dessus.
   *
   * Supabase répond de la même façon que l'adresse existe ou non, et que le compte soit
   * déjà confirmé ou non : c'est délibéré de sa part (ne pas révéler qui est inscrit), et
   * le message reste donc volontairement neutre.
   */
  async function handleResend() {
    if (!email) {
      setResendError('Renseignez votre adresse email ci-dessous.')
      return
    }
    setResending(true)
    setResendError(null)
    // Notre route, et non `supabase.auth.resend()` : l'email part par le transport Gmail
    // de l'application. Elle envoie un **lien de connexion**, qui marche que le compte
    // soit confirmé ou non — voir `app/api/auth/resend/route.ts`.
    const res = await fetch('/api/auth/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const payload = await res.json().catch(() => null) as { error?: string } | null
    setResending(false)
    if (!res.ok) {
      setResendError(payload?.error ?? "L'envoi a échoué. Réessayez dans quelques minutes.")
    } else {
      setResent(true)
    }
  }

  if (step === 'offer') {
    return (
      <LoginShell>
        <PasskeyOffer onDone={goHome} />
      </LoginShell>
    )
  }

  return (
    <LoginShell>
      {linkError && !resent && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {linkError === 'lien' ? (
            <>
              <p className="font-medium">Ce lien de confirmation n&apos;est plus valide.</p>
              <p className="mt-1 text-amber-800">
                Il a peut-être déjà été utilisé ou expiré. Si votre compte est déjà
                confirmé, connectez-vous simplement ci-dessous — sinon, faites-vous
                renvoyer un lien.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">La connexion n&apos;a pas pu être finalisée.</p>
              <p className="mt-1 text-amber-800">
                Ce lien devait être ouvert dans le navigateur qui a servi à s&apos;inscrire.
                Votre compte est peut-être déjà confirmé : essayez de vous connecter
                ci-dessous.
              </p>
            </>
          )}
          {linkError === 'lien' && (
            <>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 focus-ring"
              >
                {resending && <Loader2 className="size-4 animate-spin" />}
                M&apos;envoyer un lien d&apos;accès
              </button>
              {resendError && <p className="mt-2 text-red-700">{resendError}</p>}
            </>
          )}
        </div>
      )}

      {resent && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
          <p className="font-medium">C&apos;est envoyé.</p>
          <p className="mt-1">
            Si un compte existe pour <strong>{email}</strong>, un lien d&apos;accès vient
            d&apos;y être expédié. Il vous connecte directement et confirme votre adresse.
            Pensez à regarder vos indésirables.
          </p>
        </div>
      )}

      {passkeySupported && (
        <div className="mb-4">
          <button
            type="button"
            onClick={handlePasskeySignIn}
            disabled={passkeyBusy}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 focus-ring"
          >
            {passkeyBusy
              ? <Loader2 className="size-5 animate-spin" />
              : <FingerprintPattern className="size-5 text-brand-600" />}
            Se connecter avec l&apos;empreinte ou le visage
          </button>
          {passkeyNotice && <PasskeyNotice failure={passkeyNotice} />}
          <div className="mt-4 flex items-center gap-3 text-xs text-gray-400" aria-hidden="true">
            <span className="h-px flex-1 bg-gray-200" />
            ou
            <span className="h-px flex-1 bg-gray-200" />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="vous@exemple.fr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          Se connecter
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-4">
        Pas encore de compte ?{' '}
        <Link href="/auth/signup" className="text-brand-600 hover:underline font-medium">
          Créer un compte
        </Link>
      </p>
    </LoginShell>
  )
}

/**
 * Proposée juste après une connexion par mot de passe, et seulement sur un appareil
 * doté d'un capteur (`shouldOfferPasskey`) : c'est le moment où l'utilisateur vient de
 * taper son mot de passe, donc celui où l'intérêt est le plus évident. « Plus tard »
 * est mémorisé pour cet appareil — la proposition ne revient pas à chaque connexion.
 * Les connexions par lien (confirmation, lien d'accès) ne passent pas par ici : ces
 * utilisateurs activent depuis « Mon compte ».
 */
function PasskeyOffer({ onDone }: { onDone: () => void }) {
  const [enrolling, setEnrolling] = useState(false)
  // Levé dès l'appui sur « Plus tard » / « Continuer » et jamais rabaissé : la carte
  // reste affichée le temps que la page ville arrive, et sans retour visuel l'appui
  // paraissait ne pas avoir été pris en compte.
  const [leaving, setLeaving] = useState(false)
  const [failure, setFailure] = useState<PasskeyFailure | null>(null)

  async function activate() {
    setEnrolling(true)
    setFailure(null)
    const result = await enrollThisDevice()
    if (result.ok) {
      // `enrolling` reste levé : même retour visuel pendant la navigation.
      onDone()
      return
    }
    setEnrolling(false)
    setFailure(result.failure)
  }

  function leave() {
    setLeaving(true)
    onDone()
  }

  function later() {
    dismissPasskeyOffer()
    leave()
  }

  // Après une vraie erreur, « Continuer » ne mémorise pas de refus : la proposition
  // reviendra à la prochaine connexion, l'échec n'étant pas un choix de l'utilisateur.
  const failed = failure?.kind === 'error'
  const busy = enrolling || leaving

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <FingerprintPattern className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Se connecter plus vite ?</h2>
          <p className="text-sm text-gray-500 mt-1">
            Utilisez Face ID ou votre empreinte sur cet appareil : plus besoin de mot de
            passe la prochaine fois.
          </p>
        </div>
      </div>

      {failure && <PasskeyNotice failure={failure} />}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={activate}
          disabled={busy}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2 focus-ring"
        >
          {enrolling && <Loader2 className="size-4 animate-spin" />}
          {failed ? 'Réessayer' : 'Activer'}
        </button>
        <button
          type="button"
          onClick={failed ? leave : later}
          disabled={busy}
          className="w-full py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 focus-ring"
        >
          {leaving && <Loader2 className="size-4 animate-spin" />}
          {failed ? 'Continuer' : 'Plus tard'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-gray-500">
        Activable à tout moment depuis Mon compte.
      </p>
    </div>
  )
}
