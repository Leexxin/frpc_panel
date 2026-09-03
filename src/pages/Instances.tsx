import { useEffect, useState, useRef } from 'react'
import { useFrpcStore } from '../store'
import { FrpcInstance, ConnectionType, ConnectionConfig } from '../../shared/types'
import { RefreshCw, Plus, Trash2, Play, Square, RotateCcw, Server, Settings, Monitor, Edit2, X, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SkeletonCard } from '../components/Skeleton'
import { ErrorToast } from '../components/ErrorToast'

const POLL_INTERVAL = 3000 // 3秒刷新一次实例列表状态

export function Instances() {
  const navigate = useNavigate()
  const { 
    instances, 
    instancesStatus, 
    loading,
    error,
    fetchInstances, 
    fetchInstancesStatus, 
    createInstance,
    updateInstance,
    deleteInstance,
    startSelectedInstanceService,
    stopSelectedInstanceService,
    restartSelectedInstanceService,
    selectInstance
  } = useFrpcStore()

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingInstance, setEditingInstance] = useState<FrpcInstance | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [formData, setFormData] = useState<{
    name: string
    connectionType: ConnectionType
    config: ConnectionConfig
  }>({
    name: '',
    connectionType: 'local_docker',
    config: {}
  })
  
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 初始化
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchInstances(), fetchInstancesStatus()])
      setInitialLoading(false)
    }
    init()
    startPolling()
    
    return () => {
      stopPolling()
    }
  }, [])

  const startPolling = () => {
    stopPolling()
    pollTimerRef.current = setInterval(() => {
      fetchInstancesStatus()
    }, POLL_INTERVAL)
  }

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const getInstanceStatus = (instance: FrpcInstance) => {
    return instancesStatus.find(s => s.instanceId === instance.id)
  }

  const getConnectionTypeLabel = (type: ConnectionType) => {
    const labels: Record<ConnectionType, string> = {
      'local_docker': '本地 Docker',
      'local_binary': '本地二进制',
      'remote_docker': '远程 Docker',
      'remote_ssh': '远程服务器（SSH 自动探测）'
    }
    return labels[type]
  }

  const getConnectionTypeIcon = (type: ConnectionType) => {
    switch (type) {
      case 'local_docker':
      case 'remote_docker':
        return Server
      case 'local_binary':
        return Settings
      case 'remote_ssh':
        return Monitor
      default:
        return Settings
    }
  }

  const handleAddInstance = async (e: React.FormEvent) => {
    e.preventDefault()
    await createInstance(formData)
    setShowAddForm(false)
    setFormData({
      name: '',
      connectionType: 'local_docker',
      config: {}
    })
  }

  const handleEditInstance = (instance: FrpcInstance) => {
    setEditingInstance(instance)
    setFormData({
      name: instance.name,
      connectionType: instance.connectionType,
      config: { ...instance.config }
    })
    setShowAddForm(true)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingInstance) return
    
    await updateInstance(editingInstance.id, formData)
    setShowAddForm(false)
    setEditingInstance(null)
    setFormData({
      name: '',
      connectionType: 'local_docker',
      config: {}
    })
  }

  const handleDeleteInstance = async (id: string) => {
    if (confirm('确定要删除这个实例吗？')) {
      await deleteInstance(id)
    }
  }

  const handleEnterInstance = (instance: FrpcInstance) => {
    selectInstance(instance.id)
    navigate(`/instances/${instance.id}`)
  }

  const handleStartInstance = async (instance: FrpcInstance) => {
    selectInstance(instance.id)
    await startSelectedInstanceService()
    // 操作后立即刷新状态
    await fetchInstancesStatus(true)
  }

  const handleStopInstance = async (instance: FrpcInstance) => {
    selectInstance(instance.id)
    await stopSelectedInstanceService()
    // 操作后立即刷新状态
    await fetchInstancesStatus(true)
  }

  const handleRestartInstance = async (instance: FrpcInstance) => {
    selectInstance(instance.id)
    await restartSelectedInstanceService()
    // 操作后立即刷新状态
    await fetchInstancesStatus(true)
  }

  const renderConfigFields = () => {
    switch (formData.connectionType) {
      case 'local_docker':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">容器名称</label>
              <input
                type="text"
                value={(formData.config as any).dockerContainerName || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, dockerContainerName: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="frpc"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">配置文件路径</label>
              <input
                type="text"
                value={formData.config.configPath || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, configPath: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="/etc/frp/frpc.toml"
              />
            </div>
          </div>
        )
      case 'remote_docker':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Docker 主机</label>
              <input
                type="text"
                value={formData.config.dockerHost || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, dockerHost: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="tcp://192.168.1.100:2375"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">容器名称</label>
              <input
                type="text"
                value={formData.config.remoteDockerContainerName || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, remoteDockerContainerName: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="frpc"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">配置文件路径</label>
              <input
                type="text"
                value={formData.config.remoteConfigPath || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, remoteConfigPath: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="/etc/frp/frpc.toml"
              />
            </div>
          </div>
        )
      case 'local_binary':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">二进制文件路径</label>
              <input
                type="text"
                value={formData.config.frpcPath || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, frpcPath: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="/usr/local/bin/frpc"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">配置文件路径</label>
              <input
                type="text"
                value={formData.config.configPath || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, configPath: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="/etc/frp/frpc.toml"
              />
            </div>
          </div>
        )
      case 'remote_ssh':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SSH 主机</label>
              <input
                type="text"
                value={formData.config.sshHost || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, sshHost: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="192.168.1.100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SSH 端口</label>
              <input
                type="number"
                value={formData.config.sshPort || 22}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, sshPort: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="22"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SSH 用户名</label>
              <input
                type="text"
                value={formData.config.sshUser || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, sshUser: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="root"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SSH 私钥路径</label>
              <input
                type="text"
                value={formData.config.sshKeyPath || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, sshKeyPath: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="~/.ssh/id_rsa"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SSH 密码（与私钥二选一）</label>
              <input
                type="password"
                value={formData.config.sshPassword || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, sshPassword: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="SSH 密码"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">frpc 容器（可选）</label>
              <input
                type="text"
                value={formData.config.remoteDockerContainerName || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, remoteDockerContainerName: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="留空后保存时自动探测"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">容器内配置路径（可选）</label>
              <input
                type="text"
                value={formData.config.remoteConfigPath || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, remoteConfigPath: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="留空后从容器启动参数和挂载自动识别"
              />
            </div>
            <p className="text-sm text-gray-500">
              保存服务器后会自动扫描 Docker，识别名称、镜像或启动命令中包含 frpc 的容器。
            </p>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页面头部 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">实例管理</h1>
            <p className="text-gray-600 mt-1">管理你的多个 FRP 客户端实例</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                fetchInstances()
                fetchInstancesStatus()
              }}
              disabled={loading}
              className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加实例
            </button>
          </div>
        </div>

        {/* 错误提示 - Toast 自动消失 */}
        {error && (
          <ErrorToast
            message={error}
            onClose={() => useFrpcStore.getState().clearError()}
          />
        )}

        {/* 加载骨架屏 */}
        {initialLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* 实例列表 */}
        {!initialLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {instances.map((instance) => {
            const status = getInstanceStatus(instance)
            const Icon = getConnectionTypeIcon(instance.connectionType)
            
            return (
              <div key={instance.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* 实例头部 */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <Icon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{instance.name}</h3>
                        <p className="text-sm text-gray-500">{getConnectionTypeLabel(instance.connectionType)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        status?.serviceStatus?.running ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      <span className="text-sm text-gray-500">
                        {status?.serviceStatus?.running ? '运行中' : '未运行'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 实例操作 */}
                <div className="p-6">
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => handleStartInstance(instance)}
                      disabled={status?.serviceStatus?.running || loading}
                      className="flex-1 flex items-center justify-center px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      启动
                    </button>
                    <button
                      onClick={() => handleStopInstance(instance)}
                      disabled={!status?.serviceStatus?.running || loading}
                      className="flex-1 flex items-center justify-center px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      <Square className="w-4 h-4 mr-1" />
                      停止
                    </button>
                    <button
                      onClick={() => handleRestartInstance(instance)}
                      disabled={!status?.serviceStatus?.running || loading}
                      className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      重启
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditInstance(instance)}
                      className="flex-1 flex items-center justify-center px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      编辑
                    </button>
                    <button
                      onClick={() => handleEnterInstance(instance)}
                      className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      进入管理
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </button>
                    <button
                      onClick={() => handleDeleteInstance(instance.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 空状态 */}
      {!initialLoading && instances.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Server className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">还没有实例</h3>
            <p className="text-gray-500 mb-6">添加你的第一个 FRP 客户端实例开始使用</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加实例
            </button>
          </div>
        )}
      </div>

      {/* 添加/编辑实例弹窗 */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingInstance ? '编辑实例' : '添加实例'}
              </h3>
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setEditingInstance(null)
                  setFormData({
                    name: '',
                    connectionType: 'local_docker',
                    config: {}
                  })
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={editingInstance ? handleSaveEdit : handleAddInstance}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">实例名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="我的 FRP 客户端"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">连接类型</label>
                  <select
                    value={formData.connectionType}
                    onChange={(e) => setFormData({
                      ...formData,
                      connectionType: e.target.value as ConnectionType,
                      config: {}
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="local_docker">本地 Docker</option>
                    <option value="local_binary">本地二进制</option>
                    <option value="remote_docker">远程 Docker</option>
                    <option value="remote_ssh">远程服务器（SSH 自动探测）</option>
                  </select>
                </div>

                {renderConfigFields()}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setEditingInstance(null)
                    setFormData({
                      name: '',
                      connectionType: 'local_docker',
                      config: {}
                    })
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {editingInstance ? '保存' : '添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
