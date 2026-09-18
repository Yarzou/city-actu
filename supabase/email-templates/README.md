# Emails d'authentification

Les modèles d'email de Supabase Auth sont un **réglage du projet Supabase**, pas du code :
rien dans ce dépôt ne les déploie. Les fichiers de ce dossier sont la copie de référence
de ce qui est collé dans le dashboard — à re-coller après chaque modification ici, sinon
les deux divergent en silence.

| Fichier | Dashboard |
|---|---|
| `confirm-signup.html` | Authentication → Emails → **Confirm signup** |

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

## SMTP

Le SMTP intégré de Supabase est un service de dépannage : il expédie depuis une adresse
générique (`noreply@mail.app.supabase.io`), n'est pas authentifié pour le domaine, et est
plafonné à quelques messages par heure — en production, les inscriptions finissent en
indésirables ou ne partent pas. Un SMTP propre se configure dans Project Settings →
Authentication → SMTP Settings. neighborshare passe par Gmail (`GMAIL_USER` /
`GMAIL_APP_PASSWORD`) pour ses notifications maison, ce qui vaut aussi ici.
