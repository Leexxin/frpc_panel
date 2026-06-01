
import { create } from 'zustand'
import { PortMapping, ServiceStatus, ConfigFile, FrpcConfig, LogEntry } from '../../shared/types'
import { api } from '../lib/api'

interface FrpcStore {
  status: ServiceStatus | null
  mappings: PortMapping[]
  config: ConfigFile | null
  panelConfig: FrpcConfig | null
  logs: LogEntry[]
  dockerContainers: { name: string; image: string; status: string }[]
  loading: boolean
  error: string | null

  fetchStatus: () => Promise<void>
  fetchMappings: () => Promise<void>
  fetchConfig: () => Promise<void>
  fetchPanelConfig: () => Promise<void>
  fetchLogs: () => Promise<void>
  fetchDockerContainers: () => Promise<void>

  startService: () => Promise<void>
  stopService: () => Promise<void>
  restartService: () => Promise<void>

  addMapping: (mapping: Omit<PortMapping, 'status'>) => Promise<void>
  updateMapping: (id: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>) => Promise<void>
  deleteMapping: (id: string) => Promise<void>

  saveConfig: (content: string) => Promise<void>
  savePanelConfig: (config: Partial<FrpcConfig>) => Promise<void>
  detectConfig: () => Promise<void>
  clearLogs: () => Promise<void>

  clearError: () => void
}

export const useFrpcStore = create<FrpcStore>((set, get) => ({
  status: null,
  mappings: [],
  config: null,
  panelConfig: null,
  logs: [],
  dockerContainers: [],
  loading: false,
  error: null,

  fetchStatus: async () => {
    set({ loading: true, error: null })
    try {
      const status = await api.getStatus()
      set({ status, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  fetchMappings: async () => {
    set({ loading: true, error: null })
    try {
      const mappings = await api.getMappings()
      set({ mappings, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  fetchConfig: async () => {
    set({ loading: true, error: null })
    try {
      const config = await api.getConfig()
      set({ config, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  fetchPanelConfig: async () => {
    set({ loading: true, error: null })
    try {
      const panelConfig = await api.getPanelConfig()
      set({ panelConfig, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  fetchLogs: async () => {
    try {
      const logs = await api.getLogs()
      set({ logs })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  fetchDockerContainers: async () => {
    try {
      const containers = await api.getDockerContainers()
      set({ dockerContainers: containers })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  startService: async () => {
    set({ loading: true, error: null })
    try {
      await api.startService()
      await get().fetchStatus()
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  stopService: async () => {
    set({ loading: true, error: null })
    try {
      await api.stopService()
      await get().fetchStatus()
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  restartService: async () => {
    set({ loading: true, error: null })
    try {
      await api.restartService()
      await get().fetchStatus()
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  addMapping: async (mapping) => {
    set({ loading: true, error: null })
    try {
      await api.addMapping(mapping)
      await get().fetchMappings()
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  updateMapping: async (id, mapping) => {
    set({ loading: true, error: null })
    try {
      await api.updateMapping(id, mapping)
      await get().fetchMappings()
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  deleteMapping: async (id) => {
    set({ loading: true, error: null })
    try {
      await api.deleteMapping(id)
      await get().fetchMappings()
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  saveConfig: async (content) => {
    set({ loading: true, error: null })
    try {
      await api.saveConfig(content)
      await get().fetchConfig()
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  savePanelConfig: async (config) => {
    set({ loading: true, error: null })
    try {
      await api.setPanelConfig(config)
      await get().fetchPanelConfig()
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  detectConfig: async () => {
    set({ loading: true, error: null })
    try {
      await api.detectConfig()
      await get().fetchPanelConfig()
      set({ loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  clearLogs: async () => {
    try {
      await api.clearLogs()
      set({ logs: [] })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  clearError: () => set({ error: null }),
}))
