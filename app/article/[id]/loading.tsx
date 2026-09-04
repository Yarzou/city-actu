export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-hidden="true">
      <div className="aspect-[16/9] rounded-2xl bg-gray-200 animate-pulse mb-6" />
      <div className="h-7 w-3/4 rounded-lg bg-gray-200 animate-pulse mb-3" />
      <div className="space-y-2">
        <div className="h-4 rounded bg-gray-100 animate-pulse" />
        <div className="h-4 w-5/6 rounded bg-gray-100 animate-pulse" />
        <div className="h-4 w-4/6 rounded bg-gray-100 animate-pulse" />
      </div>
    </div>
  )
}
