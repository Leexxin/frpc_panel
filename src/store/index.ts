import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PortMapping, ServiceStatus, LogEntry, FrpcInstance, ConnectionType, ConnectionConfig, InstanceStatus } from '../../shared/types'
import { api } from '../lib/api'

interface FrpcStore {
  loading: boolean
  error: string | null

  // 多实例管理
  instances: FrpcInstance[]
  instancesStatus: InstanceStatus[]
  selectedInstanceId: string | null
  
  // 当前选中实例的状态
  currentInstanceStatus: ServiceStatus | null
  currentInstanceMappings: PortMapping[]
  currentInstanceConfig: string
  currentInstanceLogs: LogEntry[]

  clearError: () => void

  // 实例管理方法
  fetchInstances: () => Promise<void>
  fetchInstancesStatus: (forceRefresh?: boolean) => Promise<void>
  createInstance: (data: { name: string; connectionType: ConnectionType; config: ConnectionConfig }) => Promise<void>
  updateInstance: (id: string, data: { name: string; connectionType: ConnectionType; config: ConnectionConfig }) => Promise<void>
  deleteInstance: (id: string) => Promise<void>
  selectInstance: (id: string | null) => void

  // 单个实例操作
  startSelectedInstanceService: () => Promise<void>
  stopSelectedInstanceService: () => Promise<void>
  restartSelectedInstanceService: () => Promise<void>
  
  // 单个实例详细操作
  fetchCurrentInstanceStatus: (instanceId: string, forceRefresh?: boolean) => Promise<void>
  fetchCurrentInstanceMappings: (instanceId: string) => Promise<void>
  fetchCurrentInstanceConfig: (instanceId: string) => Promise<void>
  fetchCurrentInstanceLogs: (instanceId: string) => Promise<void>
  
  addCurrentInstanceMapping: (mapping: Omit<PortMapping, 'status'>) => Promise<void>
  updateCurrentInstanceMapping: (mappingId: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>) => Promise<void>
  deleteCurrentInstanceMapping: (mappingId: string) => Promise<void>
  saveCurrentInstanceConfig: (content: string) => Promise<void>
}

export const useFrpcStore = create<FrpcStore>()(
  persist(
    (set, get) => ({
      loading: false,
      error: null,

      // 多实例管理
      instances: [],
      instancesStatus: [],
      selectedInstanceId: null,
      
      // 当前选中实例的状态
      currentInstanceStatus: null,
      currentInstanceMappings: [],
      currentInstanceConfig: '',
      currentInstanceLogs: [],

      clearError: () => set({ error: null }),

      // 实例管理方法
      fetchInstances: async () => {
        set({ error: null })
        try {
          const instances = await api.getInstances()
          set({ instances, loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },

      fetchInstancesStatus: async (forceRefresh?: boolean) => {
        set({ error: null })
        try {
          const statuses = await api.getInstancesStatus(forceRefresh)
          set({ instancesStatus: statuses })
        } catch (error) {
          set({ error: (error as Error).message })
        }
      },

      createInstance: async (data) => {
        set({ loading: true, error: null })
        try {
          await api.createInstance(data)
          await get().fetchInstances()
          await get().fetchInstancesStatus()
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },

      updateInstance: async (id, data) => {
        set({ loading: true, error: null })
        try {
          await api.updateInstance(id, data)
          await get().fetchInstances()
          await get().fetchInstancesStatus()
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },

      deleteInstance: async (id) => {
        set({ loading: true, error: null })
        try {
          await api.deleteInstance(id)
          await get().fetchInstances()
          await get().fetchInstancesStatus()
          if (get().selectedInstanceId === id) {
            set({ selectedInstanceId: null })
          }
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },

      selectInstance: (id) => set({ selectedInstanceId: id }),

      // 单个实例操作
      startSelectedInstanceService: async () => {
        const selectedId = get().selectedInstanceId
        if (!selectedId) return

        set({ loading: true, error: null })
        try {
          await api.startInstanceService(selectedId)
          // 强制刷新状态以获取最新状态
          await get().fetchInstancesStatus(true)
          await get().fetchCurrentInstanceStatus(selectedId)
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },

      stopSelectedInstanceService: async () => {
        const selectedId = get().selectedInstanceId
        if (!selectedId) return

        set({ loading: true, error: null })
        try {
          await api.stopInstanceService(selectedId)
          // 强制刷新状态以获取最新状态
          await get().fetchInstancesStatus(true)
          await get().fetchCurrentInstanceStatus(selectedId)
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },

      restartSelectedInstanceService: async () => {
        const selectedId = get().selectedInstanceId
        if (!selectedId) return

        set({ loading: true, error: null })
        try {
          await api.restartInstanceService(selectedId)
          // 强制刷新状态以获取最新状态
          await get().fetchInstancesStatus(true)
          await get().fetchCurrentInstanceStatus(selectedId)
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },
      
      // 单个实例详细操作
      fetchCurrentInstanceStatus: async (instanceId, forceRefresh?: boolean) => {
        set({ error: null })
        try {
          const status = await api.getInstanceStatus(instanceId, forceRefresh)
          set({ currentInstanceStatus: status.serviceStatus || null })
        } catch (error) {
          set({ error: (error as Error).message })
        }
      },
      
      fetchCurrentInstanceMappings: async (instanceId) => {
        set({ error: null })
        try {
          const mappings = await api.getInstanceMappings(instanceId)
          set({ currentInstanceMappings: mappings })
        } catch (error) {
          set({ error: (error as Error).message })
        }
      },
      
      fetchCurrentInstanceConfig: async (instanceId) => {
        set({ error: null })
        try {
          const config = await api.getInstanceConfig(instanceId)
          set({ currentInstanceConfig: config.content })
        } catch (error) {
          set({ error: (error as Error).message })
        }
      },
      
      fetchCurrentInstanceLogs: async (instanceId) => {
        set({ error: null })
        try {
          const logs = await api.getInstanceLogs(instanceId)
          set({ currentInstanceLogs: logs })
        } catch (error) {
          set({ error: (error as Error).message })
        }
      },
      
      addCurrentInstanceMapping: async (mapping) => {
        const selectedId = get().selectedInstanceId
        if (!selectedId) return
        
        set({ loading: true, error: null })
        try {
          await api.addInstanceMapping(selectedId, mapping)
          await get().fetchCurrentInstanceMappings(selectedId)
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },
      
      updateCurrentInstanceMapping: async (mappingId, mapping) => {
        const selectedId = get().selectedInstanceId
        if (!selectedId) return
        
        set({ loading: true, error: null })
        try {
          await api.updateInstanceMapping(selectedId, mappingId, mapping)
          await get().fetchCurrentInstanceMappings(selectedId)
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },
      
      deleteCurrentInstanceMapping: async (mappingId) => {
        const selectedId = get().selectedInstanceId
        if (!selectedId) return
        
        set({ loading: true, error: null })
        try {
          await api.deleteInstanceMapping(selectedId, mappingId)
          await get().fetchCurrentInstanceMappings(selectedId)
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },
      
      saveCurrentInstanceConfig: async (content) => {
        const selectedId = get().selectedInstanceId
        if (!selectedId) return
        
        set({ loading: true, error: null })
        try {
          await api.saveInstanceConfig(selectedId, content)
          await get().fetchCurrentInstanceConfig(selectedId)
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },
    }),
    {
      name: 'frpc-panel-storage',
      partialize: (state) => ({
        selectedInstanceId: state.selectedInstanceId,
        instances: state.instances,
        instancesStatus: state.instancesStatus,
      }),
    }
  )
)
