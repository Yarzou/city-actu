import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CITY_COOKIE, resolveCurrentCitySlug } from '@/lib/feed/cities'

/**
 * Racine : renvoie vers la dernière ville visitée.
 *
 * Elle redirigeait vers `/la-chapelle-sur-erdre` en dur. Le slug vient maintenant du
 * cookie posé par `CityHomePage`, revalidé contre les villes visibles — un cookie qui
 * désigne une ville depuis supprimée ou dépubliée dégrade vers la première ville plutôt
 * que de produire un 404 sur la page d'accueil.
 *
 * Un cookie et non `localStorage` : ce composant est rendu sur le serveur, donc la
 * redirection est une vraie redirection HTTP, sans écran intermédiaire.
 *
 * Les `searchParams` sont préservés : les raccourcis du manifeste PWA pointent
 * désormais sur `/?tab=…` (la racine mémorisant la ville), et perdre la query les
 * ramènerait tous sur l'onglet Actus.
 */
export default async function HomePage(props: PageProps<'/'>) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const cookieStore = await cookies()

  const citySlug = await resolveCurrentCitySlug(supabase, cookieStore.get(CITY_COOKIE)?.value)

  // Aucune ville visible : base neuve, ou aucune ville encore publiée pour un visiteur
  // anonyme. Le 404 dit la vérité, là où une redirection bouclerait sur elle-même.
  if (!citySlug) notFound()

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') query.set(key, value)
    else if (Array.isArray(value) && value[0] !== undefined) query.set(key, value[0])
  }

  const suffix = query.toString()
  redirect(`/${citySlug}${suffix ? `?${suffix}` : ''}`)
}
