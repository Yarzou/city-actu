import { redirect } from 'next/navigation'

/**
 * Ancien second point d'entrée vers le panneau d'administration, désormais une simple
 * redirection vers `/profil`, qui en est l'unique hôte.
 *
 * Ce que montait cette page posait trois problèmes : le même `AdminSourcesPanel` en
 * import **statique**, ce qui annulait pour ce chemin le découpage de code ; un garde
 * purement client, donc le panneau était servi quel que soit le rôle ; et un rendu
 * `null` pendant deux allers-retours successifs, sans indicateur — avec un état
 * `canAccess` jamais mis à `false`, une redirection qui échouait laissait un écran
 * blanc définitif.
 */
export default function AdminSourcesRedirect() {
  redirect('/profil')
}
