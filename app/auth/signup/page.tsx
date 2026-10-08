'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { AuthShell, FieldGroup, FieldRow } from '@/components/auth/AuthShell'
import { Button, buttonClass } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'

export default function SignupPage() {
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
    /*
     * L'inscription passe par notre route et non par `supabase.auth.signUp()` : c'est
     * l'application qui envoie l'email de confirmation (transport Gmail de
     * `lib/email-notifications.ts`), le SMTP intégré de Supabase plafonnant à quelques
     * messages par heure avec un expéditeur générique.
     *
     * La route répond **la même chose** pour une adresse déjà inscrite — ne pas
     * réintroduire de message « adresse déjà utilisée » ici, il ferait du formulaire un
     * moyen de savoir qui possède un compte.
     */
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    })
    const payload = await res.json().catch(() => null) as { error?: string } | null

    if (!res.ok) {
      setError(payload?.error ?? "L'inscription a échoué.")
      setLoading(false)
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <AuthShell title="Vérifiez vos emails">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MailCheck className="size-7" aria-hidden="true" />
          </span>
          <p className="text-body text-ink-muted">
            Un lien de confirmation a été envoyé à <strong className="text-ink">{email}</strong>.
            Touchez-le pour activer votre compte.
          </p>
          <Link href="/la-chapelle-sur-erdre" className={buttonClass('secondary', 'lg', 'mt-2')}>
            Retour aux actus
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Créer un compte" subtitle="Favoris, résumé de la semaine, connexion par Face ID.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <Notice tone="danger">{error}</Notice>}
        <FieldGroup>
          <FieldRow
            label="Prénom"
            type="text"
            autoComplete="given-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="ou un pseudo"
          />
          <FieldRow
            label="E-mail"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
          />
          <FieldRow
            label="Mot de passe"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8 caractères min."
          />
        </FieldGroup>
        <Button type="submit" loading={loading}>
          Créer mon compte
        </Button>
      </form>

      <p className="mt-1 text-center text-subhead text-ink-muted">
        Déjà un compte ?{' '}
        <Link href="/auth/login" className="font-semibold text-accent focus-ring">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  )
}
