import { Play, Square, RotateCcw } from 'lucide-react'
import { useFrpcStore } from '../store'

interface ServiceControlsProps {
  isRunning: boolean
}

export function ServiceControls({ isRunning }: ServiceControlsProps) {
  const { startService, stopService, restartService, loading } = useFrpcStore()

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">服务控制</h2>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={startService}
          disabled={loading || isRunning}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="w-4 h-4 mr-2" />
          启动
        </button>
        <button
          onClick={stopService}
          disabled={loading || !isRunning}
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Square className="w-4 h-4 mr-2" />
          停止
        </button>
        <button
          onClick={restartService}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          重启
        </button>
      </div>
    </div>
  )
}
