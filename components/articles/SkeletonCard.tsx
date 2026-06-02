import { cn } from '@/lib/utils'

interface SkeletonCardProps {
  className?: string
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse', className)}>
      <div className="h-40 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 bg-gray-200 rounded-full" />
          <div className="h-4 w-16 bg-gray-100 rounded" />
        </div>
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="space-y-1.5">
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-5/6" />
        </div>
        <div className="h-px bg-gray-100" />
        <div className="flex justify-between items-center">
          <div className="h-3 w-20 bg-gray-100 rounded" />
          <div className="h-6 w-6 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  )
}
