/**
 * Limiteur de débit **best-effort**, en mémoire de l'instance.
 *
 * Il protège les routes qui expédient un email vers une adresse fournie par l'appelant,
 * sans session : sans lui, `/api/auth/signup` et `/api/auth/resend` sont des relais
 * d'envoi utilisables par n'importe qui. Le SMTP intégré de Supabase imposait ce plafond
 * à notre place ; en envoyant nous-mêmes, il faut le reposer.
 *
 * Limite à connaître : Vercel exécute plusieurs instances, chacune avec sa propre carte,
 * et une instance froide démarre à zéro. Ce n'est donc pas une barrière contre un attaquant
 * déterminé — c'est un garde-fou contre le bouton cliqué dix fois et contre le script
 * naïf. Une vraie limite demanderait un compteur partagé (table Postgres ou Redis).
 */

interface Hit {
  count: number
  resetAt: number
}

const hits = new Map<string, Hit>()

/**
 * Consomme un jeton pour `key`. Retourne `false` quand le quota est épuisé.
 *
 * Le nettoyage se fait à la lecture plutôt que par un minuteur : une route serverless
 * n'a pas de boucle de fond fiable, et la carte ne grandit que le temps de vie de
 * l'instance.
 */
export function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const existing = hits.get(key)

  if (!existing || existing.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (existing.count >= limit) return false

  existing.count += 1
  return true
}

/**
 * Identifiant d'appelant, dans l'ordre de fiabilité décroissante. `x-forwarded-for` peut
 * lister plusieurs adresses (chaîne de proxys) : seule la première est celle du client.
 */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') ?? 'inconnu'
}
