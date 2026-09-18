# Emails d'authentification

> **⚠️ Supabase n'envoie plus l'email de confirmation** (18/09/2026). C'est l'application
> qui l'expédie, par le transport Gmail de `lib/email-notifications.ts` — celui du résumé
> IA, repris du dépôt neighborshare. Motif : le SMTP intégré de Supabase plafonne à
> quelques messages par heure (`email rate limit exceeded` atteint dès le deuxième test) et
> expédie depuis une adresse générique.
>
> Chemin réel : `app/auth/signup/page.tsx` → `POST /api/auth/signup` →
> `generateSignupLink` (`lib/auth/email-links.ts`, API admin, ne déclenche **aucun** envoi)
> → `sendSignupConfirmationEmail` → `/auth/confirm`. Le renvoi depuis la page de connexion
> suit le même chemin par `POST /api/auth/resend`.
>
> Le contenu de l'email vit donc maintenant **dans le code**, pas dans ce dossier.
> `confirm-signup.html` n'est plus le chemin nominal : il reste ici comme filet, pour le
> jour où l'on repasserait à l'envoi natif (il faudrait alors seulement le re-coller dans
> le dashboard, la route `/auth/confirm` acceptant déjà les deux formes de lien).

Les modèles d'email de Supabase Auth sont un **réglage du projet Supabase**, pas du code :
rien dans ce dépôt ne les déploie. Les fichiers de ce dossier sont la copie de référence
de ce qui est collé dans le dashboard — à re-coller après chaque modification ici, sinon
les deux divergent en silence.

| Fichier | Dashboard |
|---|---|
| `confirm-signup.html` | Authentication → Emails → **Confirm signup** |

⚠️ `confirm-signup.html` pointe sur `/auth/confirm` et lui passe `{{ .TokenHash }}`, que
`app/auth/confirm/route.ts` valide avec `verifyOtp`. **Les deux forment une paire** :
revenir à `{{ .ConfirmationURL }}` dans le modèle réintroduirait l'échec de confirmation
depuis un autre appareil (voir plus bas), et supprimer la route casserait tous les liens
déjà envoyés.

Les autres modèles (récupération de mot de passe, lien magique, changement d'adresse) sont
laissés par défaut : aucune de ces fonctions n'est utilisée par l'application aujourd'hui.
Le jour où l'une le sera, la dériver de `confirm-signup.html` en ne changeant que le titre,
le paragraphe et le libellé du bouton — la variable de lien change aussi de nom selon le
modèle (`{{ .ConfirmationURL }}`, `{{ .Token }}`…).

## Le lien pointait sur localhost

`{{ .ConfirmationURL }}` redirige vers `emailRedirectTo` s'il est fourni à `signUp()`,
sinon vers la **Site URL** du projet. Les deux étaient en cause :

1. `app/auth/signup/page.tsx` ne passait pas `emailRedirectTo` — il le fait désormais, sur
   `window.location.origin`, donc l'email renvoie vers l'environnement qui a servi le
   formulaire (production depuis la production, local depuis le poste de dev).
2. Une URL n'est honorée que si elle figure dans **Authentication → URL Configuration** :
   - *Site URL* : l'URL de production (`https://<domaine-vercel>`), jamais `localhost` —
     c'est le repli quand `emailRedirectTo` est absent ou refusé ;
   - *Redirect URLs* : y ajouter `https://<domaine-vercel>/**` et, pour le
     développement, `http://localhost:3000/**`. Une valeur hors liste est **ignorée
     sans erreur** et Supabase retombe sur la Site URL — le symptôme est exactement
     celui d'un `emailRedirectTo` oublié.

## Le lien ne marchait que dans le navigateur d'origine

Le client navigateur (`@supabase/ssr`) utilise le flux **PKCE** : `signUp()` dépose un
`code_verifier` dans un cookie, et `{{ .ConfirmationURL }}` ramène un `?code=` qui ne peut
être échangé qu'avec ce cookie. Inscription sur l'ordinateur, mail relevé sur le
téléphone — le cas le plus courant — et l'échange échoue : l'utilisateur atterrissait sur
l'accueil, déconnecté, sans message, **en ayant consommé son lien**.

Le modèle transmet donc `{{ .TokenHash }}` à `/auth/confirm`, qui le valide côté serveur
(`verifyOtp`). Rien n'est attendu du navigateur, la confirmation aboutit depuis n'importe
quel appareil. `/auth/callback` reste en place pour le retour OAuth, où le PKCE est
légitime puisque c'est le même navigateur qui part et revient.

`/auth/confirm` accepte **aussi** un `?code=` (flux PKCE) : c'est la forme que prennent les
mails partis avant la mise à jour du modèle, qui arrivent ici via `/auth/v1/verify` sans
`token_hash`. Sans ce repli, ces liens étaient rejetés d'office et affichaient « ce lien
n'est plus valide » — message qui désignait en réalité un modèle non mis à jour.

**Vérifier quel modèle a servi** : ouvrir le lien reçu (clic droit → copier l'adresse, ou
le lien en clair sous le bouton). `…/auth/v1/verify?token=…` = ancien modèle, le dashboard
n'a pas pris la modification ; `…/auth/confirm?token_hash=…` = nouveau. Deux pièges du
dashboard : la modification n'est prise qu'après **Save**, et chaque modèle a son propre
onglet — éditer « Magic Link » en croyant éditer « Confirm signup » ne produit aucun effet
visible.

Si la validation échoue quand même (lien expiré — 24 h par défaut — déjà utilisé, ou
tronqué par un client mail), la route redirige vers `/auth/login?erreur=lien`, qui
l'explique et propose de renvoyer un lien à l'adresse saisie.

## Tester sans envoyer d'email

Authentication → Sign In / Providers → Email → **Confirm email** désactivé : les comptes
sont actifs dès l'inscription et aucun message ne part — utile quand le plafond d'envoi est
atteint. `app/auth/signup/page.tsx` le détecte (une `session` dans la réponse de `signUp`)
et redirige vers l'accueil au lieu d'afficher « Vérifiez vos emails ». Le test porte sur la
réponse, pas sur un réglage recopié dans le code : la bascule se fait dans le dashboard,
sans redéploiement, et les deux cas doivent fonctionner.

Ne pas oublier de le réactiver : sans confirmation, n'importe qui crée un compte avec
l'adresse d'un autre.

## SMTP

Le SMTP intégré de Supabase est un service de dépannage : il expédie depuis une adresse
générique (`noreply@mail.app.supabase.io`), n'est pas authentifié pour le domaine, et est
plafonné à quelques messages par heure — en production, les inscriptions finissent en
indésirables ou ne partent pas. Un SMTP propre se configure dans Project Settings →
Authentication → SMTP Settings. neighborshare passe par Gmail (`GMAIL_USER` /
`GMAIL_APP_PASSWORD`) pour ses notifications maison, ce qui vaut aussi ici.
