
import { PortMapping, ServiceStatus, ConfigFile, ApiResponse, FrpcConfig, LogEntry } from '../../shared/types'

const API_BASE = '/api'

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  const data: ApiResponse<T> = await response.json()

  if (!data.success) {
    throw new Error(data.error || 'Request failed')
  }

  return data.data as T
}

export const api = {
  getStatus: () => request<ServiceStatus>('/status'),
  startService: () => request<{ message: string }>('/service/start', { method: 'POST' }),
  stopService: () => request<{ message: string }>('/service/stop', { method: 'POST' }),
  restartService: () => request<{ message: string }>('/service/restart', { method: 'POST' }),

  getPanelConfig: () => request<FrpcConfig>('/config/panel'),
  setPanelConfig: (config: Partial<FrpcConfig>) => request<{ message: string }>('/config/panel', {
    method: 'PUT',
    body: JSON.stringify(config)
  }),
  detectConfig: () => request<{ frpcPath?: string; dockerContainer?: string }>('/config/detect', { method: 'POST' }),
  getDockerContainers: () => request<{ name: string; image: string; status: string }[]>('/docker/containers'),

  getLogs: (lines: number = 100) => request<LogEntry[]>(`/logs?lines=${lines}`),
  clearLogs: () => request<{ message: string }>('/logs', { method: 'DELETE' }),

  getMappings: () => request<PortMapping[]>('/mappings'),
  addMapping: (mapping: Omit<PortMapping, 'status'>) =>
    request<{ message: string }>('/mappings', {
      method: 'POST',
      body: JSON.stringify(mapping),
    }),
  updateMapping: (id: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>) =>
    request<{ message: string }>(`/mappings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(mapping),
    }),
  deleteMapping: (id: string) =>
    request<{ message: string }>(`/mappings/${id}`, { method: 'DELETE' }),

  getConfig: () => request<ConfigFile>('/config'),
  saveConfig: (content: string) =>
    request<{ message: string }>('/config', {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
}
