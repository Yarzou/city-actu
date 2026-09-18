import nodemailer from 'nodemailer'
import { formatDigestHtml } from '@/lib/utils'

const transporter =
  process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      })
    : null

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) throw new Error('Email SMTP non configuré (GMAIL_USER / GMAIL_APP_PASSWORD)')

  await transporter.sendMail({
    from: `Ville Actu <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  })
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:24px">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#16a34a;padding:20px 28px">
      <span style="color:#fff;font-size:18px;font-weight:700">📰 Ville Actu</span>
    </div>
    <div style="padding:28px">
      ${content}
    </div>
  </div>
</body>
</html>`
}

/**
 * Bouton d'action. Un `<a>` stylé et non un `<button>` : les boutons ne sont pas
 * cliquables en email, et les styles doivent être inline (Gmail supprime les `<style>`).
 */
function ctaButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">${label}</a>`
}

/**
 * L'URL en clair sous le bouton : certains clients et passerelles d'entreprise
 * neutralisent les liens, et c'est alors le seul moyen d'aller au bout.
 */
function fallbackLink(url: string): string {
  return `<p style="color:#6b7280;font-size:12px;line-height:1.6;margin:20px 0 0">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
      <span style="color:#16a34a;word-break:break-all">${url}</span>
    </p>`
}

/**
 * Confirmation d'inscription — envoyée par **l'application**, pas par Supabase.
 *
 * Le SMTP intégré de Supabase plafonne à quelques messages par heure et expédie depuis
 * une adresse générique. On passe donc par le même transport que le résumé IA, comme le
 * fait le dépôt neighborshare pour ses notifications. Le lien est construit par
 * `/api/auth/signup` à partir du `hashed_token` rendu par l'API admin, et il est validé
 * par `/auth/confirm`.
 */
export async function sendSignupConfirmationEmail(to: string, confirmUrl: string): Promise<void> {
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827">Confirmez votre adresse email</h2>
    <p style="color:#374151;line-height:1.6;margin:0 0 12px">
      Bienvenue sur <strong>Ville Actu</strong>, l'actualité de votre commune au même endroit.
    </p>
    <p style="color:#374151;line-height:1.6;margin:0">
      Il reste une étape : confirmez cette adresse pour activer votre compte et retrouver
      vos favoris d'un appareil à l'autre.
    </p>
    ${ctaButton(confirmUrl, 'Confirmer mon adresse')}
    ${fallbackLink(confirmUrl)}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0">
      Vous n'êtes pas à l'origine de cette inscription ? Ignorez ce message, aucun compte
      ne sera activé.
    </p>
  `)

  await sendEmail(to, 'Ville Actu — confirmez votre adresse email', html)
}

/**
 * Lien de connexion, envoyé dans deux cas : l'adresse est **déjà** inscrite (réponse à une
 * inscription en double, que l'on ne signale pas à l'appelant), et le renvoi demandé
 * depuis la page de connexion.
 *
 * Un lien magique plutôt qu'un nouveau lien de confirmation : il fonctionne que le compte
 * soit confirmé ou non — le valider confirme l'adresse au passage — là où un lien de type
 * `signup` est refusé pour un utilisateur existant.
 */
export async function sendSignInLinkEmail(to: string, signInUrl: string): Promise<void> {
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827">Votre lien de connexion</h2>
    <p style="color:#374151;line-height:1.6;margin:0 0 12px">
      Un compte <strong>Ville Actu</strong> existe déjà pour cette adresse. Ce lien vous
      connecte directement, sans mot de passe, et confirme votre adresse si ce n'était pas
      encore fait.
    </p>
    ${ctaButton(signInUrl, 'Me connecter')}
    ${fallbackLink(signInUrl)}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0">
      Vous n'avez rien demandé ? Ignorez ce message : sans ce lien, personne n'accède à
      votre compte.
    </p>
  `)

  await sendEmail(to, 'Ville Actu — votre lien de connexion', html)
}

export async function sendDigestEmail(
  to: string,
  cityName: string,
  digestHtml: string,
  articleCount: number | null,
  createdAt: string | null
): Promise<void> {
  const safeDigest = formatDigestHtml(digestHtml)
  const createdAtLabel = createdAt
    ? new Date(createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : null

  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#111827">Résumé IA — ${cityName}</h2>
    <p style="margin:0 0 16px;color:#4b5563;line-height:1.6">
      ${articleCount !== null ? `${articleCount} article(s) analysé(s)` : 'Synthèse locale'}${createdAtLabel ? ` — ${createdAtLabel}` : ''}.
    </p>
    <div style="color:#111827;line-height:1.6">
      ${safeDigest}
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#9ca3af;font-size:12px;margin:0">Email généré automatiquement depuis Ville Actu.</p>
  `)

  await sendEmail(to, `Ville Actu — Résumé IA ${cityName}`, html)
}
