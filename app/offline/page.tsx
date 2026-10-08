import { WifiOff } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 pt-safe">
      <EmptyState icon={WifiOff} title="Pas de connexion">
        Vous êtes hors ligne. Reconnectez-vous à Internet pour accéder aux dernières actualités.
      </EmptyState>
    </div>
  )
}
