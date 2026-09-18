'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Newspaper, Loader2 } from 'lucide-react'

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
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
