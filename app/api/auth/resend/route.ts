/**
 * Renvoi d'un lien d'accès, depuis la page de connexion.
 *
 * Un lien **magique** et non un nouveau lien de confirmation : il fonctionne que le compte
 * soit confirmé ou non (le valider confirme l'adresse au passage), là où un lien de type
 * `signup` est refusé pour un utilisateur existant. Remplace `supabase.auth.resend()`, qui
 * faisait repasser l'envoi par le SMTP de Supabase.
 */

import { generateSignInLink } from '@/lib/auth/email-links'
import { sendSignInLinkEmail } from '@/lib/email-notifications'
import { callerKey, consumeRateLimit } from '@/lib/rate-limit'

const LIMIT = 3
const WINDOW_MS = 15 * 60 * 1000

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string } | null
  const email = body?.email?.trim().toLowerCase()

  if (!email) {
    return Response.json({ error: 'Adresse email requise.' }, { status: 400 })
  }

  if (!consumeRateLimit(`resend:${callerKey(request)}`, LIMIT, WINDOW_MS) ||
      !consumeRateLimit(`resend:${email}`, LIMIT, WINDOW_MS)) {
    return Response.json(
      { error: 'Trop de demandes. Réessayez dans quelques minutes.' },
      { status: 429 }
    )
  }

  const link = await generateSignInLink(new URL(request.url).origin, email)

  /*
   * Réponse identique que l'adresse existe ou non — même politique que Supabase, et même
   * raison : le formulaire ne doit pas permettre de savoir qui est inscrit. L'échec n'est
   * que journalisé, et le message affiché reste au conditionnel (« si un compte existe »).
   */
  if (link.ok) {
    try {
      await sendSignInLinkEmail(email, link.url)
    } catch (err) {
      console.error('[Resend] envoi impossible:', err)
      return Response.json(
        { error: "L'envoi a échoué. Réessayez dans quelques minutes." },
        { status: 502 }
      )
    }
  } else {
    console.info('[Resend] aucun lien généré pour cette adresse:', link.reason)
  }

  return Response.json({ ok: true })
}
