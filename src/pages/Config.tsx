import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useFrpcStore } from '../store'

export function Config() {
  const { config, fetchConfig, saveConfig, loading } = useFrpcStore()
  const [content, setContent] = useState('')

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  useEffect(() => {
    if (config) {
      setContent(config.content)
    }
  }, [config])

  const handleSave = () => {
    saveConfig(content)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">配置文件管理</h1>
            {config && (
              <p className="text-sm text-gray-500 mt-1">{config.path}</p>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            保存配置
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-96 p-6 font-mono text-sm border-0 focus:ring-0 resize-none"
            placeholder="配置文件内容..."
          />
        </div>

        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-sm text-yellow-800">
            <strong>提示：</strong> 修改配置文件后，建议重启 frpc 服务以使配置生效。
          </p>
        </div>
      </div>
    </div>
  )
}
