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
