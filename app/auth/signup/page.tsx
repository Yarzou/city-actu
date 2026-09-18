'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Newspaper, Loader2 } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [done, setDone]           = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        // Sans ce paramètre, le lien de confirmation renvoie vers la « Site URL » du
        // projet Supabase — restée sur `http://localhost:3000`, d'où des emails de
        // production pointant vers le poste de développement. `window.location.origin`
        // renvoie vers l'environnement qui a servi le formulaire, donc les deux cas
        // fonctionnent sans variable d'environnement à tenir à jour.
        //
        // `/auth/confirm` et non `/auth/callback` : la confirmation d'email doit
        // aboutir même ouverte depuis un autre appareil, ce que le flux PKCE de
        // `/auth/callback` ne permet pas (voir l'en-tête de `app/auth/confirm/route.ts`).
        //
        // L'URL doit figurer dans Authentication → URL Configuration → Redirect URLs :
        // une valeur hors liste est ignorée **sans erreur**, avec repli sur la Site URL
        // — même symptôme qu'un paramètre oublié. Voir supabase/email-templates/README.md.
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Une session dans la réponse = la confirmation d'email est désactivée côté Supabase
    // (Authentication → Sign In / Providers → Email → Confirm email), le compte est actif
    // immédiatement. Afficher « Vérifiez vos emails » serait alors faux : aucun message
    // ne part, et l'utilisateur est déjà connecté.
    //
    // Le test porte sur la réponse et non sur un réglage recopié dans le code : la bascule
    // se fait dans le dashboard, sans redéploiement, et les deux cas doivent marcher.
    if (data.session) {
      router.push('/')
      router.refresh()
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">📬</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Vérifiez vos emails</h1>
          <p className="text-gray-600 text-sm">
            Un lien de confirmation a été envoyé à <strong>{email}</strong>.<br />
            Cliquez dessus pour activer votre compte.
          </p>
          <Link href="/" className="mt-6 inline-block text-brand-600 hover:underline text-sm">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-brand-700 font-semibold text-xl mb-2">
            <Newspaper className="size-6" />
            Ville Actu
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Créer un compte</h1>
          <p className="text-sm text-gray-500 mt-1">Favoris et alertes d&apos;actualités</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prénom / Pseudo</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Marie"
            />
          </div>
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="8 caractères minimum"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Créer mon compte
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Déjà un compte ?{' '}
          <Link href="/auth/login" className="text-brand-600 hover:underline font-medium">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}
