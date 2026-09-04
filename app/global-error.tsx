'use client'

/**
 * Dernier filet : une erreur survenue dans le layout racine lui-même, donc avant que
 * `app/error.tsx` puisse s'afficher. Ce composant remplace tout le document, il doit
 * donc porter ses propres `<html>` et `<body>` — et ne peut compter sur aucune classe
 * Tailwind, la feuille de styles étant importée par le layout qui vient d'échouer.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
          background: '#f9fafb',
          color: '#111827',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>
            Ville Actu est momentanément indisponible
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: '0 0 1.5rem' }}>
            Réessayez dans quelques instants.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: '0.5rem 1.25rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: '#16a34a',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
              Référence : {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
