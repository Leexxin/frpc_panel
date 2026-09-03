import { useEffect, useState, useRef } from 'react'
import { useFrpcStore } from '../store'
import { FrpcInstance, ConnectionType, ConnectionConfig, CreateFrpcContainerInput } from '../../shared/types'
import { RefreshCw, Plus, Trash2, Play, Square, RotateCcw, Server, Settings, Monitor, Edit2, X, ArrowRight, Boxes, Box, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SkeletonCard } from '../components/Skeleton'
import { ErrorToast } from '../components/ErrorToast'

const POLL_INTERVAL = 3000 // 3秒刷新一次实例列表状态
const CONTAINER_POLL_INTERVAL = 15000

const createDefaultContainerForm = (): CreateFrpcContainerInput => ({
  name: 'frpc-new',
  image: 'snowdreamtech/frpc:latest',
  serverAddr: '',
  serverPort: 7000,
  authToken: '',
  hostConfigPath: '/opt/frpc/frpc-new/frpc.toml',
  containerConfigPath: '/etc/frp/frpc.toml',
  restartPolicy: 'unless-stopped',
})

export function Instances() {
  const navigate = useNavigate()
  const { 
    instances, 
    instancesStatus, 
    instanceDockerContainers,
    containerDiscoveryErrors,
    loading,
    error,
    fetchInstances, 
    fetchInstancesStatus, 
    fetchAllServerContainers,
    selectInstanceContainer,
    operateInstanceContainer,
    createInstanceContainer,
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
  const [containerTargetServer, setContainerTargetServer] = useState<FrpcInstance | null>(null)
  const [containerForm, setContainerForm] = useState<CreateFrpcContainerInput>(createDefaultContainerForm)
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
  const containerPollTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 初始化
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchInstances(), fetchInstancesStatus()])
      await fetchAllServerContainers()
      setInitialLoading(false)
    }
    init()
    startPolling()
    
    return () => {
      stopPolling()
    }
    // Zustand actions are stable; this effect intentionally owns one polling lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startPolling = () => {
    stopPolling()
    pollTimerRef.current = setInterval(() => {
      fetchInstancesStatus()
    }, POLL_INTERVAL)
    containerPollTimerRef.current = setInterval(() => {
      fetchAllServerContainers()
    }, CONTAINER_POLL_INTERVAL)
  }

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (containerPollTimerRef.current) {
      clearInterval(containerPollTimerRef.current)
      containerPollTimerRef.current = null
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

  const handleEnterContainer = async (instance: FrpcInstance, containerName: string) => {
    const selected = await selectInstanceContainer(instance.id, containerName)
    if (selected) navigate(`/instances/${instance.id}`)
  }

  const handleContainerAction = async (
    instance: FrpcInstance,
    containerName: string,
    action: 'start' | 'stop' | 'restart',
  ) => {
    await operateInstanceContainer(instance.id, containerName, action)
  }

  const handleCreateContainer = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!containerTargetServer) return
    const created = await createInstanceContainer(containerTargetServer.id, containerForm)
    if (created) {
      setContainerTargetServer(null)
      setContainerForm(createDefaultContainerForm())
    }
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
                value={formData.config.dockerContainerName || ''}
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

  const serverInstances = instances.filter(instance => instance.connectionType === 'remote_ssh')
  const standaloneInstances = instances.filter(instance => instance.connectionType !== 'remote_ssh')
  const discoveredContainerCount = Object.values(instanceDockerContainers).reduce(
    (total, containers) => total + containers.length,
    0,
  )
  const isContainerRunning = (state?: string, status?: string) =>
    state === 'running' || status === 'running' || Boolean(status?.startsWith('Up'))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页面头部 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">服务器与 frpc</h1>
            <p className="text-gray-600 mt-1">按服务器查看自动发现的 frpc，或管理独立容器与二进制实例</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                fetchInstances()
                fetchInstancesStatus()
                fetchAllServerContainers()
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

        {!initialLoading && instances.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">服务器</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{serverInstances.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">已发现 frpc</p>
              <p className="text-2xl font-semibold text-blue-600 mt-1">{discoveredContainerCount}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 col-span-2 md:col-span-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">独立实例</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{standaloneInstances.length}</p>
            </div>
          </div>
        )}

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

        {!initialLoading && serverInstances.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Monitor className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">远程服务器</h2>
              <span className="text-sm text-gray-500">服务器内的 frpc 会分开展示和操作</span>
            </div>
            <div className="space-y-5">
              {serverInstances.map((instance) => {
                const containers = instanceDockerContainers[instance.id] || []
                const discoveryError = containerDiscoveryErrors[instance.id]
                return (
                  <div key={instance.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 bg-slate-50 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white border border-gray-200 rounded-xl">
                          <Monitor className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-900">{instance.name}</h3>
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                              {containers.length === 1 ? '单个 frpc' : `${containers.length} 个 frpc`}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {instance.config.sshUser}@{instance.config.sshHost}:{instance.config.sshPort || 22}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setContainerTargetServer(instance)
                            setContainerForm(createDefaultContainerForm())
                          }}
                          className="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          <Plus className="w-4 h-4 mr-1.5" />添加 frpc
                        </button>
                        <button onClick={() => fetchAllServerContainers()} disabled={loading}
                          className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-white disabled:opacity-50">
                          <Search className="w-4 h-4 mr-1.5" />重新探测
                        </button>
                        <button onClick={() => handleEditInstance(instance)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-white rounded-lg" title="编辑服务器">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteInstance(instance.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="删除服务器">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="p-5">
                      {discoveryError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          <p className="font-medium">探测失败</p><p className="mt-1 text-red-600">{discoveryError}</p>
                        </div>
                      ) : containers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center">
                          <Boxes className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-700">暂未发现 frpc 容器</p>
                          <p className="text-xs text-gray-500 mt-1">将检查容器名称、镜像和启动命令</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {containers.map((container) => {
                            const running = isContainerRunning(container.state, container.status)
                            return (
                              <article key={container.name} className="rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className={`p-2 rounded-lg ${running ? 'bg-green-50' : 'bg-gray-100'}`}>
                                      <Box className={`w-5 h-5 ${running ? 'text-green-600' : 'text-gray-500'}`} />
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="font-semibold text-gray-900 truncate">{container.name}</h4>
                                      <p className="text-xs text-gray-500 truncate mt-0.5">{container.image || '未知镜像'}</p>
                                    </div>
                                  </div>
                                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${running ? 'text-green-700' : 'text-gray-500'}`}>
                                    <span className={`w-2 h-2 rounded-full ${running ? 'bg-green-500' : 'bg-gray-400'}`} />
                                    {running ? '运行中' : '已停止'}
                                  </span>
                                </div>
                                <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                  <span className="text-gray-400">配置</span>
                                  <span className="ml-2 font-mono break-all">{container.configPath || '待进入后自动识别'}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-4">
                                  <button onClick={() => handleContainerAction(instance, container.name, 'start')} disabled={running || loading}
                                    className="p-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-40" title="启动"><Play className="w-4 h-4" /></button>
                                  <button onClick={() => handleContainerAction(instance, container.name, 'stop')} disabled={!running || loading}
                                    className="p-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-40" title="停止"><Square className="w-4 h-4" /></button>
                                  <button onClick={() => handleContainerAction(instance, container.name, 'restart')} disabled={!running || loading}
                                    className="p-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-40" title="重启"><RotateCcw className="w-4 h-4" /></button>
                                  <button onClick={() => handleEnterContainer(instance, container.name)} disabled={loading}
                                    className="ml-auto inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                    管理此 frpc<ArrowRight className="w-4 h-4 ml-1" />
                                  </button>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {!initialLoading && standaloneInstances.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Box className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">独立实例</h2>
              <span className="text-sm text-gray-500">直接管理单个容器或 frpc 进程</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {standaloneInstances.map((instance) => {
                const status = getInstanceStatus(instance)
                const Icon = getConnectionTypeIcon(instance.connectionType)
                return (
                  <div key={instance.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-blue-50 rounded-lg"><Icon className="w-5 h-5 text-blue-600" /></div>
                        <div className="min-w-0"><h3 className="font-semibold text-gray-900 truncate">{instance.name}</h3><p className="text-sm text-gray-500">{getConnectionTypeLabel(instance.connectionType)}</p></div>
                      </div>
                      <span className={`text-xs font-medium ${status?.serviceStatus?.running ? 'text-green-700' : 'text-gray-500'}`}>
                        {status?.serviceStatus?.running ? '运行中' : '未运行'}
                      </span>
                    </div>
                    <div className="p-5">
                      <div className="flex gap-2 mb-4">
                        <button onClick={() => handleStartInstance(instance)} disabled={status?.serviceStatus?.running || loading} className="flex-1 flex items-center justify-center px-3 py-2 bg-green-50 text-green-700 rounded-lg disabled:opacity-40"><Play className="w-4 h-4 mr-1" />启动</button>
                        <button onClick={() => handleStopInstance(instance)} disabled={!status?.serviceStatus?.running || loading} className="flex-1 flex items-center justify-center px-3 py-2 bg-red-50 text-red-700 rounded-lg disabled:opacity-40"><Square className="w-4 h-4 mr-1" />停止</button>
                        <button onClick={() => handleRestartInstance(instance)} disabled={!status?.serviceStatus?.running || loading} className="p-2 bg-blue-50 text-blue-700 rounded-lg disabled:opacity-40" title="重启"><RotateCcw className="w-4 h-4" /></button>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditInstance(instance)} className="p-2 border border-gray-200 text-gray-600 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleEnterInstance(instance)} className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg">进入管理<ArrowRight className="w-4 h-4 ml-1" /></button>
                        <button onClick={() => handleDeleteInstance(instance.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
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

      {containerTargetServer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">添加 frpc 容器</h3>
                <p className="text-sm text-gray-500 mt-1">
                  目标服务器：{containerTargetServer.name} · {containerTargetServer.config.sshHost}
                </p>
              </div>
              <button onClick={() => setContainerTargetServer(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContainer}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">容器名称</label>
                  <input required value={containerForm.name} pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]*"
                    onChange={(event) => {
                      const name = event.target.value
                      setContainerForm({ ...containerForm, name, hostConfigPath: `/opt/frpc/${name}/frpc.toml` })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Docker 镜像</label>
                  <input required value={containerForm.image}
                    onChange={(event) => setContainerForm({ ...containerForm, image: event.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">FRP 服务端地址</label>
                  <input required value={containerForm.serverAddr} placeholder="frps.example.com"
                    onChange={(event) => setContainerForm({ ...containerForm, serverAddr: event.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">FRP 服务端端口</label>
                  <input required type="number" min={1} max={65535} value={containerForm.serverPort}
                    onChange={(event) => setContainerForm({ ...containerForm, serverPort: Number(event.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">认证 Token（可选）</label>
                  <input type="password" value={containerForm.authToken || ''} autoComplete="off"
                    onChange={(event) => setContainerForm({ ...containerForm, authToken: event.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">宿主机配置路径</label>
                  <input required value={containerForm.hostConfigPath}
                    onChange={(event) => setContainerForm({ ...containerForm, hostConfigPath: event.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">容器内配置路径</label>
                  <input required value={containerForm.containerConfigPath}
                    onChange={(event) => setContainerForm({ ...containerForm, containerConfigPath: event.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">重启策略</label>
                  <select value={containerForm.restartPolicy}
                    onChange={(event) => setContainerForm({ ...containerForm, restartPolicy: event.target.value as CreateFrpcContainerInput['restartPolicy'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="unless-stopped">unless-stopped</option>
                    <option value="always">always</option>
                    <option value="on-failure">on-failure</option>
                    <option value="no">no</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
                将在服务器上新建配置文件并启动容器；如果目标配置文件已存在，系统会停止而不会覆盖。
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setContainerTargetServer(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">取消</button>
                <button type="submit" disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '正在创建…' : '创建并启动'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
