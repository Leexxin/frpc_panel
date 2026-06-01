import { ServiceStatus } from '../../shared/types'

interface StatusCardProps {
  status: ServiceStatus | null
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}天 ${hours % 24}小时`
  if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`
  if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`
  return `${seconds}秒`
}

export function StatusCard({ status }: StatusCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">服务状态</h2>

      <div className="flex items-center mb-4">
        <div className={`w-4 h-4 rounded-full mr-3 ${status?.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-lg font-medium">
          {status?.running ? '运行中' : '已停止'}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600">版本</span>
          <span className="font-medium">{status?.version || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">运行时间</span>
          <span className="font-medium">
            {status?.uptime ? formatUptime(status.uptime) : '-'}
          </span>
        </div>
      </div>
    </div>
  )
}
