import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PortMapping, ServiceStatus, LogEntry, FrpcInstance, ConnectionType, ConnectionConfig, InstanceStatus, DockerContainerInfo, CreateFrpcContainerInput } from '../../shared/types'
import { api } from '../lib/api'

interface FrpcStore {
  loading: boolean
  error: string | null

  // 多实例管理
  instances: FrpcInstance[]
  instancesStatus: InstanceStatus[]
  instanceDockerContainers: Record<string, DockerContainerInfo[]>
  containerDiscoveryErrors: Record<string, string>
  selectedInstanceId: string | null
  
  // 当前选中实例的状态
  currentInstanceStatus: ServiceStatus | null
  currentInstanceMappings: PortMapping[]
  currentInstanceConfig: string
  currentInstanceLogs: LogEntry[]
  currentDockerContainers: DockerContainerInfo[]

  clearError: () => void

  // 实例管理方法
  fetchInstances: () => Promise<void>
  fetchInstancesStatus: (forceRefresh?: boolean) => Promise<void>
  fetchAllServerContainers: () => Promise<void>
  selectInstanceContainer: (instanceId: string, containerName: string) => Promise<boolean>
  operateInstanceContainer: (instanceId: string, containerName: string, action: 'start' | 'stop' | 'restart') => Promise<void>
  createInstanceContainer: (instanceId: string, input: CreateFrpcContainerInput) => Promise<boolean>
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
  discoverCurrentInstanceContainers: (instanceId: string, containerName?: string) => Promise<void>
  
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
      instanceDockerContainers: {},
      containerDiscoveryErrors: {},
      selectedInstanceId: null,
      
      // 当前选中实例的状态
      currentInstanceStatus: null,
      currentInstanceMappings: [],
      currentInstanceConfig: '',
      currentInstanceLogs: [],
      currentDockerContainers: [],

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

      fetchAllServerContainers: async () => {
        const servers = get().instances.filter(instance => instance.connectionType === 'remote_ssh')
        if (!servers.length) {
          set({ instanceDockerContainers: {}, containerDiscoveryErrors: {} })
          return
        }
        const results = await Promise.all(servers.map(async (server) => {
          try {
            const containers = await api.getInstanceDockerContainers(server.id)
            return { id: server.id, containers }
          } catch (error) {
            return { id: server.id, containers: [] as DockerContainerInfo[], error: (error as Error).message }
          }
        }))
        const containers: Record<string, DockerContainerInfo[]> = {}
        const errors: Record<string, string> = {}
        results.forEach(result => {
          containers[result.id] = result.containers
          if (result.error) errors[result.id] = result.error
        })
        set({ instanceDockerContainers: containers, containerDiscoveryErrors: errors })
      },

      selectInstanceContainer: async (instanceId, containerName) => {
        set({ loading: true, error: null })
        try {
          const result = await api.discoverInstanceDockerContainers(instanceId, containerName)
          set(state => ({
            currentDockerContainers: result.containers,
            instanceDockerContainers: { ...state.instanceDockerContainers, [instanceId]: result.containers },
            selectedInstanceId: instanceId,
            loading: false,
          }))
          await get().fetchInstances()
          return true
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
          return false
        }
      },

      operateInstanceContainer: async (instanceId, containerName, action) => {
        set({ loading: true, error: null, selectedInstanceId: instanceId })
        try {
          await api.discoverInstanceDockerContainers(instanceId, containerName)
          if (action === 'start') await api.startInstanceService(instanceId)
          if (action === 'stop') await api.stopInstanceService(instanceId)
          if (action === 'restart') await api.restartInstanceService(instanceId)
          await Promise.all([get().fetchInstances(), get().fetchInstancesStatus(true)])
          await get().fetchAllServerContainers()
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
        }
      },

      createInstanceContainer: async (instanceId, input) => {
        set({ loading: true, error: null })
        try {
          await api.createInstanceDockerContainer(instanceId, input)
          await Promise.all([get().fetchInstances(), get().fetchInstancesStatus(true)])
          await get().fetchAllServerContainers()
          set({ selectedInstanceId: instanceId, loading: false })
          return true
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
          return false
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

      discoverCurrentInstanceContainers: async (instanceId, containerName) => {
        set({ loading: true, error: null })
        try {
          const result = await api.discoverInstanceDockerContainers(instanceId, containerName)
          set({ currentDockerContainers: result.containers })
          await get().fetchInstances()
          await Promise.all([
            get().fetchCurrentInstanceStatus(instanceId, true),
            get().fetchCurrentInstanceMappings(instanceId),
            get().fetchCurrentInstanceConfig(instanceId),
            get().fetchCurrentInstanceLogs(instanceId),
          ])
          set({ loading: false })
        } catch (error) {
          set({ error: (error as Error).message, loading: false })
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
