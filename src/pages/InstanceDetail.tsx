import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useFrpcStore } from '../store'
import { Play, Square, RotateCcw, ArrowLeft, Plus, Edit, Trash2, RefreshCw, Activity, Server, FileText, Settings, Save } from 'lucide-react'
import { SkeletonDetail } from '../components/Skeleton'
import { ErrorToast } from '../components/ErrorToast'

const tabs = [
  { id: 'dashboard', label: '仪表盘', icon: Activity },
  { id: 'mappings', label: '端口映射', icon: Server },
  { id: 'config', label: '配置文件', icon: FileText },
  { id: 'logs', label: '服务日志', icon: Settings },
] as const

type TabId = typeof tabs[number]['id']

const POLL_INTERVAL = 3000 // 3秒刷新一次

export function InstanceDetail() {
  const { instanceId } = useParams<{ instanceId: string }>()
  const navigate = useNavigate()
  const {
    instances,
    currentInstanceStatus,
    currentInstanceMappings,
    currentInstanceConfig,
    currentInstanceLogs,
    currentDockerContainers,
    selectedInstanceId,
    selectInstance,
    fetchCurrentInstanceStatus,
    fetchCurrentInstanceMappings,
    fetchCurrentInstanceConfig,
    fetchCurrentInstanceLogs,
    discoverCurrentInstanceContainers,
    startSelectedInstanceService,
    stopSelectedInstanceService,
    restartSelectedInstanceService,
    addCurrentInstanceMapping,
    updateCurrentInstanceMapping,
    deleteCurrentInstanceMapping,
    saveCurrentInstanceConfig,
    loading,
    error,
    fetchInstances,
  } = useFrpcStore()

  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [showAddMapping, setShowAddMapping] = useState(false)
  const [editingMapping, setEditingMapping] = useState<string | null>(null)
  const [mappingForm, setMappingForm] = useState<{
    name: string
    type: 'tcp' | 'udp'
    localIP: string
    localPort: number
    remotePort: number
  }>({
    name: '',
    type: 'tcp',
    localIP: '127.0.0.1',
    localPort: 8080,
    remotePort: 80,
  })
  const [configInput, setConfigInput] = useState('')
  const [showSaveConfig, setShowSaveConfig] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 获取当前实例
  const currentInstance = instances.find(i => i.id === instanceId)

  // 初始化
  useEffect(() => {
    if (!instanceId) return
    
    void (async () => {
      await fetchInstances()
      selectInstance(instanceId)
      await loadAllData()
    })()
    
    // 启动轮询
    startPolling()
    
    return () => {
      stopPolling()
    }
  }, [instanceId])

  const startPolling = () => {
    stopPolling()
    pollTimerRef.current = setInterval(() => {
      if (instanceId) {
        // 只轮询状态和日志，这些会频繁变化
        fetchCurrentInstanceStatus(instanceId)
        if (activeTab === 'logs') {
          fetchCurrentInstanceLogs(instanceId)
        }
      }
    }, POLL_INTERVAL)
  }

  // activeTab 变化时重启轮询（因为日志轮询依赖 activeTab）
  useEffect(() => {
    if (instanceId) {
      startPolling()
    }
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, instanceId])

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  // Tab变化时加载相应数据
  useEffect(() => {
    if (!instanceId) return

    if (activeTab === 'mappings') {
      fetchCurrentInstanceMappings(instanceId)
    } else if (activeTab === 'config') {
      fetchCurrentInstanceConfig(instanceId)
    } else if (activeTab === 'logs') {
      fetchCurrentInstanceLogs(instanceId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, instanceId])

  // 监听配置变化
  useEffect(() => {
    if (currentInstanceConfig) {
      setConfigInput(currentInstanceConfig)
    }
  }, [currentInstanceConfig])

  const loadAllData = async () => {
    if (instanceId) {
      const instance = useFrpcStore.getState().instances.find(item => item.id === instanceId)
      if (instance?.connectionType === 'remote_ssh') {
        await discoverCurrentInstanceContainers(instanceId)
      } else {
        await Promise.all([
          fetchCurrentInstanceStatus(instanceId),
          fetchCurrentInstanceMappings(instanceId),
          fetchCurrentInstanceConfig(instanceId),
          fetchCurrentInstanceLogs(instanceId),
        ])
      }
      setInitialLoading(false)
    }
  }

  const refreshAll = () => {
    loadAllData()
  }

  // 处理端口映射表单
  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault()
    await addCurrentInstanceMapping({
      ...mappingForm,
      id: mappingForm.name || `mapping-${Date.now()}`,
      protocol: mappingForm.type,
      localIp: mappingForm.localIP,
    })
    setShowAddMapping(false)
    setMappingForm({
      name: '',
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 8080,
      remotePort: 80,
    })
  }

  const handleEditMapping = (mapping: any) => {
    setEditingMapping(mapping.id)
    setMappingForm({
      name: mapping.name,
      type: mapping.protocol || mapping.type || 'tcp',
      localIP: mapping.localIP || mapping.localIp || '127.0.0.1',
      localPort: mapping.localPort,
      remotePort: mapping.remotePort,
    })
    setShowAddMapping(true)
  }

  const handleSaveEditMapping = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingMapping) {
      await updateCurrentInstanceMapping(editingMapping, {
        ...mappingForm,
        protocol: mappingForm.type,
        localIp: mappingForm.localIP,
      })
    }
    setEditingMapping(null)
    setShowAddMapping(false)
    setMappingForm({
      name: '',
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 8080,
      remotePort: 80,
    })
  }

  const handleDeleteMapping = async (mappingId: string) => {
    if (confirm('确定要删除这个端口映射吗？')) {
      await deleteCurrentInstanceMapping(mappingId)
    }
  }

  const handleSaveConfig = async () => {
    await saveCurrentInstanceConfig(configInput)
    setShowSaveConfig(false)
  }

  if (initialLoading) {
    return <SkeletonDetail />
  }

  if (!currentInstance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">未找到该实例</h2>
          <Link
            to="/instances"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回实例列表
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页面头部 */}
        <div className="mb-8">
          {/* 错误提示 - Toast 自动消失 */}
          {error && (
            <ErrorToast
              message={error}
              onClose={() => useFrpcStore.getState().clearError()}
            />
          )}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Link
                to="/instances"
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5 mr-1" />
                返回
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{currentInstance.name}</h1>
                <p className="text-sm text-gray-600 mt-1">
                  连接类型: {currentInstance.connectionType}
                </p>
              </div>
            </div>
            <button
              onClick={refreshAll}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {/* Tab 导航 */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Tab 内容 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* 状态卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">服务状态</h3>
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-3 h-3 rounded-full ${
                      currentInstanceStatus?.running ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <span className="text-sm text-gray-600">
                      {currentInstanceStatus?.running ? '运行中' : '未运行'}
                    </span>
                  </div>
                  {currentInstanceStatus?.version && (
                    <p className="text-sm text-gray-600 mb-2">
                      版本: {currentInstanceStatus.version}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={startSelectedInstanceService}
                      disabled={currentInstanceStatus?.running || loading}
                      className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      启动
                    </button>
                    <button
                      onClick={stopSelectedInstanceService}
                      disabled={!currentInstanceStatus?.running || loading}
                      className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      <Square className="w-4 h-4 mr-2" />
                      停止
                    </button>
                    <button
                      onClick={restartSelectedInstanceService}
                      disabled={!currentInstanceStatus?.running || loading}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      重启
                    </button>
                  </div>
                </div>
                {currentInstance.connectionType === 'remote_ssh' && (
                  <div className="bg-gray-50 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">frpc 容器</h3>
                      <button
                        onClick={() => instanceId && discoverCurrentInstanceContainers(instanceId)}
                        disabled={loading}
                        className="flex items-center px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        重新探测
                      </button>
                    </div>
                    {currentDockerContainers.length > 0 ? (
                      <>
                        <select
                          value={currentInstance.config.remoteDockerContainerName || currentInstanceStatus?.containerName || ''}
                          onChange={(event) => instanceId && discoverCurrentInstanceContainers(instanceId, event.target.value)}
                          disabled={loading}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {currentDockerContainers.map((container) => (
                            <option key={container.name} value={container.name}>
                              {container.name} · {container.image} · {container.status}
                            </option>
                          ))}
                        </select>
                        <div className="mt-3 space-y-1 text-sm text-gray-600">
                          <p>容器：{currentInstanceStatus?.containerName || currentInstance.config.remoteDockerContainerName}</p>
                          <p>配置：{currentInstanceStatus?.configPath || currentInstance.config.remoteConfigPath || '自动识别'}</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                        未在该服务器上发现 frpc 容器，将按远程二进制方式尝试管理。
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 端口映射预览 */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">端口映射</h3>
                  <button
                    onClick={() => setActiveTab('mappings')}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    管理 →
                  </button>
                </div>
                <div className="space-y-2">
                  {currentInstanceMappings.slice(0, 5).map((mapping) => (
                    <div key={mapping.id} className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-gray-900">{mapping.name}</span>
                        <span className="text-sm text-gray-500">
                          {mapping.protocol || mapping.type}: {mapping.localIP || mapping.localIp}:{mapping.localPort} → {mapping.remotePort}
                        </span>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${
                        mapping.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mappings' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">端口映射</h3>
                <button
                  onClick={() => setShowAddMapping(true)}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  添加映射
                </button>
              </div>

              <div className="space-y-3">
                {currentInstanceMappings.map((mapping) => (
                    <div key={mapping.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-gray-900">{mapping.name}</span>
                        <span className="text-sm text-gray-500">
                          {mapping.protocol || mapping.type}: {mapping.localIP || mapping.localIp}:{mapping.localPort} → {mapping.remotePort}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full mr-2 ${
                          mapping.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        <button
                          onClick={() => handleEditMapping(mapping)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMapping(mapping.id)}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">配置文件</h3>
                <button
                  onClick={handleSaveConfig}
                  disabled={loading || !showSaveConfig}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4 mr-2" />
                  保存
                </button>
              </div>
              <textarea
                value={configInput}
                onChange={(e) => {
                  setConfigInput(e.target.value)
                  setShowSaveConfig(e.target.value !== currentInstanceConfig)
                }}
                className="w-full h-96 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="配置文件内容..."
              />
            </div>
          )}

          {activeTab === 'logs' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-6">服务日志</h3>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm max-h-96 overflow-y-auto">
                {currentInstanceLogs.map((log, index) => (
                  <div key={index} className="mb-1">
                    <span className="text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                    <span className={`ml-2 ${
                      log.level === 'error' ? 'text-red-400' :
                      log.level === 'warn' ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>[{log.level}]</span>
                    <span className="ml-2 text-gray-300">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 添加/编辑端口映射弹窗 */}
        {showAddMapping && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingMapping ? '编辑端口映射' : '添加端口映射'}
              </h3>
              <form onSubmit={editingMapping ? handleSaveEditMapping : handleAddMapping}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                    <input
                      type="text"
                      value={mappingForm.name}
                      onChange={(e) => setMappingForm({ ...mappingForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
                    <select
                      value={mappingForm.type}
                      onChange={(e) => setMappingForm({ ...mappingForm, type: e.target.value as 'tcp' | 'udp' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">本地 IP</label>
                    <input
                      type="text"
                      value={mappingForm.localIP}
                      onChange={(e) => setMappingForm({ ...mappingForm, localIP: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">本地端口</label>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={mappingForm.localPort}
                      onChange={(e) => setMappingForm({ ...mappingForm, localPort: Math.min(65535, Math.max(1, parseInt(e.target.value) || 1)) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">远程端口</label>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={mappingForm.remotePort}
                      onChange={(e) => setMappingForm({ ...mappingForm, remotePort: Math.min(65535, Math.max(1, parseInt(e.target.value) || 1)) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMapping(false)
                      setEditingMapping(null)
                      setMappingForm({
                        name: '',
                        type: 'tcp',
                        localIP: '127.0.0.1',
                        localPort: 8080,
                        remotePort: 80,
                      })
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {editingMapping ? '保存' : '添加'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
