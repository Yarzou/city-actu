/**
 * Fabrication des liens d'authentification, **sans** passer par l'envoi d'email de
 * Supabase.
 *
 * `auth.admin.generateLink` crée (ou retrouve) le jeton et le retourne au lieu de
 * l'expédier : c'est ce qui permet à l'application d'envoyer elle-même le message, par le
 * même transport Gmail que le résumé IA (`lib/email-notifications.ts`). Motif : le SMTP
 * intégré de Supabase plafonne à quelques messages par heure et expédie depuis une adresse
 * générique.
 *
 * Le lien construit ici pointe sur `/auth/confirm`, qui valide le jeton côté serveur avec
 * `verifyOtp` — donc depuis n'importe quel appareil, contrairement au flux PKCE.
 */

import { createClient } from '@supabase/supabase-js'

/**
 * Client service-role. `persistSession: false` : une route serverless n'a pas de session
 * à conserver, et l'écrire dans le stockage du module ferait fuiter un contexte d'un
 * appelant à l'autre entre deux invocations chaudes.
 */
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type LinkResult =
  | { ok: true; url: string }
  /** L'adresse est déjà inscrite — l'appelant enchaîne sur un lien de connexion. */
  | { ok: false; reason: 'already-registered' }
  /** Message destiné à l'utilisateur (mot de passe trop court, adresse invalide…). */
  | { ok: false; reason: 'invalid'; message: string }
  | { ok: false; reason: 'error'; message: string }

function confirmUrl(origin: string, tokenHash: string, type: string): string {
  return `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`
}

/**
 * Crée le compte (non confirmé) et rend le lien de confirmation.
 *
 * `generateLink` de type `signup` **inscrit** l'utilisateur : c'est bien lui qui remplace
 * `supabase.auth.signUp()` côté client, et non un complément.
 */
export async function generateSignupLink(
  origin: string,
  email: string,
  password: string,
  data: Record<string, unknown>
): Promise<LinkResult> {
  const { data: link, error } = await adminClient().auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data },
  })

  if (error) {
    // Supabase ne garantit pas un code stable sur ce cas ; le test porte donc aussi sur
    // le message. Une inscription en double ne doit **pas** remonter à l'appelant : elle
    // révélerait qui est déjà inscrit.
    const alreadyRegistered =
      error.code === 'email_exists' ||
      error.code === 'user_already_exists' ||
      /already.*regist|already.*exist/i.test(error.message)

    if (alreadyRegistered) return { ok: false, reason: 'already-registered' }
    if (error.status === 400 || error.status === 422) {
      return { ok: false, reason: 'invalid', message: error.message }
    }
    return { ok: false, reason: 'error', message: error.message }
  }

  const tokenHash = link?.properties?.hashed_token
  if (!tokenHash) return { ok: false, reason: 'error', message: 'Jeton de confirmation absent.' }

  return { ok: true, url: confirmUrl(origin, tokenHash, 'signup') }
}

/**
 * Lien de connexion pour une adresse **existante**, confirmée ou non — le valider confirme
 * l'adresse au passage. C'est la réponse aux deux cas où un lien de type `signup` serait
 * refusé : inscription en double, et renvoi demandé depuis la page de connexion.
 */
export async function generateSignInLink(origin: string, email: string): Promise<LinkResult> {
  const { data: link, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (error) {
    // Adresse inconnue : l'appelant répondra comme si tout s'était bien passé.
    return { ok: false, reason: 'error', message: error.message }
  }

  const tokenHash = link?.properties?.hashed_token
  if (!tokenHash) return { ok: false, reason: 'error', message: 'Jeton de connexion absent.' }

  return { ok: true, url: confirmUrl(origin, tokenHash, 'magiclink') }
}
