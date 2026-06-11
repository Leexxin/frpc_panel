export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-pulse">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-lg" />
            <div>
              <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-20 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-gray-200 rounded-full" />
            <div className="h-3 w-10 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 h-9 bg-gray-200 rounded-lg" />
          <div className="flex-1 h-9 bg-gray-200 rounded-lg" />
          <div className="flex-1 h-9 bg-gray-200 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1 h-9 bg-gray-200 rounded-lg" />
          <div className="flex-1 h-9 bg-gray-200 rounded-lg" />
          <div className="w-9 h-9 bg-gray-200 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="h-5 w-16 bg-gray-200 rounded" />
              <div>
                <div className="h-7 w-48 bg-gray-200 rounded mb-2" />
                <div className="h-4 w-32 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="h-10 w-24 bg-gray-200 rounded-lg" />
          </div>
          <div className="border-b border-gray-200">
            <div className="flex space-x-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 w-24 bg-gray-200 rounded mb-2" />
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
              <div className="flex items-center gap-4 mb-6">
                <div className="w-3 h-3 bg-gray-200 rounded-full" />
                <div className="h-4 w-16 bg-gray-200 rounded" />
              </div>
              <div className="flex gap-3">
                <div className="h-10 w-24 bg-gray-200 rounded-lg" />
                <div className="h-10 w-24 bg-gray-200 rounded-lg" />
                <div className="h-10 w-24 bg-gray-200 rounded-lg" />
              </div>
            </div>
          </div>
          <div>
            <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-50 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}