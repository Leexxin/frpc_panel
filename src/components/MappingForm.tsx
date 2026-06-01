import { useState } from 'react'
import { PortMapping } from '../../shared/types'
import { X } from 'lucide-react'
import { useFrpcStore } from '../store'

interface MappingFormProps {
  mapping?: PortMapping
  onClose: () => void
}

export function MappingForm({ mapping, onClose }: MappingFormProps) {
  const { addMapping, updateMapping, loading } = useFrpcStore()
  const [formData, setFormData] = useState({
    name: mapping?.name || '',
    protocol: mapping?.protocol || 'tcp',
    localPort: mapping?.localPort?.toString() || '',
    remotePort: mapping?.remotePort?.toString() || '',
    localIp: mapping?.localIp || mapping?.localIP || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const data: any = {
      ...formData,
      localPort: parseInt(formData.localPort),
    }
    
    if (formData.remotePort) {
      data.remotePort = parseInt(formData.remotePort)
    }

    if (mapping) {
      await updateMapping(mapping.id, data)
    } else {
      await addMapping(data)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">
            {mapping ? '编辑端口映射' : '添加端口映射'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              名称
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              协议
            </label>
            <select
              value={formData.protocol}
              onChange={(e) => setFormData({ ...formData, protocol: e.target.value as 'tcp' | 'udp' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              本地端口
            </label>
            <input
              type="number"
              value={formData.localPort}
              onChange={(e) => setFormData({ ...formData, localPort: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              远程端口 (可选)
            </label>
            <input
              type="number"
              value={formData.remotePort}
              onChange={(e) => setFormData({ ...formData, remotePort: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              本地IP (可选)
            </label>
            <input
              type="text"
              value={formData.localIp}
              onChange={(e) => setFormData({ ...formData, localIp: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="127.0.0.1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {mapping ? '更新' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
