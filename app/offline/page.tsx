export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <span className="text-5xl mb-4">📡</span>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pas de connexion</h1>
      <p className="text-gray-500 max-w-sm">
        Vous êtes hors ligne. Reconnectez-vous à Internet pour accéder aux dernières actualités.
      </p>
    </div>
  )
}
