export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-hidden="true">
      <div className="h-8 w-48 rounded-lg bg-gray-200 animate-pulse mb-6" />
      <div className="h-11 w-full max-w-xs rounded-lg bg-gray-100 animate-pulse mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
