import Link from 'next/link'
import { Newspaper } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Newspaper className="size-4 text-brand-600" />
          <span className="font-medium text-gray-700">Ville Actu</span>
          <span>— Actualités de La Chapelle-sur-Erdre</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/a-propos" className="hover:text-gray-900 transition-colors">À propos</Link>
        </nav>
        <p>© {new Date().getFullYear()} Ville Actu</p>
      </div>
    </footer>
  )
}
