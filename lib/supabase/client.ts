import { createBrowserClient } from '@supabase/ssr'

function instantiate() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Connexion par empreinte / visage (`lib/auth/passkey.ts`). Sans ce drapeau,
      // toutes les méthodes passkey d'auth-js lèvent. Requis en 2.106 ; il devient un
      // no-op déprécié dans les versions suivantes (supabase-js #2695), à retirer lors
      // d'une montée de version. Le client serveur n'en a pas besoin : la cérémonie
      // WebAuthn se déroule entièrement dans le navigateur.
      auth: { experimental: { passkey: true } },
    }
  )
}

// Instance unique pour tout l'onglet. Chaque appel créait auparavant un nouveau
// client — donc un nouveau client GoTrue avec ses écouteurs de storage et son canal
// de diffusion — alors que le composant du feed en instancie un par fonction appelée.
//
// Le type passe par `instantiate` (non générique) et non par `createBrowserClient`
// (générique) : annoter directement avec `ReturnType<typeof createBrowserClient>`
// effondre les paramètres de type et fait retomber toutes les requêtes en `any`.
let browserClient: ReturnType<typeof instantiate> | undefined

export function createClient() {
  browserClient ??= instantiate()
  return browserClient
}
