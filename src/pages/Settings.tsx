import { useEffect, useState } from 'react'
import { Save, Search, RefreshCw } from 'lucide-react'
import { useFrpcStore } from '../store'

export function Settings() {
  const { panelConfig, dockerContainers, fetchPanelConfig, savePanelConfig, detectConfig, fetchDockerContainers, loading } = useFrpcStore()
  const [formData, setFormData] = useState({
    deploymentType: 'docker' as 'binary' | 'docker',
    frpcPath: '',
    configPath: '',
    dockerContainerName: '',
  })

  useEffect(() => {
    fetchPanelConfig()
    fetchDockerContainers()
  }, [fetchPanelConfig, fetchDockerContainers])

  useEffect(() => {
    if (panelConfig) {
      setFormData({
        deploymentType: panelConfig.deploymentType || 'docker',
        frpcPath: panelConfig.frpcPath || '',
        configPath: panelConfig.configPath || '',
        dockerContainerName: panelConfig.dockerContainerName || '',
      })
    }
  }, [panelConfig])

  const handleSave = async () => {
    await savePanelConfig(formData)
  }

  const handleDetect = async () => {
    await detectConfig()
    await fetchDockerContainers()
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">系统设置</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={handleDetect}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 disabled:opacity-50 transition-colors"
            >
              <Search className="w-4 h-4 mr-2" />
              自动检测
            </button>
            <button
              onClick={fetchDockerContainers}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新容器
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4 mr-2" />
              保存设置
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4">
              部署类型
            </label>
            <div className="flex gap-6">
              <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="deploymentType"
                  value="binary"
                  checked={formData.deploymentType === 'binary'}
                  onChange={(e) => setFormData({ ...formData, deploymentType: e.target.value as 'binary' | 'docker' })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium text-gray-800">二进制部署</div>
                  <div className="text-sm text-gray-500">直接运行 frpc 可执行文件</div>
                </div>
              </label>
              <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="deploymentType"
                  value="docker"
                  checked={formData.deploymentType === 'docker'}
                  onChange={(e) => setFormData({ ...formData, deploymentType: e.target.value as 'binary' | 'docker' })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium text-gray-800">Docker 部署</div>
                  <div className="text-sm text-gray-500">通过 Docker 容器管理 frpc</div>
                </div>
              </label>
            </div>
          </div>

          {formData.deploymentType === 'binary' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  frpc 可执行文件路径
                </label>
                <input
                  type="text"
                  value={formData.frpcPath}
                  onChange={(e) => setFormData({ ...formData, frpcPath: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="/usr/local/bin/frpc"
                />
                <p className="text-sm text-gray-500 mt-1">
                  留空将自动检测系统中的 frpc
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  frpc 配置文件路径
                </label>
                <input
                  type="text"
                  value={formData.configPath}
                  onChange={(e) => setFormData({ ...formData, configPath: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="/etc/frpc/frpc.toml"
                />
              </div>
            </div>
          )}

          {formData.deploymentType === 'docker' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Docker 容器名称
                </label>
                {dockerContainers.length > 0 ? (
                  <div>
                    <select
                      value={formData.dockerContainerName}
                      onChange={(e) => setFormData({ ...formData, dockerContainerName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- 选择容器 --</option>
                      {dockerContainers.map((container) => (
                        <option key={container.name} value={container.name}>
                          {container.name} ({container.image}) - {container.status}
                        </option>
                      ))}
                    </select>
                    <p className="text-sm text-gray-500 mt-1">
                      从运行中的容器中选择您的 frpc 容器
                    </p>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={formData.dockerContainerName}
                      onChange={(e) => setFormData({ ...formData, dockerContainerName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="frpc"
                    />
                    <p className="text-sm text-yellow-600 mt-1">
                      未检测到运行中的 Docker 容器，请手动输入容器名称
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {panelConfig && (
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">当前配置状态</h3>
              <div className="bg-gray-50 rounded-md p-4 space-y-2 text-sm">
                <div className="flex">
                  <span className="text-gray-500 w-32">部署类型:</span>
                  <span className="font-medium">
                    {panelConfig.deploymentType === 'binary' ? '二进制部署' : 'Docker 部署'}
                  </span>
                </div>
                {panelConfig.frpcPath && (
                  <div className="flex">
                    <span className="text-gray-500 w-32">frpc 路径:</span>
                    <span className="font-mono">{panelConfig.frpcPath}</span>
                  </div>
                )}
                {panelConfig.dockerContainerName && (
                  <div className="flex">
                    <span className="text-gray-500 w-32">容器名称:</span>
                    <span className="font-mono">{panelConfig.dockerContainerName}</span>
                  </div>
                )}
                <div className="flex">
                  <span className="text-gray-500 w-32">配置来源:</span>
                  <span className={`font-medium ${panelConfig.autoDetected ? 'text-yellow-600' : 'text-green-600'}`}>
                    {panelConfig.autoDetected ? '自动检测' : '用户配置'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">使用说明</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p>• 如果您的 frpc 是用 Docker 部署的，请选择「Docker 部署」并选择对应的容器</p>
            <p>• 点击「自动检测」可以自动发现系统中的 frpc 或 Docker 容器</p>
            <p>• 修改配置后，建议重启 frpc 服务使配置生效</p>
            <p>• 面板使用 Docker socket 访问宿主机上的容器，确保权限正确</p>
          </div>
        </div>
      </div>
    </div>
  )
}
