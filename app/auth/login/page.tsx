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
import { AuthShell, FieldGroup, FieldRow } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { FingerprintPattern, ScanFace } from 'lucide-react'

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
    <AuthShell title="Ville Actu" subtitle="Gardez vos sorties en favori et recevez le résumé de la semaine.">
      {children}
    </AuthShell>
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
   * inutile de la redemander, le champ est juste en dessous.
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

  return (
    <LoginShell>
      {linkError && !resent && (
        <Notice tone="warn">
          {linkError === 'lien' ? (
            <>
              <p className="font-semibold">Ce lien de confirmation n&apos;est plus valide.</p>
              <p className="mt-1">
                Il a peut-être déjà été utilisé ou expiré. Si votre compte est déjà
                confirmé, connectez-vous simplement ci-dessous — sinon, faites-vous
                renvoyer un lien.
              </p>
              <Button variant="tinted" size="md" className="mt-3" onClick={handleResend} loading={resending}>
                M&apos;envoyer un lien d&apos;accès
              </Button>
              {resendError && <p className="mt-2 text-danger">{resendError}</p>}
            </>
          ) : (
            <>
              <p className="font-semibold">La connexion n&apos;a pas pu être finalisée.</p>
              <p className="mt-1">
                Ce lien devait être ouvert dans le navigateur qui a servi à s&apos;inscrire.
                Votre compte est peut-être déjà confirmé : essayez de vous connecter
                ci-dessous.
              </p>
            </>
          )}
        </Notice>
      )}

      {resent && (
        <Notice tone="success">
          <p className="font-semibold">C&apos;est envoyé.</p>
          <p className="mt-1">
            Si un compte existe pour <strong>{email}</strong>, un lien d&apos;accès vient
            d&apos;y être expédié. Il vous connecte directement et confirme votre adresse.
            Pensez à regarder vos indésirables.
          </p>
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <Notice tone="danger">{error}</Notice>}
        <FieldGroup>
          <FieldRow
            label="E-mail"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
          />
          <FieldRow
            label="Mot de passe"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Requis"
          />
        </FieldGroup>
        <Button type="submit" loading={loading} disabled={passkeyBusy}>
          Se connecter
        </Button>
      </form>

      {/* Après le mot de passe, comme dans Fridge : l'appareil propose lui-même le
          compte (identifiants découvrables), aucun champ à remplir. */}
      {passkeySupported && (
        <>
          <Button variant="secondary" onClick={handlePasskeySignIn} loading={passkeyBusy} disabled={loading}>
            {!passkeyBusy && <FingerprintPattern className="size-[22px]" aria-hidden="true" />}
            Empreinte ou Face ID
          </Button>
          {passkeyNotice && <PasskeyNotice failure={passkeyNotice} />}
        </>
      )}

      <p className="mt-1 text-center text-subhead text-ink-muted">
        Pas encore de compte ?{' '}
        <Link href="/auth/signup" className="font-semibold text-accent focus-ring">
          Créer un compte
        </Link>
      </p>

      {step === 'offer' && <PasskeyOffer onDone={goHome} />}
    </LoginShell>
  )
}

/**
 * Proposée juste après une connexion par mot de passe, et seulement sur un appareil
 * doté d'un capteur (`shouldOfferPasskey`) : c'est le moment où l'utilisateur vient de
 * taper son mot de passe, donc celui où l'intérêt est le plus évident. « Plus tard »
 * est mémorisé pour cet appareil — la proposition ne revient pas à chaque connexion.
 * Les connexions par lien (confirmation, lien d'accès) ne passent pas par ici : ces
 * utilisateurs activent depuis la page Compte.
 *
 * Une feuille de verre qui monte du bas de l'écran, à la manière d'iOS 26, sur le
 * formulaire assombri.
 */
function PasskeyOffer({ onDone }: { onDone: () => void }) {
  const [enrolling, setEnrolling] = useState(false)
  // Levé dès l'appui sur « Plus tard » / « Continuer » et jamais rabaissé : la feuille
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-scrim" aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="passkey-offer-title"
        className="glass glass-strong relative m-2 flex w-full max-w-md flex-col items-center gap-3 rounded-[40px] px-6 pb-[calc(var(--sab)+20px)] pt-2.5 text-center sm:pb-6"
      >
        <span className="h-[5px] w-9 rounded-full bg-ink-faint/45" aria-hidden="true" />
        <span className="mt-3 flex size-[88px] items-center justify-center rounded-full bg-accent-soft text-accent">
          <ScanFace className="size-[46px]" strokeWidth={1.6} aria-hidden="true" />
        </span>
        <h2 id="passkey-offer-title" className="text-[24px] font-bold leading-[30px] text-ink">Se connecter plus vite ?</h2>
        <p className="text-body text-ink-muted">
          La prochaine fois, votre visage ou votre empreinte suffira, sans mot de passe.
          Ils restent sur cet appareil : Ville Actu ne les reçoit jamais.
        </p>

        {failure && <PasskeyNotice failure={failure} className="w-full text-left" />}

        <div className="mt-2 flex w-full flex-col gap-1">
          <Button onClick={activate} loading={enrolling} disabled={busy}>
            {!enrolling && <FingerprintPattern className="size-[22px]" aria-hidden="true" />}
            {failed ? 'Réessayer' : 'Activer Face ID ou l’empreinte'}
          </Button>
          <Button variant="plain" size="md" className="w-full" onClick={failed ? leave : later} loading={leaving} disabled={busy}>
            {failed ? 'Continuer' : 'Plus tard'}
          </Button>
        </div>
        <p className="text-footnote text-ink-muted">Modifiable à tout moment dans Compte.</p>
      </section>
    </div>
  )
}
