import { useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Connexion par empreinte digitale ou reconnaissance faciale — passkeys WebAuthn.
 *
 * Tout le protocole est porté par Supabase Auth (bêta depuis mai 2026) : il stocke les
 * clés publiques et vérifie les signatures, l'application ne voit jamais la donnée
 * biométrique — c'est l'appareil qui la contrôle (Face ID, Touch ID, empreinte
 * Android, Windows Hello). D'où l'absence de table, de migration et de route API.
 * Prérequis : le drapeau `experimental.passkey` du client navigateur
 * (`lib/supabase/client.ts`) et l'activation dans le dashboard (Authentication →
 * Passkeys), qui fixe le domaine auquel chaque passkey est liée.
 *
 * Module client uniquement : il touche `window`, `navigator` et `localStorage`.
 */

/**
 * Préférence propre à **cet appareil**, d'où `localStorage` et non la base : une
 * passkey vit dans le trousseau d'un appareil, et Supabase ne dit pas lequel parmi
 * ceux d'un compte. Sert seulement à ne pas reproposer l'activation après chaque
 * connexion par mot de passe.
 */
const STORAGE_KEY = 'ville-actu:passkey'
type DeviceFlag = 'registered' | 'dismissed'

function readFlag(): DeviceFlag | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'registered' || value === 'dismissed' ? value : null
  } catch {
    // Navigation privée, stockage bloqué : on se comporte comme sans drapeau.
    return null
  }
}

function writeFlag(flag: DeviceFlag | null) {
  try {
    if (flag) window.localStorage.setItem(STORAGE_KEY, flag)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function supportsPasskeys(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
}

const subscribeNever = () => () => {}

/**
 * `useSyncExternalStore` et non un `useState` posé dans un effet : la valeur est
 * synchrone, et le snapshot serveur à `false` évite tout décalage d'hydratation — le
 * bouton apparaît simplement après le montage.
 */
export function usePasskeySupport(): boolean {
  return useSyncExternalStore(subscribeNever, supportsPasskeys, () => false)
}

/**
 * Faut-il proposer l'activation après une connexion par mot de passe ? Seulement sur
 * un appareil doté d'un capteur (sur un poste sans lecteur, la proposition mènerait à
 * une clé de sécurité ou à un QR code — hors sujet), et seulement si l'utilisateur
 * n'a encore ni activé ni décliné ici.
 */
export async function shouldOfferPasskey(): Promise<boolean> {
  if (!supportsPasskeys() || readFlag()) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function dismissPasskeyOffer() {
  writeFlag('dismissed')
}

export interface PasskeyFailure {
  /** `cancelled` : l'utilisateur a refermé l'invite — rien d'anormal, ton neutre. */
  kind: 'cancelled' | 'error'
  message: string
}

type PasskeyResult = { ok: true } | { ok: false; failure: PasskeyFailure }

/** `AuthError` comme `WebAuthnError` portent un `code` ; le second garde l'erreur DOM dans `cause`. */
function codeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const { code } = error as { code: unknown }
  return typeof code === 'string' ? code : undefined
}

function causeNameOf(error: unknown): string | undefined {
  const cause = (error as { cause?: { name?: unknown } } | null)?.cause
  return typeof cause?.name === 'string' ? cause.name : undefined
}

/**
 * Point unique de traduction des échecs, comme `describeLlmFailure` pour le LLM : la
 * page de connexion et « Mon compte » doivent dire la même chose pour la même cause.
 */
export function describePasskeyError(error: unknown, action: 'signin' | 'register'): PasskeyFailure {
  const code = codeOf(error)
  const causeName = causeNameOf(error)

  // La spécification fond dans `NotAllowedError` l'annulation, le délai dépassé et,
  // selon les plateformes, « aucune passkey pour ce site ». Impossible de les
  // distinguer : le message couvre le cas le plus probable sans alarmer.
  if (code === 'ERROR_CEREMONY_ABORTED' || causeName === 'NotAllowedError' || causeName === 'AbortError') {
    return {
      kind: 'cancelled',
      message: action === 'signin'
        ? "Connexion par empreinte annulée. Si cet appareil n'est pas encore activé, connectez-vous par mot de passe : on vous le proposera ensuite."
        : 'Activation annulée.',
    }
  }

  console.error('[Passkey]', action, error)

  switch (code) {
    case 'webauthn_credential_not_found':
      return {
        kind: 'error',
        message: "Cet appareil n'est plus autorisé à vous connecter. Connectez-vous par mot de passe, puis réactivez l'empreinte.",
      }
    case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
    case 'webauthn_credential_exists':
      return { kind: 'error', message: 'Cet appareil est déjà enregistré pour votre compte.' }
    case 'too_many_passkeys':
      return {
        kind: 'error',
        message: "Nombre maximal d'appareils atteint. Retirez-en un depuis Mon compte.",
      }
    case 'passkey_disabled':
      return { kind: 'error', message: "La connexion par empreinte n'est pas disponible pour le moment." }
    case 'email_not_confirmed':
      return { kind: 'error', message: "Confirmez d'abord votre adresse email." }
    case 'webauthn_challenge_expired':
    case 'webauthn_challenge_not_found':
      return { kind: 'error', message: 'La demande a expiré. Réessayez.' }
    case 'webauthn_verification_failed':
      return { kind: 'error', message: 'La vérification a échoué. Réessayez.' }
    // Domaine absent des réglages Passkeys du dashboard (RP ID, origines) : c'est une
    // erreur de configuration, pas de l'utilisateur — d'où le `console.error` ci-dessus.
    case 'ERROR_INVALID_RP_ID':
    case 'ERROR_INVALID_DOMAIN':
      return { kind: 'error', message: "La connexion par empreinte n'est pas autorisée sur cette adresse du site." }
    default:
      return {
        kind: 'error',
        message: action === 'signin'
          ? 'La connexion par empreinte a échoué. Réessayez ou utilisez votre mot de passe.'
          : "L'activation a échoué. Réessayez plus tard.",
      }
  }
}

/**
 * Pas de saisie d'email : Supabase demande un identifiant **découvrable**, c'est
 * l'appareil qui propose le compte. La session passe par le stockage cookies du client
 * `@supabase/ssr`, le serveur la voit comme n'importe quelle connexion.
 */
export async function signInWithDevice(): Promise<PasskeyResult> {
  const { data, error } = await createClient().auth.signInWithPasskey()
  if (error || !data?.session) {
    // Passkey retirée depuis « Mon compte » mais restée dans le trousseau : on lève le
    // drapeau pour que l'activation soit reproposée à la prochaine connexion.
    if (codeOf(error) === 'webauthn_credential_not_found' && readFlag() === 'registered') {
      writeFlag(null)
    }
    return { ok: false, failure: describePasskeyError(error, 'signin') }
  }
  return { ok: true }
}

/** Enregistre une passkey sur cet appareil pour l'utilisateur connecté. */
export async function enrollThisDevice(): Promise<PasskeyResult> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.registerPasskey()

  if (error || !data) {
    const code = codeOf(error)
    if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || code === 'webauthn_credential_exists') {
      writeFlag('registered')
    }
    return { ok: false, failure: describePasskeyError(error, 'register') }
  }

  writeFlag('registered')

  // Un nom lisible pour la liste de « Mon compte ». Seulement si Supabase n'en a pas
  // posé, pour ne pas écraser le sien. Un échec ici n'annule rien : la passkey existe.
  const label = deviceLabel()
  if (!data.friendly_name && label) {
    const { error: renameError } = await supabase.auth.passkey.update({
      passkeyId: data.id,
      friendlyName: label,
    })
    if (renameError) console.warn('[Passkey] nommage impossible:', renameError)
  }

  return { ok: true }
}

/**
 * Nom approximatif tiré du user agent. Approximatif à dessein : une passkey Apple ou
 * Google est synchronisée sur tous les appareils du trousseau, « iPhone » désigne donc
 * plutôt l'endroit où elle a été créée. `null` quand rien n'est reconnu : mieux vaut
 * « Appareil sans nom » qu'un nom faux.
 */
export function deviceLabel(): string | null {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  // iPadOS se présente en Macintosh ; le tactile le trahit.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/CrOS/.test(ua)) return 'Chromebook'
  if (/Linux/.test(ua)) return 'Linux'
  return null
}
