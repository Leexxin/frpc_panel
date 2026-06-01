import { useEffect, useState } from 'react'
import { MappingTable } from '../components/MappingTable'
import { MappingForm } from '../components/MappingForm'
import { Plus } from 'lucide-react'
import { useFrpcStore } from '../store'
import { PortMapping } from '../../shared/types'

export function Mappings() {
  const { mappings, fetchMappings } = useFrpcStore()
  const [showForm, setShowForm] = useState(false)
  const [editingMapping, setEditingMapping] = useState<PortMapping | undefined>()

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  const handleEdit = (mapping: PortMapping) => {
    setEditingMapping(mapping)
    setShowForm(true)
  }

  const handleClose = () => {
    setShowForm(false)
    setEditingMapping(undefined)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">端口映射管理</h1>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            添加映射
          </button>
        </div>

        <MappingTable mappings={mappings} onEdit={handleEdit} />

        {showForm && (
          <MappingForm mapping={editingMapping} onClose={handleClose} />
        )}
      </div>
    </div>
  )
}
