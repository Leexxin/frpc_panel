import { useEffect, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useFrpcStore } from '../store'

export function Logs() {
  const { logs, fetchLogs, clearLogs } = useFrpcStore()
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    fetchLogs()

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchLogs()
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [fetchLogs, autoRefresh])

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 bg-red-50'
      case 'warn':
        return 'text-yellow-600 bg-yellow-50'
      case 'debug':
        return 'text-gray-500 bg-gray-50'
      default:
        return 'text-blue-600 bg-blue-50'
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">服务日志</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              自动刷新
            </label>
            <button
              onClick={() => fetchLogs()}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </button>
            <button
              onClick={() => clearLogs()}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              清空
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-between">
            <span className="font-mono text-sm">frpc.log</span>
            <span className="text-gray-400 text-sm">{logs.length} 条日志</span>
          </div>
          <div className="h-[600px] overflow-y-auto bg-gray-900 p-4 font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">暂无日志</div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-gray-500 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-bold uppercase ${
                      log.level === 'error' ? 'bg-red-900 text-red-300' :
                      log.level === 'warn' ? 'bg-yellow-900 text-yellow-300' :
                      log.level === 'debug' ? 'bg-gray-700 text-gray-300' :
                      'bg-blue-900 text-blue-300'
                    }`}>
                      {log.level}
                    </span>
                    <span className="text-gray-300 break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
