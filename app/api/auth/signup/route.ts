/**
 * Inscription — le compte est créé par l'API admin et **l'email de confirmation est
 * envoyé par l'application**, avec le transport Gmail de `lib/email-notifications.ts`.
 *
 * Auparavant `supabase.auth.signUp()` côté client laissait Supabase expédier le message :
 * SMTP intégré plafonné à quelques envois par heure, expéditeur générique, et un modèle
 * qui ne vit que dans le dashboard.
 *
 * Le compte est créé **non confirmé** (`generateLink` n'active pas l'adresse) : rien ne
 * change pour la sécurité, seul le canal d'envoi diffère.
 */

import { generateSignupLink, generateSignInLink } from '@/lib/auth/email-links'
import { sendSignupConfirmationEmail, sendSignInLinkEmail } from '@/lib/email-notifications'
import { callerKey, consumeRateLimit } from '@/lib/rate-limit'

interface SignupBody {
  email?: string
  password?: string
  displayName?: string
}

/** Trois tentatives par quart d'heure et par appelant. Voir `lib/rate-limit.ts` : le
 *  compteur est en mémoire d'instance, donc best-effort. */
const LIMIT = 3
const WINDOW_MS = 15 * 60 * 1000

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as SignupBody | null
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password
  const displayName = body?.displayName?.trim() ?? ''

  if (!email || !password) {
    return Response.json({ error: 'Adresse email et mot de passe requis.' }, { status: 400 })
  }

  // La clé porte l'adresse **et** l'appelant : sans l'adresse, un seul réseau partagé
  // (entreprise, opérateur mobile) bloquerait des inscriptions légitimes ; sans
  // l'appelant, il suffirait de changer d'adresse à chaque essai.
  if (!consumeRateLimit(`signup:${callerKey(request)}`, LIMIT, WINDOW_MS) ||
      !consumeRateLimit(`signup:${email}`, LIMIT, WINDOW_MS)) {
    return Response.json(
      { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429 }
    )
  }

  const origin = new URL(request.url).origin
  const result = await generateSignupLink(origin, email, password, { display_name: displayName })

  if (result.ok) {
    try {
      await sendSignupConfirmationEmail(email, result.url)
    } catch (err) {
      // Le compte existe désormais sans que son propriétaire ait reçu quoi que ce soit :
      // le dire franchement, il pourra se faire renvoyer un lien depuis la connexion.
      console.error('[Signup] envoi du mail de confirmation impossible:', err)
      return Response.json(
        { error: "Compte créé, mais l'email de confirmation n'a pas pu être envoyé. Demandez un nouveau lien depuis la page de connexion." },
        { status: 502 }
      )
    }
    return Response.json({ ok: true })
  }

  if (result.reason === 'invalid') {
    return Response.json({ error: result.message }, { status: 400 })
  }

  if (result.reason === 'already-registered') {
    /*
     * Réponse **identique** à celle d'une inscription réussie : dire « adresse déjà
     * utilisée » transformerait le formulaire en oracle permettant de savoir qui est
     * inscrit. Le propriétaire de la boîte, lui, reçoit un lien de connexion — donc la
     * personne réellement concernée n'est pas laissée sans recours.
     */
    const link = await generateSignInLink(origin, email)
    if (link.ok) {
      try {
        await sendSignInLinkEmail(email, link.url)
      } catch (err) {
        console.error('[Signup] envoi du lien de connexion impossible:', err)
      }
    }
    return Response.json({ ok: true })
  }

  console.error('[Signup] échec:', result.message)
  return Response.json({ error: "L'inscription a échoué. Réessayez plus tard." }, { status: 500 })
}
