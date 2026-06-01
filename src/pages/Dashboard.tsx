import { useEffect } from 'react'
import { StatusCard } from '../components/StatusCard'
import { ServiceControls } from '../components/ServiceControls'
import { MappingTable } from '../components/MappingTable'
import { useFrpcStore } from '../store'

export function Dashboard() {
  const { status, mappings, fetchStatus, fetchMappings } = useFrpcStore()

  useEffect(() => {
    fetchStatus()
    fetchMappings()

    const interval = setInterval(() => {
      fetchStatus()
    }, 5000)

    return () => clearInterval(interval)
  }, [fetchStatus, fetchMappings])

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <StatusCard status={status} />
          <ServiceControls isRunning={status?.running || false} />
        </div>

        <MappingTable mappings={mappings} />
      </div>
    </div>
  )
}
