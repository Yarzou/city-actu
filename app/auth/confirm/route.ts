/**
 * Confirmation d'adresse email — chemin qui fonctionne depuis **n'importe quel**
 * navigateur.
 *
 * `/auth/callback` ne le peut pas : le client navigateur (`@supabase/ssr`) utilise le
 * flux PKCE, dont le `code_verifier` est déposé dans un cookie du navigateur qui a
 * rempli le formulaire. `exchangeCodeForSession` échoue donc quand le lien est ouvert
 * ailleurs — cas courant : inscription sur l'ordinateur, mail relevé sur le téléphone.
 * L'utilisateur atterrissait alors sur l'accueil, déconnecté et sans explication, en
 * ayant consommé son lien.
 *
 * Ici, le jeton voyage dans l'URL (`token_hash`) et `verifyOtp` le valide côté serveur :
 * rien n'est attendu du stockage local, la confirmation aboutit sur tout appareil. C'est
 * le modèle d'email qui dirige vers cette route
 * (`supabase/email-templates/confirm-signup.html`) — les deux vont ensemble, changer
 * l'un sans l'autre casse la confirmation.
 *
 * `/auth/callback` reste en place : il sert le retour OAuth, où le PKCE est légitime
 * puisque c'est le même navigateur qui part et revient.
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Liste blanche plutôt qu'un cast : `type` vient de l'URL, donc de l'extérieur. Les
 * valeurs sont celles des modèles d'email Supabase susceptibles de pointer ici.
 */
const EMAIL_OTP_TYPES: EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as string[]).includes(value)
}

/**
 * `next` vient de l'URL : sans ce filtre, un lien forgé
 * (`/auth/confirm?...&next=https://exemple.test`) ferait de la route une redirection
 * ouverte, d'autant plus crédible qu'elle est atteinte depuis un email. Seuls les
 * chemins internes sont acceptés, et `//` est exclu — le navigateur y lit un hôte.
 */
function safeNext(value: string | null): string {
  if (!value) return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  /*
   * Repli sur le flux PKCE : les emails partis **avant** la mise à jour du modèle
   * portent encore un lien `{{ .ConfirmationURL }}`, qui passe par `/auth/v1/verify` et
   * arrive ici avec un `?code=` et aucun `token_hash`. Sans cette branche, ces liens
   * étaient rejetés d'office — et le message « ce lien n'est plus valide » désignait le
   * modèle non mis à jour, pas le lien.
   *
   * L'échange garde sa limite d'origine (cookie du navigateur qui s'est inscrit), d'où
   * `erreur=session` et non `erreur=lien` : le recours n'est pas le même, c'est le
   * navigateur de départ qu'il faut, pas un nouvel envoi.
   */
  if (!tokenHash && code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    return NextResponse.redirect(
      error ? `${origin}/auth/login?erreur=session` : `${origin}${next}`
    )
  }

  if (!tokenHash || !isEmailOtpType(type)) {
    return NextResponse.redirect(`${origin}/auth/login?erreur=lien`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    // Lien déjà utilisé, expiré (24 h par défaut) ou tronqué par un client mail.
    // On ne distingue pas les cas : le recours est le même — se connecter, ou se faire
    // renvoyer un lien depuis la page de connexion.
    return NextResponse.redirect(`${origin}/auth/login?erreur=lien`)
  }

  // La session est posée dans les cookies par `createClient` (server) : la redirection
  // suivante arrive déjà authentifiée.
  return NextResponse.redirect(`${origin}${next}`)
}
